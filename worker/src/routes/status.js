const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  const wa = req.app.locals.wa;
  const s = wa?.snapshot?.() || { state: 'unknown' };
  res.json(s);
});

module.exports = router;
