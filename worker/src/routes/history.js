const express = require('express');
const { z } = require('zod');
const { asyncRoute, HttpError } = require('../utils/errors');
const { db } = require('../db');

const router = express.Router();

const historyQ = db.prepare(`
  SELECT id, message_id, chat_id, direction, type, body, has_media, from_me, author_name, ack, is_group, timestamp, created_at
  FROM messages
  WHERE chat_id = @chat_id
  ORDER BY timestamp DESC
  LIMIT @limit OFFSET @offset
`);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const parse = z
      .object({
        chatId: z.string().min(1),
        limit: z.coerce.number().int().min(1).max(500).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const rows = historyQ.all({
      chat_id: parse.chatId,
      limit: parse.limit,
      offset: parse.offset,
    });
    res.json({ messages: rows });
  })
);

router.post(
  '/fetch',
  asyncRoute(async (req, res) => {
    const parse = z
      .object({ chatId: z.string().min(1), limit: z.number().int().min(1).max(500).default(50) })
      .parse(req.body);
    const wa = req.app.locals.wa;
    const client = wa.getClient();
    if (!client || wa.state.current !== 'ready') throw new HttpError(409, 'not_ready');
    const chat = await client.getChatById(parse.chatId);
    const msgs = await chat.fetchMessages({ limit: parse.limit });
    const recorded = [];
    for (const m of msgs) {
      recorded.push({
        message_id: m.id?._serialized,
        timestamp: new Date((m.timestamp || 0) * 1000).toISOString(),
        body: m.body,
        from_me: !!m.fromMe,
      });
    }
    res.json({ fetched: recorded.length, messages: recorded });
  })
);

module.exports = router;
