const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { login, register, sign, setSessionCookie, clearSessionCookie, getUser, requireAuth, changePassword } = require('../auth');
const { db } = require('../db');

const router = express.Router();

// Rate limit simples in-memory pra proteger /login e /forgot contra brute force.
// Chave: IP. Janela deslizante de 15 min, 10 tentativas.
const loginAttempts = new Map();
function checkRateLimit(ip, maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { count: 0, first: now };
  if (now - rec.first > windowMs) { rec.count = 0; rec.first = now; }
  rec.count++;
  loginAttempts.set(ip, rec);
  return rec.count <= maxAttempts;
}
// GC leve
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, v] of loginAttempts) if (v.first < cutoff) loginAttempts.delete(k);
}, 5 * 60 * 1000).unref();

const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:3002';
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';
const JEFF_PHONE = process.env.JEFF_PHONE || '5511910075450';
const CRM_URL = process.env.CRM_URL || 'https://sdrs-crm.jefersonhenrike.com';

async function sendJeff(text) {
  if (!WORKER_TOKEN) { console.error('[jeff-sdrs] WORKER_TOKEN nao configurado'); return false; }
  try {
    const r = await fetch(`${WORKER_URL}/messages/private`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ to: JEFF_PHONE, body: text }),
    });
    return r.ok;
  } catch (e) {
    console.error('[jeff-sdrs] sendJeff falhou:', e.message);
    return false;
  }
}

router.get('/sso', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send('missing_token');
  try {
    const payload = jwt.verify(String(token), process.env.JWT_SECRET || 'dev-secret-change-me');
    if (!payload || payload.purpose !== 'sso') return res.status(401).send('invalid_token');
    const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).send('user_not_found');
    setSessionCookie(res, sign(user));
    res.redirect('/');
  } catch (e) {
    res.status(401).send('invalid_or_expired_token');
  }
});

router.post('/register', (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  const result = register(username, password, display_name);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(ip, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_credentials' });
  const user = login(String(username).toLowerCase().trim(), String(password));
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
  setSessionCookie(res, sign(user));
  res.json({ ok: true, user });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/whoami', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  res.json({ user });
});

router.post('/forgot', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit('forgot:' + ip, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'missing_username' });
  const u = String(username).toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(u);
  if (!user) return res.json({ ok: true });
  const tempPassword = crypto.randomBytes(4).toString('hex');
  const hash = bcrypt.hashSync(tempPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  await sendJeff(
    `redefinicao de senha jeff-sdrs\n\n` +
    `sistema: https://sdrs.jefersonhenrike.com\n` +
    `usuario: ${user.username}\n` +
    `nova senha: ${tempPassword}\n\n` +
    `troque assim que logar em Configuracoes.`
  );
  res.json({ ok: true });
});

router.get('/crm-sso', requireAuth, (req, res) => {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const token = jwt.sign(
    { uid: req.user.id, u: req.user.username, purpose: 'crm-sso' },
    secret,
    { expiresIn: '2m' }
  );
  let target = String(req.query.target || '/');
  if (!target.startsWith('/') || target.startsWith('//')) target = '/';
  const url = `${CRM_URL}/sso?token=${encodeURIComponent(token)}&target=${encodeURIComponent(target)}`;
  res.redirect(url);
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current, next: nextPwd } = req.body || {};
  if (!current || !nextPwd) return res.status(400).json({ error: 'missing_fields' });
  const result = changePassword(req.user.id, current, nextPwd);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true });
});

module.exports = router;
