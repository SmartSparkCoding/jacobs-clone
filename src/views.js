'use strict';

// Human-readable duration from ms
function fmtDur(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  if (secs || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

function fmtRemaining(responder) {
  const rem = responder.expiresAt - Date.now();
  if (rem <= 0) return 'expired';
  return fmtDur(rem);
}

const MODE_OPTIONS = [
  { value: 'all', label: 'Any message in the channel' },
  { value: 'threads', label: 'Thread replies only' },
];

const DELAY_OPTIONS = [
  { value: '0', label: 'Immediately' },
  { value: '15', label: '15 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '300', label: '5 minutes' },
  { value: '900', label: '15 minutes' },
  { value: '3600', label: '1 hour' },
];

const EXPIRY_OPTIONS = [
  { value: '1800', label: '30 minutes' },
  { value: '3600', label: '1 hour' },
  { value: '10800', label: '3 hours' },
  { value: '21600', label: '6 hours' },
  { value: '43200', label: '12 hours' },
  { value: '86400', label: '1 day' },
  { value: '172800', label: '2 days' },
  { value: '259200', label: '3 days (max)' },
];

function toSelectOption({ value, label }) {
  return { text: { type: 'plain_text', text: label }, value };
}

// ---- App Home ----

function homeView(responders) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: "Jacob's Clone" },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*The auto-responder that has your back.*\n' +
          'Set a canned reply, a wait time and an expiry. When someone messages a channel ' +
          'or group DM you watch, I wait, then reply *as you*. :robot_face:',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: ':heavy_plus_sign: Create auto-responder' },
          action_id: 'create_responder',
          style: 'primary',
        },
      ],
    },
    { type: 'divider' },
  ];

  if (responders.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'No auto-responders yet. Hit *Create auto-responder* to set one up.',
      },
    });
  }

  for (const r of responders) {
    const statusEmoji =
      r.status === 'active' ? ':green_circle:' : r.status === 'paused' ? ':yellow_circle:' : ':red_circle:';
    const modeText = r.mode === 'threads' ? 'thread replies only' : 'any message';
    const expiryText = r.status === 'expired' ? 'expired' : `expires in ${fmtRemaining(r)}`;

    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${r.name}*  ${statusEmoji}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text:
              `#${r.channelName} · triggers on ${modeText} · waits ${fmtDur((r.delaySec || 0) * 1000)} · ` +
              `${expiryText}\n>${r.text.slice(0, 200)}${r.text.length > 200 ? '…' : ''}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: ':pencil2: Edit' },
            action_id: 'edit_responder',
            value: r.id,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: r.status === 'paused' ? ':arrow_forward: Resume' : ':pause_button: Pause',
            },
            action_id: 'toggle_responder',
            value: r.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: ':x: Delete' },
            action_id: 'delete_responder',
            value: r.id,
            style: 'danger',
            confirm: {
              title: { type: 'plain_text', text: 'Delete responder?' },
              text: { type: 'mrkdwn', text: `Delete *${r.name}* for good?` },
              confirm: { type: 'plain_text', text: 'Delete' },
              deny: { type: 'plain_text', text: 'Cancel' },
              style: 'danger',
            },
          },
        ],
      },
      { type: 'divider' },
    );
  }

  return { type: 'home', blocks };
}

function notAuthorizedView() {
  return {
    type: 'home',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':lock: This app is personal to the person who installed it. Nice try, though. :wink:',
        },
      },
    ],
  };
}

// ---- Create / Edit modal ----

function responderModal(existing) {
  const isEdit = Boolean(existing);

  const channelElement = {
    type: 'conversations_select',
    action_id: 'channel',
    filter: { include: ['public_channel', 'private_channel', 'mpim'] },
    placeholder: { type: 'plain_text', text: 'Pick a channel or group DM to watch' },
  };
  if (isEdit) channelElement.initial_conversation = existing.channelId;

  const modeElement = {
    type: 'static_select',
    action_id: 'mode',
    options: MODE_OPTIONS.map(toSelectOption),
  };
  if (isEdit) {
    modeElement.initial_option = toSelectOption(
      MODE_OPTIONS.find((o) => o.value === existing.mode) || MODE_OPTIONS[0],
    );
  } else {
    modeElement.initial_option = toSelectOption(MODE_OPTIONS[0]);
  }

  const delayElement = {
    type: 'static_select',
    action_id: 'delay',
    options: DELAY_OPTIONS.map(toSelectOption),
  };
  if (isEdit) {
    delayElement.initial_option = toSelectOption(
      DELAY_OPTIONS.find((o) => o.value === String(existing.delaySec)) || DELAY_OPTIONS[2],
    );
  } else {
    delayElement.initial_option = toSelectOption(DELAY_OPTIONS[2]); // default 30s
  }

  const expiryElement = {
    type: 'static_select',
    action_id: 'expiry',
    options: EXPIRY_OPTIONS.map(toSelectOption),
  };
  const defaultExpiry = EXPIRY_OPTIONS[5]; // 1 day
  if (isEdit) {
    const durationSec = Math.round((existing.expiresAt - Date.now()) / 1000);
    expiryElement.initial_option = toSelectOption(
      EXPIRY_OPTIONS.find((o) => o.value === String(durationSec)) || defaultExpiry,
    );
  } else {
    expiryElement.initial_option = toSelectOption(defaultExpiry);
  }

  return {
    type: 'modal',
    callback_id: isEdit ? 'edit_responder_modal' : 'create_responder_modal',
    private_metadata: isEdit ? existing.id : '',
    title: { type: 'plain_text', text: isEdit ? 'Edit auto-responder' : 'New auto-responder' },
    submit: { type: 'plain_text', text: isEdit ? 'Save' : 'Create' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'name_block',
        element: {
          type: 'plain_text_input',
          action_id: 'name',
          initial_value: isEdit ? existing.name : '',
          placeholder: { type: 'plain_text', text: 'e.g. Away at the beach' },
        },
        label: { type: 'plain_text', text: 'Name (optional)' },
        optional: true,
      },
      {
        type: 'input',
        block_id: 'channel_block',
        element: channelElement,
        label: { type: 'plain_text', text: 'Conversation to watch' },
        hint: {
          type: 'plain_text',
          text: 'A channel, or a group DM with 3+ people (you, them + the bot). Slack does NOT allow apps in 1:1 DMs between people — group DMs are the way around it.',
        },
      },
      {
        type: 'input',
        block_id: 'mode_block',
        element: modeElement,
        label: { type: 'plain_text', text: 'When to trigger' },
      },
      {
        type: 'input',
        block_id: 'delay_block',
        element: delayElement,
        label: { type: 'plain_text', text: 'Wait before replying' },
      },
      {
        type: 'input',
        block_id: 'text_block',
        element: {
          type: 'plain_text_input',
          action_id: 'text',
          multiline: true,
          initial_value: isEdit ? existing.text : '',
          placeholder: {
            type: 'plain_text',
            text: "Hey! I'm away right now, I'll get back to you soon. :wave: <https://example.com|my site>",
          },
        },
        label: { type: 'plain_text', text: 'Reply text' },
        hint: {
          type: 'plain_text',
          text: 'Slack formatting works: *bold*, _italic_, `code`, :emoji:, <https://link|label>',
        },
      },
      {
        type: 'input',
        block_id: 'expiry_block',
        element: expiryElement,
        label: { type: 'plain_text', text: 'Expiry (max 3 days)' },
        hint: { type: 'plain_text', text: 'Auto-responder stops after this. Resets to now + duration when you save.' },
      },
    ],
  };
}

// ---- Extract values from a modal submission ----

function parseSubmission(state) {
  const get = (blockId, actionId) => (state.values[blockId] || {})[actionId];
  const channel = get('channel_block', 'channel');
  const mode = get('mode_block', 'mode');
  const delay = get('delay_block', 'delay');
  const text = get('text_block', 'text');
  const name = get('name_block', 'name');
  const expiry = get('expiry_block', 'expiry');

  return {
    channelId: channel && channel.selected_conversation,
    mode: mode ? mode.selected_option.value : 'all',
    delaySec: delay ? Number(delay.selected_option.value) : 0,
    text: text ? text.value : '',
    name: name && name.value ? name.value.trim() : '',
    expirySec: expiry ? Number(expiry.selected_option.value) : 0,
  };
}

module.exports = {
  homeView,
  notAuthorizedView,
  responderModal,
  parseSubmission,
};
