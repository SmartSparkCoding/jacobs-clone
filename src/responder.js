'use strict';

const { WebClient } = require('@slack/web-api');

const OWNER_USER_ID = process.env.SLACK_USER_ID;
const userClient = new WebClient(process.env.SLACK_USER_TOKEN);

const timers = new Map(); // pending pid -> Timeout handle
const EXPIRY_MAX_MS = 3 * 24 * 60 * 60 * 1000; // hard cap: 3 days

// ---- matching ----

function matches(responder, event) {
  if (!responder || responder.status !== 'active') return false;
  if (responder.expiresAt && Date.now() > responder.expiresAt) return false;
  if (event.channel !== responder.channelId) return false;
  if (event.user === OWNER_USER_ID) return false; // never reply to our own posts
  if (event.bot_id) return false; // never reply to other bots
  if (event.subtype) return false; // skip edits/deletes/joins/leaves/etc
  if (responder.mode === 'threads' && !event.thread_ts) return false;
  if (!event.text) return false;
  return true;
}

function handleMessage(store, event) {
  for (const responder of store.listResponders()) {
    if (!matches(responder, event)) continue;

    const replyAt = Date.now() + (Number(responder.delaySec) || 0) * 1000;
    if (responder.expiresAt && replyAt > responder.expiresAt) continue; // would expire before we reply

    const pid = `${responder.id}:${event.ts}`;
    const pending = {
      pid,
      responderId: responder.id,
      channelId: event.channel,
      threadTs: event.thread_ts || null,
      replyAt,
      createdAt: Date.now(),
    };
    store.addPending(pending);
    schedule(store, pending);
    console.log(
      `responder ${responder.id}: scheduled reply for user ${event.user} at ${new Date(replyAt).toISOString()}`,
    );
  }
}

// ---- scheduling ----

function schedule(store, pending) {
  clearTimeout(timers.get(pending.pid));
  const wait = Math.max(0, pending.replyAt - Date.now());
  const handle = setTimeout(() => fire(store, pending), wait);
  timers.set(pending.pid, handle);
}

async function fire(store, pending) {
  timers.delete(pending.pid);
  store.removePending(pending.pid);

  const responder = store.getResponder(pending.responderId);
  if (!responder) return;
  if (responder.status !== 'active') return;
  if (responder.expiresAt && Date.now() > responder.expiresAt) {
    store.updateResponder(responder.id, { status: 'expired' });
    return;
  }

  try {
    const res = await userClient.chat.postMessage({
      channel: pending.channelId,
      text: responder.text,
      as_user: true, // post as the owning user (works with a user token)
      thread_ts: pending.threadTs || undefined,
      link_names: true,
      unfurl_links: true,
      unfurl_media: true,
    });
    console.log(`responder ${responder.id}: sent reply ts=${res.ts}`);
  } catch (err) {
    console.error(
      `responder ${responder.id}: failed to send reply:`,
      (err.data && err.data.error) || err.message,
    );
  }
}

// Re-arm all persisted pending replies (e.g. after a restart).
function rescheduleAll(store) {
  for (const pending of store.listPending()) {
    schedule(store, pending);
  }
}

// Every 60s: mark responders as expired and drop their stale pending jobs.
function startSweeper(store) {
  setInterval(() => {
    const now = Date.now();
    for (const responder of store.listResponders()) {
      if (responder.status === 'active' && responder.expiresAt && now > responder.expiresAt) {
        store.updateResponder(responder.id, { status: 'expired' });
        store.prunePendingFor(responder.id);
        console.log(`responder ${responder.id}: expired`);
      }
    }
  }, 60 * 1000);
}

module.exports = {
  handleMessage,
  rescheduleAll,
  startSweeper,
  userClient,
  EXPIRY_MAX_MS,
};
