const express = require('express');
const { z } = require('zod');
const { asyncRoute, HttpError } = require('../utils/errors');
const { db } = require('../db');

const router = express.Router();

const schema = z.object({
  url: z.string().url(),
  events: z.string().default('*'),
  token: z.string().optional(),
});

router.get('/', (_req, res) => {
  const rows = db.prepare(`SELECT id, url, events, active, created_at FROM webhooks ORDER BY id`).all();
  res.json({ webhooks: rows });
});

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const b = schema.parse(req.body);
    const info = db
      .prepare(`INSERT INTO webhooks (url, events, token, active) VALUES (?, ?, ?, 1)`)
      .run(b.url, b.events, b.token || null);
    res.json({ ok: true, id: info.lastInsertRowid });
  })
);

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new HttpError(400, 'invalid_id');
    db.prepare(`DELETE FROM webhooks WHERE id = ?`).run(id);
    res.json({ ok: true });
  })
);

router.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const b = z
      .object({
        active: z.boolean().optional(),
        events: z.string().optional(),
        token: z.string().nullable().optional(),
        url: z.string().url().optional(),
      })
      .parse(req.body);
    const fields = [];
    const vals = [];
    for (const k of ['active', 'events', 'token', 'url']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        vals.push(k === 'active' ? (b[k] ? 1 : 0) : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true });
    vals.push(id);
    db.prepare(`UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
  })
);

module.exports = router;
