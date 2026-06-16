const express = require('express');
const { login, register, sign, setSessionCookie, clearSessionCookie, getUser, requireAuth, changePassword } = require('../auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing_fields' });
  const result = register(username, password, display_name);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
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

router.post('/change-password', requireAuth, (req, res) => {
  const { current, next: nextPwd } = req.body || {};
  if (!current || !nextPwd) return res.status(400).json({ error: 'missing_fields' });
  const result = changePassword(req.user.id, current, nextPwd);
  if (!result.ok) return res.status(400).json(result);
  res.json({ ok: true });
});

module.exports = router;
