const express = require('express');
const { z } = require('zod');
const { asyncRoute, HttpError } = require('../utils/errors');
const { toPrivateJid } = require('../utils/jid');
const { db } = require('../db');

const router = express.Router();

router.post(
  '/check',
  asyncRoute(async (req, res) => {
    const { number } = z.object({ number: z.string().min(3) }).parse(req.body);
    const wa = req.app.locals.wa;
    const client = wa.getClient();
    if (!client || wa.state.current !== 'ready') throw new HttpError(409, 'not_ready');
    const jid = toPrivateJid(number);
    if (!jid) throw new HttpError(400, 'invalid_number');
    const registered = await client.isRegisteredUser(jid);
    res.json({ number, jid, registered: !!registered });
  })
);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const rows = db
      .prepare(`SELECT jid, name, push_name, number, is_business, is_blocked FROM contacts ORDER BY name COLLATE NOCASE LIMIT 500`)
      .all();
    res.json({ contacts: rows });
  })
);

module.exports = router;
