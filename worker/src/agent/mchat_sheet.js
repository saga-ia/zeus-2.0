// Append mchat events to a Google Sheet (live monitor).
// Reads sheet ID from app_settings.mchat_sheet_id and uses the default Google OAuth account.

const { db } = require('../db');
const logger = require('../logger');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedAccessToken = null;
let cachedExpiresAt = 0;

function getAppSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getRefreshToken(userKey = 'default') {
  const row = db.prepare('SELECT refresh_token FROM google_oauth_tokens WHERE user_key = ?').get(userKey);
  return row ? row.refresh_token : null;
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && cachedExpiresAt > now + 30_000) return cachedAccessToken;

  const refresh = getRefreshToken('default');
  const clientId = getAppSetting('google_oauth_client_id');
  const clientSecret = getAppSetting('google_oauth_client_secret');
  if (!refresh || !clientId || !clientSecret) {
    throw new Error('mchat_sheet: missing google oauth credentials');
  }

  const params = new URLSearchParams();
  params.set('client_id', clientId);
  params.set('client_secret', clientSecret);
  params.set('refresh_token', refresh);
  params.set('grant_type', 'refresh_token');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`token refresh failed: ${JSON.stringify(data).slice(0, 200)}`);
  cachedAccessToken = data.access_token;
  cachedExpiresAt = now + (data.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

async function appendMchatRow({ timestamp, username, text, mediaId, replySent, dmSent }) {
  const sheetId = getAppSetting('mchat_sheet_id');
  if (!sheetId) {
    logger.warn('mchat_sheet: no mchat_sheet_id configured, skipping append');
    return;
  }

  const access = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Leads!A2:H:append?valueInputOption=USER_ENTERED`;
  const body = {
    values: [[
      timestamp,
      username ? `@${username}` : '',
      text || '',
      `https://www.instagram.com/p/${mediaId}`,
      replySent ? '✅' : '❌',
      dmSent ? '✅' : '❌ aguarda Meta',
      'Replied',
      '',
    ]],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`sheets append ${res.status}: ${err.slice(0, 200)}`);
  }
}

module.exports = { appendMchatRow };
