const { config } = require('../config');
const { last9 } = require('../utils/jid');
const { db } = require('../db');

const getTeamAuthStmt = db.prepare(
  `SELECT api_replies_enabled, set_by FROM contact_settings WHERE phone = ?`
);

function isTeamAuthorizedPhone(phone) {
  if (!phone) return false;
  const row = getTeamAuthStmt.get(phone);
  if (!row) return false;
  return (
    row.api_replies_enabled === 0 &&
    (row.set_by === 'lucas_approval' || row.set_by === 'team_group_auto')
  );
}

function isWhitelistedPhone(phone) {
  if (!phone) return false;
  const key = last9(phone);
  if (!key) return false;
  return config.agentWhitelist.includes(key);
}

function isWhitelisted(jidOrPhone) {
  if (!jidOrPhone) return false;
  const s = String(jidOrPhone);
  if (s.endsWith('@lid')) return false;
  return isWhitelistedPhone(s);
}

function labelForPhone(phone) {
  const k = last9(phone || '');
  if (k === '910075450') return 'Jefferson';
  if (k === '991143501') return 'Vinicius';
  return 'desconhecido';
}

module.exports = {
  isWhitelisted,
  isWhitelistedPhone,
  isTeamAuthorizedPhone,
  labelForPhone,
};
