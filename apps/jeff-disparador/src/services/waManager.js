'use strict';
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const { db, TOTAL_SLOTS } = require('../db');

const SESSIONS_DIR = path.join(__dirname, '..', '..', 'sessions');

// Map<slot, Client>
const clients = new Map();
// Map<slot, 'idle'|'connecting'|'qr'|'ready'|'disconnected'>
const runtimeStatus = new Map();

function setSlotStatus(slot, status, extra = {}) {
  const now = new Date().toISOString();
  const fields = ['status = ?', 'updated_at = ?'];
  const values = [status, now];
  if (extra.qr !== undefined) { fields.push('last_qr = ?', 'last_qr_at = ?'); values.push(extra.qr, now); }
  if (status === 'ready') { fields.push('ready_at = ?'); values.push(now); }
  if (extra.phone !== undefined) { fields.push('phone = ?'); values.push(extra.phone); }
  db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE slot = ?`).run(...values, slot);
  runtimeStatus.set(slot, status);
}

function connectSlot(slot) {
  if (clients.has(slot)) {
    const st = runtimeStatus.get(slot);
    if (st === 'connecting' || st === 'qr' || st === 'ready') return;
    // destroy stale client
    try { clients.get(slot).destroy(); } catch {}
    clients.delete(slot);
  }

  setSlotStatus(slot, 'connecting');

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `slot-${slot}`,
      dataPath: SESSIONS_DIR,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  });

  client.on('qr', (qr) => {
    // store raw qr string; frontend will render via qrcode.js
    setSlotStatus(slot, 'qr', { qr });
  });

  client.on('ready', async () => {
    let phone = null;
    try { phone = client.info && client.info.wid && client.info.wid.user; } catch {}
    setSlotStatus(slot, 'ready', { phone });
  });

  client.on('disconnected', (reason) => {
    setSlotStatus(slot, 'disconnected');
    clients.delete(slot);
  });

  client.on('auth_failure', () => {
    setSlotStatus(slot, 'idle');
    clients.delete(slot);
  });

  client.initialize();
  clients.set(slot, client);
}

async function disconnectSlot(slot) {
  const client = clients.get(slot);
  if (client) {
    try { await client.logout(); } catch {}
    try { await client.destroy(); } catch {}
    clients.delete(slot);
  }
  setSlotStatus(slot, 'idle');
  db.prepare('UPDATE agents SET phone = NULL, last_qr = NULL, last_qr_at = NULL, ready_at = NULL WHERE slot = ?').run(slot);
}

function getClient(slot) {
  const st = runtimeStatus.get(slot);
  if (st !== 'ready') return null;
  return clients.get(slot) || null;
}

function isReady(slot) {
  return runtimeStatus.get(slot) === 'ready';
}

async function sendText(slot, phone, message) {
  const client = getClient(slot);
  if (!client) throw new Error(`slot ${slot} not ready`);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  await client.sendMessage(chatId, message);
}

// Reconnect on startup for slots that were ready before
function restoreSlots() {
  const readySlots = db.prepare("SELECT slot FROM agents WHERE status = 'ready'").all();
  for (const { slot } of readySlots) {
    setSlotStatus(slot, 'connecting');
    connectSlot(slot);
  }
}

module.exports = { connectSlot, disconnectSlot, getClient, isReady, sendText, restoreSlots, clients, runtimeStatus };
