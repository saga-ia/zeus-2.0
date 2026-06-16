const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { asyncRoute, HttpError } = require('../utils/errors');
const apiReply = require('../agent/api-reply');
const { digits, last9 } = require('../utils/jid');

const router = express.Router();

router.get('/queue', (req, res) => {
  const queue = req.app.locals.queue;
  const counts = queue.counts();
  const recent = db
    .prepare(
      `SELECT id, chat_id, kind, status, priority, retry_count, created_at, sent_at, error
       FROM send_queue ORDER BY id DESC LIMIT 50`
    )
    .all();
  res.json({ counts, recent });
});

router.post(
  '/queue/flush',
  asyncRoute(async (req, res) => {
    const r = req.app.locals.queue.flush();
    res.json({ ok: true, updated: r.changes });
  })
);

router.get('/messages', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  const rows = db
    .prepare(
      `SELECT id, message_id, chat_id, direction, type, body, from_me, author_name, ack, timestamp
       FROM messages ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
  res.json({ messages: rows });
});

router.get('/stats', (req, res) => {
  const queueCounts = req.app.locals.queue.counts();
  const msgCount = db.prepare(`SELECT COUNT(*) AS n FROM messages`).get().n;
  const chatCount = db.prepare(`SELECT COUNT(*) AS n FROM chats`).get().n;
  const webhookCount = db.prepare(`SELECT COUNT(*) AS n FROM webhooks WHERE active = 1`).get().n;
  res.json({
    queue: queueCounts,
    totals: { messages: msgCount, chats: chatCount, webhooksActive: webhookCount },
    wa: req.app.locals.wa.snapshot(),
    uptimeSec: Math.round(process.uptime()),
  });
});

// ========== Fase 2: controle das respostas automáticas via API ==========

function normalizePhone(input) {
  if (!input) return null;
  const raw = String(input).trim();
  // aceita phone puro, @c.us ou @lid (últimos nesse caso: resolvemos via contact_aliases)
  if (raw.endsWith('@c.us')) {
    const d = digits(raw.split('@')[0]);
    return d || null;
  }
  if (raw.endsWith('@lid')) {
    const row = db.prepare(`SELECT phone FROM contact_aliases WHERE lid = ?`).get(raw);
    return row?.phone || null;
  }
  const d = digits(raw);
  return d || null;
}

router.get('/api-replies/status', (_req, res) => {
  res.json(apiReply.statusSnapshot());
});

router.get('/api-replies/log', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  res.json({ log: apiReply.recentLog(limit) });
});

const panicSchema = z.object({ enabled: z.boolean() });
router.post(
  '/api-replies/panic',
  asyncRoute(async (req, res) => {
    const { enabled } = panicSchema.parse(req.body);
    apiReply.setPanic(enabled);
    res.json({ ok: true, panic: apiReply.isPanicOn() });
  })
);

const contactSchema = z.object({
  phone: z.string().min(1),
  enabled: z.boolean(),
  notes: z.string().max(500).optional(),
});
router.post(
  '/api-replies/contact',
  asyncRoute(async (req, res) => {
    const { phone, enabled, notes } = contactSchema.parse(req.body);
    const p = normalizePhone(phone);
    if (!p) throw new HttpError(400, 'invalid_phone');
    apiReply.setContactEnabled(p, enabled, { notes, set_by: req.auth?.type || 'admin' });
    res.json({ ok: true, phone: p, enabled, notes: notes || null });
  })
);

const settingSchema = z.object({
  key: z.enum(['api_reply_model', 'api_reply_max_tokens', 'api_reply_history_limit']),
  value: z.string().min(1).max(200),
});
router.post(
  '/api-replies/setting',
  asyncRoute(async (req, res) => {
    const { key, value } = settingSchema.parse(req.body);
    apiReply.setSetting(key, value);
    res.json({ ok: true, key, value });
  })
);

// ========== Campanha PQV de indicações ==========

const pqvActiveSchema = z.object({ enabled: z.boolean() });
router.post(
  '/pqv/active',
  asyncRoute(async (req, res) => {
    const { enabled } = pqvActiveSchema.parse(req.body);
    apiReply.setPqvActive(enabled);
    res.json({ ok: true, pqv_campaign_active: apiReply.isPqvActive() });
  })
);

router.get('/pqv/ranking', (req, res) => {
  const campaign = typeof req.query.campaign === 'string' ? req.query.campaign : 'pqv';
  const ranking = apiReply.pqvRanking(campaign);
  res.json({ campaign, ranking });
});

router.get('/pqv/referrals', (req, res) => {
  const campaign = typeof req.query.campaign === 'string' ? req.query.campaign : 'pqv';
  const limit = Math.min(Number(req.query.limit || 500), 2000);
  const rows = db
    .prepare(
      `SELECT id, referrer_phone, referrer_name, referrer_email,
              referred_name, referred_phone, referred_email,
              source_message_id, notes, created_at
       FROM pqv_referrals
       WHERE campaign = ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(campaign, limit);
  res.json({ campaign, count: rows.length, referrals: rows });
});

module.exports = router;
