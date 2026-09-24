const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const EXPIRES = '30d';

function hash(senha) { return bcrypt.hash(senha, 10); }
function check(senha, h) { return bcrypt.compare(senha, h); }

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

function verify(token) {
  try { return jwt.verify(token, SECRET); } catch (_) { return null; }
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies && req.cookies.za_token);
  const payload = token ? verify(token) : null;
  if (!payload) return res.status(401).json({ error: 'unauthorized' });
  req.user = payload;
  next();
}

module.exports = { hash, check, sign, verify, requireAuth };
