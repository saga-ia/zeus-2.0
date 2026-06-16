const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const wa = req.app.locals.wa;
  const waState = wa?.state?.current || 'unknown';

  res.json({
    ok: dbOk,
    db: dbOk,
    wa: waState,
    queueSize: req.app.locals.queueSize?.() ?? null,
    uptimeSec: Math.round(process.uptime()),
    ts: new Date().toISOString(),
  });
});

module.exports = router;
