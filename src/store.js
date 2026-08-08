'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'responders.json');

let cache = null;

function defaultData() {
  return { responders: [], pending: [] };
}

function load() {
  if (cache) return cache;
  try {
    if (fs.existsSync(DB_PATH)) {
      cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (!Array.isArray(cache.responders)) cache.responders = [];
      if (!Array.isArray(cache.pending)) cache.pending = [];
    } else {
      cache = defaultData();
    }
  } catch (err) {
    console.error('store: failed to load, starting fresh:', err.message);
    cache = defaultData();
  }
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function newId() {
  return crypto.randomBytes(3).toString('hex');
}

// ---- responders ----

function listResponders() {
  return load().responders;
}

function getResponder(id) {
  return load().responders.find((r) => r.id === id) || null;
}

function addResponder(data) {
  const db = load();
  const responder = {
    id: newId(),
    name: (data.name && data.name.trim()) || 'Untitled responder',
    channelId: data.channelId,
    channelName: data.channelName || data.channelId,
    mode: data.mode || 'all', // 'all' | 'threads'
    delaySec: Number(data.delaySec) || 0,
    text: data.text,
    expiresAt: data.expiresAt,
    createdAt: Date.now(),
    status: 'active', // active | paused | expired
  };
  db.responders.push(responder);
  save();
  return responder;
}

function updateResponder(id, patch) {
  const db = load();
  const responder = db.responders.find((r) => r.id === id);
  if (!responder) return null;
  Object.assign(responder, patch);
  save();
  return responder;
}

function deleteResponder(id) {
  const db = load();
  db.responders = db.responders.filter((r) => r.id !== id);
  db.pending = db.pending.filter((p) => p.responderId !== id);
  save();
}

// ---- pending replies (survive restarts) ----

function listPending() {
  return load().pending;
}

function addPending(item) {
  load().pending.push(item);
  save();
}

function removePending(pid) {
  const db = load();
  const before = db.pending.length;
  db.pending = db.pending.filter((p) => p.pid !== pid);
  if (db.pending.length !== before) save();
}

function prunePendingFor(responderId) {
  const db = load();
  const before = db.pending.length;
  db.pending = db.pending.filter((p) => p.responderId !== responderId);
  if (db.pending.length !== before) save();
}

module.exports = {
  listResponders,
  getResponder,
  addResponder,
  updateResponder,
  deleteResponder,
  listPending,
  addPending,
  removePending,
  prunePendingFor,
};
