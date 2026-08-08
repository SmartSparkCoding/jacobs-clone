'use strict';

require('dotenv').config();

const { App, LogLevel } = require('@slack/bolt');

const store = require('./store');
const responder = require('./responder');
const views = require('./views');

const OWNER_USER_ID = process.env.SLACK_USER_ID;

const REQUIRED_ENV = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_USER_TOKEN', 'SLACK_USER_ID'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in environment/.env — refusing to start.`);
    process.exit(1);
  }
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

const isOwner = (userId) => userId === OWNER_USER_ID;

async function publishHome(client, userId) {
  if (!isOwner(userId)) return;
  await client.views.publish({ user_id: userId, view: views.homeView(store.listResponders()) });
}

async function resolveChannelName(channelId) {
  try {
    const res = await responder.userClient.conversations.info({ channel: channelId });
    const c = res.channel;
    if (c.is_private) return c.name;
    return c.name;
  } catch (err) {
    console.error('could not resolve channel name:', (err.data && err.data.error) || err.message);
    return channelId;
  }
}

// ---- App Home ----

app.event('app_home_opened', async ({ event, client }) => {
  if (!isOwner(event.user)) {
    await client.views.publish({ user_id: event.user, view: views.notAuthorizedView() });
    return;
  }
  await publishHome(client, event.user);
});

// ---- Buttons on the home tab ----

app.action('create_responder', async ({ ack, body, client }) => {
  await ack();
  if (!isOwner(body.user.id)) return;
  await client.views.open({ trigger_id: body.trigger_id, view: views.responderModal(null) });
});

app.action('edit_responder', async ({ ack, body, client }) => {
  await ack();
  if (!isOwner(body.user.id)) return;
  const responder = store.getResponder(body.actions[0].value);
  if (!responder) return;
  await client.views.open({ trigger_id: body.trigger_id, view: views.responderModal(responder) });
});

app.action('toggle_responder', async ({ ack, body, client }) => {
  await ack();
  if (!isOwner(body.user.id)) return;
  const existing = store.getResponder(body.actions[0].value);
  if (!existing) return;
  const next = existing.status === 'paused' ? 'active' : 'paused';
  store.updateResponder(existing.id, { status: next });
  await publishHome(client, body.user.id);
});

app.action('delete_responder', async ({ ack, body, client }) => {
  await ack();
  if (!isOwner(body.user.id)) return;
  store.deleteResponder(body.actions[0].value);
  await publishHome(client, body.user.id);
});

// ---- Modal submissions ----

function validateAndAck(ack, data) {
  if (data.channelId && data.text && data.text.trim()) return true;
  const errors = {};
  if (!data.channelId) errors.channel_block = 'Pick a channel to watch.';
  if (!data.text || !data.text.trim()) errors.text_block = 'Reply text is required.';
  ack({ response_action: 'errors', errors });
  return false;
}

app.view('create_responder_modal', async ({ ack, body, view, client }) => {
  const data = views.parseSubmission(view.state);
  if (!validateAndAck(ack, data)) return;

  const expiresAt = Date.now() + data.expirySec * 1000;
  store.addResponder({
    name: data.name,
    channelId: data.channelId,
    channelName: await resolveChannelName(data.channelId),
    mode: data.mode,
    delaySec: data.delaySec,
    text: data.text.trim(),
    expiresAt,
  });

  await ack();
  await publishHome(client, body.user.id);
});

app.view('edit_responder_modal', async ({ ack, body, view, client }) => {
  const existing = store.getResponder(view.private_metadata);
  if (!existing) {
    await ack();
    return;
  }
  const data = views.parseSubmission(view.state);
  if (!validateAndAck(ack, data)) return;

  const expiresAt = Date.now() + data.expirySec * 1000;
  store.updateResponder(existing.id, {
    name: data.name,
    channelId: data.channelId,
    channelName: await resolveChannelName(data.channelId),
    mode: data.mode,
    delaySec: data.delaySec,
    text: data.text.trim(),
    expiresAt,
    status: existing.status === 'expired' ? 'active' : existing.status,
  });

  await ack();
  await publishHome(client, body.user.id);
});

// ---- Message listener (the auto-responder engine) ----

app.message(async ({ event }) => {
  responder.handleMessage(store, event);
});

// ---- Boot ----

responder.startSweeper(store);
responder.rescheduleAll(store);

(async () => {
  await app.start();
  console.log(`Jacob's Clone is running. Owner: ${OWNER_USER_ID}`);
})();
