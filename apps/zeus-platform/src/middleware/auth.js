const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

function requireAuth(req, res, next) {
  const token = req.cookies?.zeus_token;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    res.clearCookie('zeus_token');
    return res.status(401).json({ error: 'Sessão expirada' });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Acesso restrito' });
  next();
}

function auditLog(action, target = null) {
  return (req, res, next) => {
    const db = getDb();
    try {
      db.prepare(
        'INSERT INTO audit_log (user_id, action, target, ip, user_agent) VALUES (?,?,?,?,?)'
      ).run(
        req.user?.id ?? null,
        action,
        target,
        req.ip,
        req.headers['user-agent'] ?? null
      );
    } catch { /* não quebra o fluxo */ }
    next();
  };
}

module.exports = { requireAuth, requireOwner, auditLog };
