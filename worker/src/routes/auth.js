const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { config } = require('../config');
const { sign, COOKIE_NAME, cookieOptions } = require('../auth/jwt');
const { asyncRoute, HttpError } = require('../utils/errors');
const logger = require('../logger');

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(256),
});

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const userOk = username === config.adminUser;
    const passOk = userOk && (await bcrypt.compare(password, config.adminPasswordHash));
    if (!userOk || !passOk) {
      logger.warn({ ip: req.ip, username }, 'login failed');
      throw new HttpError(401, 'invalid_credentials');
    }
    const token = sign({ sub: username, role: 'admin' });
    res.cookie(COOKIE_NAME, token, cookieOptions());
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
