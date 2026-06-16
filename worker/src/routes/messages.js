const express = require('express');
const { z } = require('zod');
const { asyncRoute, HttpError } = require('../utils/errors');
const { toPrivateJid, toGroupJid } = require('../utils/jid');

const router = express.Router();

const privateSchema = z.object({
  to: z.string().min(1),
  body: z.string().min(1).max(10000),
  priority: z.number().int().min(1).max(9).optional(),
  typing: z.boolean().optional(),
});

const groupSchema = z.object({
  groupId: z.string().min(1),
  body: z.string().min(1).max(10000),
  priority: z.number().int().min(1).max(9).optional(),
  typing: z.boolean().optional(),
});

router.post(
  '/private',
  asyncRoute(async (req, res) => {
    const { to, body, priority, typing } = privateSchema.parse(req.body);
    const jid = toPrivateJid(to);
    if (!jid) throw new HttpError(400, 'invalid_number');
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({ chat_id: jid, kind: 'text', payload: { body, typing }, priority: priority ?? 5 });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ ok: true, queued_id: r.id, chat_id: jid });
  })
);

router.post(
  '/group',
  asyncRoute(async (req, res) => {
    const { groupId, body, priority, typing } = groupSchema.parse(req.body);
    const jid = toGroupJid(groupId);
    if (!jid) throw new HttpError(400, 'invalid_group');
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({ chat_id: jid, kind: 'text', payload: { body, typing }, priority: priority ?? 5 });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ ok: true, queued_id: r.id, chat_id: jid });
  })
);

// Reply with quote (Fase 6)
router.post(
  '/:messageId/reply',
  asyncRoute(async (req, res) => {
    const { messageId } = req.params;
    const parse = z.object({ body: z.string().min(1).max(10000), chatId: z.string().min(1) }).parse(req.body);
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: parse.chatId,
      kind: 'reply',
      payload: { body: parse.body, quotedMessageId: messageId },
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ ok: true, queued_id: r.id });
  })
);

// React (Fase 6)
router.post(
  '/:messageId/react',
  asyncRoute(async (req, res) => {
    const { messageId } = req.params;
    const parse = z.object({ chatId: z.string().min(1), emoji: z.string().max(16) }).parse(req.body);
    const queue = req.app.locals.queue;
    const r = await queue.enqueue({
      chat_id: parse.chatId,
      kind: 'react',
      payload: { messageId, emoji: parse.emoji },
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ ok: true, queued_id: r.id });
  })
);

// Download media for a message (Fase 6)
router.get(
  '/:messageId/media',
  asyncRoute(async (req, res) => {
    const { messageId } = req.params;
    const wa = req.app.locals.wa;
    const client = wa.getClient();
    if (!client || wa.state.current !== 'ready') throw new HttpError(409, 'not_ready');
    const msg = await client.getMessageById(messageId);
    if (!msg) throw new HttpError(404, 'not_found');
    if (!msg.hasMedia) throw new HttpError(400, 'no_media');
    const media = await msg.downloadMedia();
    if (!media) throw new HttpError(500, 'download_failed');
    res.json({
      mimetype: media.mimetype,
      data: media.data,
      filename: media.filename || null,
    });
  })
);

module.exports = router;
