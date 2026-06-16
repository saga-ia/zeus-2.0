const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente em 15 minutos.' }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de cadastros atingido. Tente em 1 hora.' }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Dados incompletos' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    db.prepare('INSERT INTO audit_log (user_id, action, ip) VALUES (null,?,?)').run('login.fail', req.ip);
    return res.status(401).json({ error: 'Usuário ou senha incorretos' });
  }

  db.prepare('UPDATE users SET last_login=unixepoch() WHERE id=?').run(user.id);
  db.prepare('INSERT INTO audit_log (user_id, action, ip) VALUES (?,?,?)').run(user.id, 'login.ok', req.ip);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.cookie('zeus_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000
  });

  res.json({ ok: true, username: user.username, role: user.role });
});

router.post('/register', registerLimiter, async (req, res) => {
  const { username, email, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
  if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });

  const db = getDb();
  const userCount = db.prepare('SELECT count(*) as n FROM users').get().n;

  // Após o primeiro usuário (owner), cadastro é fechado
  if (userCount > 0) {
    return res.status(403).json({ error: 'Cadastro desativado. Solicite acesso ao administrador.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Nome de usuário já existe' });

  const password_hash = await bcrypt.hash(password, 12);
  const role = 'owner'; // primeiro usuário é sempre owner

  const result = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username, password_hash, role);

  db.prepare('INSERT INTO audit_log (user_id, action, ip) VALUES (?,?,?)').run(result.lastInsertRowid, 'register.ok', req.ip);

  const token = jwt.sign(
    { id: result.lastInsertRowid, username, role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.cookie('zeus_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000
  });

  res.status(201).json({ ok: true, username, role });
});

router.post('/logout', (req, res) => {
  res.clearCookie('zeus_token');
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Dados incompletos' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }

  const password_hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(password_hash, user.id);
  db.prepare('INSERT INTO audit_log (user_id, action, ip) VALUES (?,?,?)').run(user.id, 'password.change', req.ip);
  res.clearCookie('zeus_token');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.zeus_token;
  if (!token) return res.json({ authenticated: false });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ authenticated: true, username: payload.username, role: payload.role });
  } catch {
    res.json({ authenticated: false });
  }
});

module.exports = router;
