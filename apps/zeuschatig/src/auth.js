const crypto = require('crypto');
const { db } = require('./db');

function hash(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function verify(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h,'hex'), Buffer.from(test,'hex'));
}

function createSession(userId, days = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + days*86400*1000).toISOString();
  db.prepare('INSERT INTO admin_sessions(token, admin_user_id, expires_at) VALUES(?,?,?)').run(token, userId, expires);
  return { token, expires };
}
function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT s.expires_at, u.id, u.email, u.role, u.tenant_scope
                          FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_user_id
                          WHERE s.token=?`).get(token);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  return { id: row.id, email: row.email, role: row.role, tenant_scope: row.tenant_scope };
}
function destroySession(token) {
  db.prepare('DELETE FROM admin_sessions WHERE token=?').run(token);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.zc_session || req.headers['x-session-token'];
  const user = sessionUser(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

module.exports = { hash, verify, createSession, sessionUser, destroySession, requireAuth, requireAdmin };
