const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { config } = require('../config');
const { db } = require('../db');
const { sign, COOKIE_NAME, cookieOptions } = require('../auth/jwt');
const { asyncRoute, HttpError } = require('../utils/errors');
const logger = require('../logger');

const router = express.Router();

const getHashStmt = db.prepare(`SELECT value FROM app_settings WHERE key = 'admin_password_hash'`);
const setHashStmt = db.prepare(`
  INSERT INTO app_settings (key, value, updated_at) VALUES ('admin_password_hash', ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`);

function currentHash() {
  const row = getHashStmt.get();
  return (row && row.value) || config.adminPasswordHash;
}

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(256),
});

const changeSchema = z.object({
  username: z.string().min(1).max(120),
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const userOk = username === config.adminUser;
    const passOk = userOk && (await bcrypt.compare(password, currentHash()));
    if (!userOk || !passOk) {
      logger.warn({ ip: req.ip, username }, 'login failed');
      throw new HttpError(401, 'invalid_credentials');
    }
    const token = sign({ sub: username, role: 'admin' });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ ok: true });
  })
);

router.post(
  '/change-password',
  asyncRoute(async (req, res) => {
    const { username, currentPassword, newPassword } = changeSchema.parse(req.body);
    const userOk = username === config.adminUser;
    const passOk = userOk && (await bcrypt.compare(currentPassword, currentHash()));
    if (!userOk || !passOk) {
      logger.warn({ ip: req.ip, username }, 'change-password failed');
      throw new HttpError(401, 'invalid_credentials');
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    setHashStmt.run(newHash);
    logger.info({ ip: req.ip, username }, 'admin password rotated');
    res.json({ ok: true });
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/whoami', (req, res) => {
  res.json({ auth: req.auth || null });
});

module.exports = router;
