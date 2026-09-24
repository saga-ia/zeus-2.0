'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { sendText } = require('../services/waManager');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const slot = req.query.slot ? parseInt(req.query.slot, 10) : null;
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 300);
  const q = slot
    ? db.prepare(`SELECT c.*, s.name AS sdr_name FROM conversations c
                  JOIN sdrs s ON s.slot = c.slot
                  WHERE c.slot = ? ORDER BY c.last_ts DESC LIMIT ?`).all(slot, limit)
    : db.prepare(`SELECT c.*, s.name AS sdr_name FROM conversations c
                  JOIN sdrs s ON s.slot = c.slot
                  ORDER BY c.last_ts DESC LIMIT ?`).all(limit);
  res.json({ conversations: q });
});

router.get('/messages', (req, res) => {
  const slot = parseInt(req.query.slot, 10);
  const chatId = String(req.query.chat_id || '');
  const limit = Math.min(parseInt(req.query.limit || '80', 10), 300);
  if (!slot || !chatId) return res.status(400).json({ error: 'missing_params' });
  const rows = db.prepare(`SELECT id, from_me, body, ts, type FROM messages
                           WHERE slot = ? AND chat_id = ? ORDER BY ts DESC LIMIT ?`).all(slot, chatId, limit);
  res.json({ messages: rows.reverse() });
});

router.post('/mark-read', (req, res) => {
  const { slot, chat_id } = req.body || {};
  if (!slot || !chat_id) return res.status(400).json({ error: 'missing_params' });
  db.prepare('UPDATE conversations SET unread = 0 WHERE slot = ? AND chat_id = ?').run(slot, chat_id);
  res.json({ ok: true });
});

router.post('/reply', async (req, res) => {
  const { slot, chat_id, body } = req.body || {};
  if (!slot || !chat_id || !body) return res.status(400).json({ error: 'missing_params' });
  try {
    await sendText(slot, chat_id, String(body));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
