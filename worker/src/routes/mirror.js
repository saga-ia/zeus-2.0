const path = require('node:path');
const express = require('express');
const { db } = require('../db');

const router = express.Router();
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function getMirrorToken() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key='mirror_token'").get();
  return row ? row.value : null;
}

// Serve mirror page (no auth — token in query)
router.get('/', (req, res) => {
  const token = req.query.token || '';
  const valid = getMirrorToken();
  if (!valid || token !== valid) {
    return res.status(403).send('Acesso negado. Use o link completo com ?token=...');
  }
  res.sendFile(path.join(PUBLIC_DIR, 'mirror.html'));
});

// API: return messages for a phone, optionally since a given id
router.get('/messages', (req, res) => {
  const token = req.query.token || '';
  const valid = getMirrorToken();
  if (!valid || token !== valid) return res.status(403).json({ error: 'forbidden' });

  const phone = (req.query.phone || '5511910075450').replace(/\D/g, '');
  const limit  = Math.min(parseInt(req.query.limit || '60', 10), 200);
  const since  = parseInt(req.query.since || '0', 10);

  let rows;
  if (since > 0) {
    rows = db.prepare(`
      SELECT m.id, m.contact_phone, m.from_me, m.type, m.body, m.transcription,
             m.transcription_status, m.timestamp
      FROM messages m
      WHERE m.contact_phone = ?
        AND m.id > ?
      ORDER BY m.timestamp ASC
      LIMIT ?
    `).all(phone, since, limit);
  } else {
    // Initial load: return last N messages ordered ascending
    rows = db.prepare(`
      SELECT id, contact_phone, from_me, type, body, transcription, transcription_status, timestamp
      FROM (
        SELECT id, contact_phone, from_me, type, body, transcription, transcription_status, timestamp
        FROM messages
        WHERE contact_phone = ?
        ORDER BY timestamp DESC
        LIMIT ?
      ) sub
      ORDER BY timestamp ASC
    `).all(phone, limit);
  }

  const alias = db.prepare("SELECT name FROM contact_aliases WHERE phone = ? LIMIT 1").get(phone);
  const total = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE contact_phone = ?").get(phone);

  res.json({
    messages: rows,
    contact_name: alias ? alias.name : null,
    total: total ? total.c : 0,
  });
});

module.exports = router;
