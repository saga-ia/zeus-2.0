const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'disp_session';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return { id: user.id, username: user.username, role: user.role, display_name: user.display_name };
}

function sign(user) {
  return jwt.sign({ uid: user.id, u: user.username, r: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function getUser(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(payload.uid);
    return user || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  req.user = user;
  next();
}

function register(username, password, displayName) {
  if (!username || username.length < 3) return { ok: false, error: 'username_too_short' };
  if (!password || password.length < 6) return { ok: false, error: 'weak_password' };
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username.toLowerCase().trim());
  if (exists) return { ok: false, error: 'username_taken' };
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run(username.toLowerCase().trim(), hash, displayName || username, 'admin');
  return { ok: true, id: info.lastInsertRowid };
}

function changePassword(userId, currentPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { ok: false, error: 'user_not_found' };
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) return { ok: false, error: 'wrong_password' };
  if (!newPassword || newPassword.length < 6) return { ok: false, error: 'weak_password' };
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  return { ok: true };
}

module.exports = { login, register, sign, setSessionCookie, clearSessionCookie, getUser, requireAuth, changePassword };
