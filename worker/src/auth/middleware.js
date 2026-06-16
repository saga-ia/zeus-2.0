const { config } = require('../config');
const { verify, COOKIE_NAME } = require('./jwt');
const { HttpError } = require('../utils/errors');

function tryBearer(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  if (!token) return null;
  if (token === config.apiToken) {
    return { type: 'bearer', subject: 'api-token' };
  }
  try {
    const decoded = verify(token);
    return { type: 'jwt-bearer', subject: decoded.sub || 'admin' };
  } catch {
    return null;
  }
}

function tryCookie(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const decoded = verify(token);
    return { type: 'jwt-cookie', subject: decoded.sub || 'admin' };
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const who = tryBearer(req) || tryCookie(req);
  if (!who) {
    req.auth = null;
    if (req.accepts(['html', 'json']) === 'html') {
      return res.redirect('/login');
    }
    return next(new HttpError(401, 'unauthorized'));
  }
  req.auth = who;
  next();
}

function requireJwt(req, res, next) {
  const who = tryCookie(req) || tryBearer(req);
  if (!who || who.type === 'bearer') {
    if (req.accepts(['html', 'json']) === 'html') {
      return res.redirect('/login');
    }
    return next(new HttpError(401, 'unauthorized'));
  }
  req.auth = who;
  next();
}

function optionalAuth(req, _res, next) {
  req.auth = tryBearer(req) || tryCookie(req) || null;
  next();
}

module.exports = { requireAuth, requireJwt, optionalAuth, tryBearer, tryCookie };
