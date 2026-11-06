// Wrapper Instagram API with Instagram Login (graph.instagram.com).
// Trata OAuth de tenant, envio de DM, refresh de token.
const https = require('https');
const querystring = require('querystring');
const { getConfig } = require('./db');

const IG_GRAPH = 'https://graph.instagram.com/v21.0';
const IG_OAUTH = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN = 'https://api.instagram.com/oauth/access_token';
const IG_LONG = 'https://graph.instagram.com/access_token';

function req(url, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Accept': 'application/json', ...headers },
    };
    if (body && typeof body === 'string') opts.headers['Content-Length'] = Buffer.byteLength(body);
    const r = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: { raw: data } }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function authorizeUrl(state) {
  const appId = getConfig('ig_app_id');
  const redirect = getConfig('ig_oauth_redirect_uri');
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
  ].join(',');
  const qs = querystring.stringify({
    client_id: appId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: scopes,
    state,
  });
  return `${IG_OAUTH}?${qs}`;
}

async function exchangeCodeForToken(code) {
  const appId = getConfig('ig_app_id');
  const appSecret = getConfig('ig_app_secret');
  const redirect = getConfig('ig_oauth_redirect_uri');
  const body = querystring.stringify({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirect,
    code,
  });
  return req(IG_TOKEN, 'POST', body, { 'Content-Type': 'application/x-www-form-urlencoded' });
}

async function exchangeShortForLong(shortToken) {
  const appSecret = getConfig('ig_app_secret');
  const url = `${IG_LONG}?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`;
  return req(url, 'GET');
}

async function refreshToken(longToken) {
  const url = `${IG_GRAPH.replace('/v21.0','')}/refresh_access_token?grant_type=ig_refresh_token&access_token=${longToken}`;
  return req(url, 'GET');
}

async function me(token) {
  const url = `${IG_GRAPH}/me?fields=id,user_id,username,name,account_type&access_token=${token}`;
  return req(url, 'GET');
}

async function sendDM(token, recipientIgsid, text) {
  const body = JSON.stringify({
    recipient: { id: recipientIgsid },
    message: { text },
  });
  return req(`${IG_GRAPH}/me/messages`, 'POST', body, {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  });
}

module.exports = { authorizeUrl, exchangeCodeForToken, exchangeShortForLong, refreshToken, me, sendDM };
