const express = require('express');
const path = require('node:path');
const { tryBearer, tryCookie } = require('../auth/middleware');

const router = express.Router();
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

router.get('/login', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

router.get('/', (req, res) => {
  const who = tryCookie(req) || tryBearer(req);
  if (!who) return res.redirect('/login');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

module.exports = router;
