# Jacob's Clone — Slack auto-responder

A personal Slack app. Open its **Home tab**, create an auto-responder (channel, reply text, wait time, expiry up to 3 days), and when someone messages that channel, the app waits, then replies **as you**.

- **No admin/org install needed.** The app installs for a single workspace member with user-level scopes.
- **Only the installer can use it.** Every action is gated on the owning user ID.
- **Replies as you.** Posts use the installer's user token (`xoxp-`), so the reply appears under their name/avatar, fully editable/deletable by them.
- **Full Slack formatting** in replies: `*bold*`, `_italic_`, `` `code` ``, `:emoji:`, `<https://link|label>`.
- **Socket Mode** — no public URL or webhooks needed.

> ⚠️ **Platform limitation:** Slack apps cannot be added to 1:1 DMs *between two people*, so the app can only watch conversations it's a member of: public/private channels **and group DMs (3+ people)**.

### Replicating a "1:1 DM auto-responder"

Want it to auto-reply to a *specific person* as you? Create a **group DM** with that person (you + them + a third), then add the bot to it (group DM header → *More → Add apps*, or @mention the bot and approve the invite). The bot reads every message there and replies **as you**. It's not hidden — the person will see the bot joined — but functionally it's an auto-responder in your "DM" with them.

---

## 1. Create the Slack app (30 seconds)

1. Go to <https://api.slack.com/apps> → **Create New App** → **From an app manifest**.
2. Pick your workspace, then paste the contents of [`manifest.json`](./manifest.json) and create.
3. In the app config sidebar, go to **OAuth & Permissions** and click **Install to Workspace**, then **Allow**.
4. After install, on the same page copy three values:
   - **User OAuth Token** (`xoxp-...`)
   - **Bot User OAuth Token** (`xoxb-...`)
5. Go to **Basic Information** → **App-Level Tokens** → **Generate Token** with scope `connections:write`. Copy the token that starts with `xapp-1-`.
6. Find your user ID — the app will tell you when it boots, or run `auth.test` with the user token. It looks like `U0XXXXX`.

## 2. Configure

```bash
cp .env.example .env
```

Fill in the four values: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_USER_TOKEN`, `SLACK_USER_ID`.

## 3. Run

```bash
npm install
npm start
```

Open the app's Home tab in Slack. You'll see "Create auto-responder".

---

## How it works

| Setting | Meaning |
|---|---|
| **Conversation to watch** | Any public/private channel or **group DM (3+ people)** the bot is a member of. Add it via *Details/More → Add apps*, or @mention it in a group DM. |
| **When to trigger** | *Any message* or *thread replies only*. Replies always land in the same thread when the trigger was a thread reply. |
| **Wait** | Delay before replying (Immediately → 1 hour). Survives restarts. |
| **Reply text** | Full Slack markdown (bold, italics, code, emoji, links). |
| **Expiry** | 30 min → 3 days. Auto-responder deactivates after this. |

From the Home tab you can **pause/resume**, **edit**, and **delete** each auto-responder. Expired ones are shown until you delete them.

Never replies to: your own messages, bots, or message edits/joins/leaves.

## Deploying with systemd

```bash
sudo cp deploy/jacobs-clone.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jacobs-clone
journalctl -u jacobs-clone -f
```

Data (responders + pending replies) lives in `DATA_DIR` (default `./data`).

## Gotchas

- If you remove the bot from a channel, no events arrive — remove that responder too.
- The user token can only post where **you** can post (it's *your* identity). The bot must be a channel member to *receive* the message events.
- If the workspace enforces admin app-approval, an admin must approve the install once.
