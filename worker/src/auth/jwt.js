const jwt = require('jsonwebtoken');
const { config } = require('../config');

const COOKIE_NAME = 'ww_session';

function sign(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.jwtTtlDays}d` });
}

function verify(token) {
  return jwt.verify(token, config.jwtSecret);
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: config.jwtTtlDays * 24 * 60 * 60 * 1000,
  };
}

module.exports = { sign, verify, COOKIE_NAME, cookieOptions };
