'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/config', (req, res) => {
  const cfg = db.prepare('SELECT * FROM maturation_config WHERE id = 1').get();
  const statuses = db.prepare('SELECT * FROM maturation_status').all();
  res.json({ config: cfg, statuses });
});

router.put('/config', (req, res) => {
  const { enabled, min_turns, max_turns, min_delay_seconds, max_delay_seconds, daily_max_sessions } = req.body || {};
  db.prepare(`UPDATE maturation_config SET
    enabled = COALESCE(?, enabled),
    min_turns = COALESCE(?, min_turns),
    max_turns = COALESCE(?, max_turns),
    min_delay_seconds = COALESCE(?, min_delay_seconds),
    max_delay_seconds = COALESCE(?, max_delay_seconds),
    daily_max_sessions = COALESCE(?, daily_max_sessions),
    updated_at = ? WHERE id = 1`)
    .run(
      enabled != null ? (enabled ? 1 : 0) : null,
      min_turns != null ? parseInt(min_turns, 10) : null,
      max_turns != null ? parseInt(max_turns, 10) : null,
      min_delay_seconds != null ? parseInt(min_delay_seconds, 10) : null,
      max_delay_seconds != null ? parseInt(max_delay_seconds, 10) : null,
      daily_max_sessions != null ? parseInt(daily_max_sessions, 10) : null,
      new Date().toISOString()
    );
  res.json({ ok: true });
});

router.post('/slot/:slot', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { enabled } = req.body || {};
  db.prepare(`INSERT INTO maturation_status (slot, enabled) VALUES (?, ?)
              ON CONFLICT(slot) DO UPDATE SET enabled = excluded.enabled`)
    .run(slot, enabled ? 1 : 0);
  res.json({ ok: true });
});

router.get('/sessions', (req, res) => {
  const rows = db.prepare('SELECT * FROM maturation_session ORDER BY id DESC LIMIT 50').all();
  res.json({ sessions: rows });
});

router.get('/log', (req, res) => {
  const sessionId = req.query.session_id ? parseInt(req.query.session_id, 10) : null;
  const rows = sessionId
    ? db.prepare('SELECT * FROM maturation_log WHERE session_id = ? ORDER BY id DESC LIMIT 200').all(sessionId)
    : db.prepare('SELECT * FROM maturation_log ORDER BY id DESC LIMIT 200').all();
  res.json({ log: rows });
});

module.exports = router;
