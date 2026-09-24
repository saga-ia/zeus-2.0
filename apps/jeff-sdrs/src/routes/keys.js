'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { encrypt, last4 } = require('../services/crypto');
const { MODELS } = require('../services/llmClient');

const router = express.Router();
router.use(requireAuth);

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

router.get('/keys', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT id, label, provider, key_last4, created_at FROM api_keys ORDER BY id DESC`).all();
  res.json({ keys: rows, models: MODELS });
});

router.post('/keys', requireAdmin, (req, res) => {
  const { label, provider, key } = req.body || {};
  const prov = String(provider || '').toLowerCase();
  if (!['anthropic', 'openai', 'gemini'].includes(prov)) return res.status(400).json({ error: 'provider_invalido' });
  const cleanKey = String(key || '').trim();
  if (!cleanKey || cleanKey.length < 12) return res.status(400).json({ error: 'chave_invalida' });
  const cleanLabel = String(label || '').trim().slice(0, 100) || `${prov}-${Date.now()}`;

  try {
    const cipher = encrypt(cleanKey);
    const l4 = last4(cleanKey);
    const info = db.prepare(`INSERT INTO api_keys (label, provider, key_cipher, key_last4, created_by) VALUES (?, ?, ?, ?, ?)`)
      .run(cleanLabel, prov, cipher, l4, req.user && req.user.id || null);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: 'encrypt_fail', detail: String(e.message || e) });
  }
});

router.delete('/keys/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT 1 FROM api_keys WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const used = db.prepare('SELECT COUNT(*) as n FROM sdrs WHERE ai_key_id = ?').get(id);
  if (used && used.n > 0) return res.status(400).json({ error: 'em_uso', slots: used.n });
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
