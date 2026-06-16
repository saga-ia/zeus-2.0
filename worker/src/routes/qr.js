const express = require('express');
const QRCode = require('qrcode');
const { HttpError, asyncRoute } = require('../utils/errors');

const router = express.Router();

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const wa = req.app.locals.wa;
    const s = wa?.snapshot?.() || {};
    if (!s.qr) {
      throw new HttpError(409, 'no_qr_available', { state: s.state });
    }
    const format = (req.query.format || 'png').toString();
    if (format === 'text') {
      res.type('text/plain').send(s.qr);
      return;
    }
    if (format === 'svg') {
      const svg = await QRCode.toString(s.qr, { type: 'svg', width: 320, margin: 1 });
      res.type('image/svg+xml').send(svg);
      return;
    }
    const png = await QRCode.toBuffer(s.qr, { type: 'png', width: 320, margin: 1 });
    res.type('image/png').send(png);
  })
);

module.exports = router;
