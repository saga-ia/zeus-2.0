// Blueprint-style endpoints (/send-message, /send-media, /send-audio) for external integrations.
// They are shortcuts over the same queue; accept raw base64 payloads.

const express = require('express');
const { z } = require('zod');
const { asyncRoute, HttpError } = require('../utils/errors');
const { toPrivateJid, toGroupJid } = require('../utils/jid');

const router = express.Router();

const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  message: z.string().min(1).max(10000),
  typingMs: z.number().int().min(0).max(30000).optional(),
  priority: z.number().int().min(1).max(9).optional(),
});

function normalizeChat(chatId) {
  if (chatId.endsWith('@g.us')) return toGroupJid(chatId);
  if (chatId.endsWith('@c.us') || chatId.endsWith('@lid')) return chatId;
  return toPrivateJid(chatId);
}

router.post(
  '/send-message',
  asyncRoute(async (req, res) => {
    const { chatId, message, priority } = sendMessageSchema.parse(req.body);
    const jid = normalizeChat(chatId);
    if (!jid) throw new HttpError(400, 'invalid_chatId');
    const r = await req.app.locals.queue.enqueue({
      chat_id: jid,
      kind: 'text',
      payload: { body: message },
      priority: priority ?? 5,
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ status: 'queued', queued_id: r.id });
  })
);

const mediaSchema = z.object({
  chatId: z.string().min(1),
  base64: z.string().min(1),
  mimetype: z.string().min(1),
  filename: z.string().optional(),
  caption: z.string().max(1024).optional(),
  priority: z.number().int().min(1).max(9).optional(),
});

router.post(
  '/send-media',
  asyncRoute(async (req, res) => {
    const body = mediaSchema.parse(req.body);
    const jid = normalizeChat(body.chatId);
    if (!jid) throw new HttpError(400, 'invalid_chatId');
    const r = await req.app.locals.queue.enqueue({
      chat_id: jid,
      kind: 'media',
      payload: {
        base64: body.base64,
        mimetype: body.mimetype,
        filename: body.filename,
        caption: body.caption,
      },
      priority: body.priority ?? 5,
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ status: 'queued', queued_id: r.id });
  })
);

const audioSchema = z.object({
  chatId: z.string().min(1),
  base64: z.string().min(1),
  mimetype: z.string().optional(),
  filename: z.string().optional(),
  asPtt: z.boolean().optional(),
  priority: z.number().int().min(1).max(9).optional(),
});

router.post(
  '/send-audio',
  asyncRoute(async (req, res) => {
    const body = audioSchema.parse(req.body);
    const jid = normalizeChat(body.chatId);
    if (!jid) throw new HttpError(400, 'invalid_chatId');
    const r = await req.app.locals.queue.enqueue({
      chat_id: jid,
      kind: 'audio',
      payload: {
        base64: body.base64,
        mimetype: body.mimetype || 'audio/ogg',
        filename: body.filename || 'audio.ogg',
        asPtt: body.asPtt !== false,
      },
      priority: body.priority ?? 5,
    });
    if (!r.ok) throw new HttpError(409, 'duplicate');
    res.json({ status: 'queued', queued_id: r.id });
  })
);

module.exports = router;
