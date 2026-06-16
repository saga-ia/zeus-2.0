const express = require('express');
const { asyncRoute, HttpError } = require('../utils/errors');

const router = express.Router();

router.post(
  '/restart',
  asyncRoute(async (req, res) => {
    const wa = req.app.locals.wa;
    if (!wa) throw new HttpError(503, 'wa_not_available');
    wa.recreate('manual_restart').catch(() => {});
    res.json({ ok: true });
  })
);

router.post(
  '/logout',
  asyncRoute(async (req, res) => {
    const wa = req.app.locals.wa;
    const client = wa?.getClient();
    if (!client) throw new HttpError(409, 'no_client');
    try {
      await client.logout();
      res.json({ ok: true });
      // After logout, recreate to get a new QR.
      setTimeout(() => wa.recreate('post_logout').catch(() => {}), 1000);
    } catch (err) {
      throw new HttpError(500, 'logout_failed', { message: err.message });
    }
  })
);

router.post(
  '/read',
  asyncRoute(async (req, res) => {
    const chatId = req.body?.chatId;
    if (!chatId) throw new HttpError(400, 'missing_chatId');
    const r = await req.app.locals.queue.enqueue({ chat_id: chatId, kind: 'mark_read', payload: {} });
    res.json({ ok: true, queued_id: r.id });
  })
);

module.exports = router;
