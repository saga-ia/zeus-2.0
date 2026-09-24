const express = require('express');
const { HttpError, asyncRoute } = require('../utils/errors');

const router = express.Router();

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const wa = req.app.locals.wa;
    const raw = (req.body?.phone ?? '').toString();
    const phone = raw.replace(/\D+/g, '');
    if (phone.length < 8 || phone.length > 15) {
      throw new HttpError(400, 'invalid_phone', {
        hint: 'informe o número em formato internacional só com dígitos (ex: 5511999999999)',
      });
    }

    const snap = wa?.snapshot?.() || {};
    if (snap.state !== 'qr') {
      throw new HttpError(409, 'client_not_pairable', {
        state: snap.state,
        hint: 'o cliente só aceita pareamento quando está aguardando QR. Clique em "Gerar novo QR" antes.',
      });
    }

    const client = wa.getClient?.();
    if (!client || typeof client.requestPairingCode !== 'function') {
      throw new HttpError(503, 'client_unavailable');
    }

    let code;
    try {
      code = await client.requestPairingCode(phone, false);
    } catch (err) {
      throw new HttpError(502, 'pairing_failed', { message: String(err?.message || err) });
    }

    res.json({ phone, code });
  })
);

module.exports = router;
