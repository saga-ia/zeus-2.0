const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = '/opt/jeff-worker/data/worker.db';
const PORT = process.env.PORT || 3018;
const BASE_URL = 'https://google.jefersonhenrike.com';
const REDIRECT_URI = `${BASE_URL}/oauth/callback`;

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets'
];

const db = new Database(DB_PATH, { fileMustExist: true });
db.pragma('journal_mode = WAL');

const setting = (k) => {
  const r = db.prepare('SELECT value FROM app_settings WHERE key=?').get(k);
  return r ? r.value : null;
};

const upsertToken = db.prepare(`
  INSERT INTO google_oauth_tokens (provider, user_key, access_token, refresh_token, expires_at, scopes, updated_at)
  VALUES ('google', @user_key, @access_token, @refresh_token, @expires_at, @scopes, datetime('now'))
  ON CONFLICT(provider, user_key) DO UPDATE SET
    access_token=excluded.access_token,
    refresh_token=COALESCE(excluded.refresh_token, google_oauth_tokens.refresh_token),
    expires_at=excluded.expires_at,
    scopes=excluded.scopes,
    updated_at=datetime('now')
`);

const listTokens = db.prepare(`
  SELECT id, user_key, expires_at, scopes, updated_at,
    length(access_token) AS at_len,
    length(refresh_token) AS rt_len
  FROM google_oauth_tokens WHERE provider='google'
  ORDER BY updated_at DESC
`);

const getToken = db.prepare(`SELECT * FROM google_oauth_tokens WHERE provider='google' AND user_key=?`);

// state nonce store (in-memory; restart wipes — only used during consent flow)
const stateStore = new Map();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    has_client: !!setting('google_oauth_client_id'),
    redirect_uri: REDIRECT_URI,
    tokens: listTokens.all().length
  });
});

app.get('/api/tokens', (_req, res) => {
  res.json({ ok: true, items: listTokens.all() });
});

// inicia OAuth (pode passar ?user=email pra forçar conta específica)
app.get('/oauth/start', (req, res) => {
  const clientId = setting('google_oauth_client_id');
  if (!clientId) return res.status(500).send('client_id missing — salva em app_settings.google_oauth_client_id antes de iniciar');

  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, { ts: Date.now(), hint: req.query.user || null });
  // expira state em 10min
  for (const [k, v] of stateStore) if (Date.now() - v.ts > 600000) stateStore.delete(k);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  if (req.query.user) params.set('login_hint', String(req.query.user));

  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

// callback Google → troca code por tokens
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(htmlPage('Erro Google', `Google retornou erro: <code>${error}</code>`));
  if (!code || !state) return res.status(400).send(htmlPage('Erro', 'Faltou code ou state.'));
  if (!stateStore.has(state)) return res.status(400).send(htmlPage('Erro', 'State inválido ou expirado. Reinicia o fluxo em <a href="/oauth/start">/oauth/start</a>.'));
  stateStore.delete(state);

  const clientId = setting('google_oauth_client_id');
  const clientSecret = setting('google_oauth_client_secret');
  if (!clientId || !clientSecret) return res.status(500).send(htmlPage('Erro', 'client_id ou client_secret faltando em app_settings.'));

  try {
    // 1) troca code → tokens
    const tokRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    const tok = await tokRes.json();
    if (!tokRes.ok) throw new Error('token exchange: ' + JSON.stringify(tok));

    // 2) descobre o email do usuário (user_key)
    const uiRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` }
    });
    const ui = await uiRes.json();
    const userKey = ui.email || 'default';

    // 3) salva
    const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString().replace('T', ' ').slice(0, 19);
    upsertToken.run({
      user_key: userKey,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || null,
      expires_at: expiresAt,
      scopes: tok.scope || SCOPES.join(' ')
    });

    res.send(htmlPage('Conectado ✓', `
      <p><strong>${userKey}</strong> autenticado com sucesso.</p>
      <p>Refresh token: <code>${tok.refresh_token ? 'guardado' : '⚠️ AUSENTE — revoga acesso e reconecta'}</code></p>
      <p>Expira em: <code>${expiresAt} UTC</code></p>
      <p>Scopes: <code>${(tok.scope || '').split(' ').join('<br>')}</code></p>
      <p><a href="/">voltar</a></p>
    `));
  } catch (e) {
    res.status(500).send(htmlPage('Erro', 'Falha: ' + e.message));
  }
});

// helper pra refresh manual via API
app.post('/oauth/refresh/:userKey', async (req, res) => {
  try {
    const t = getToken.get(req.params.userKey);
    if (!t) return res.status(404).json({ error: 'user_key not found' });
    if (!t.refresh_token) return res.status(400).json({ error: 'no refresh_token stored' });

    const clientId = setting('google_oauth_client_id');
    const clientSecret = setting('google_oauth_client_secret');
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        grant_type: 'refresh_token', refresh_token: t.refresh_token
      })
    });
    const tok = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(tok));
    const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString().replace('T', ' ').slice(0, 19);
    upsertToken.run({
      user_key: req.params.userKey,
      access_token: tok.access_token,
      refresh_token: t.refresh_token,
      expires_at: expiresAt,
      scopes: tok.scope || t.scopes
    });
    res.json({ ok: true, expires_at: expiresAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function htmlPage(title, bodyHtml) {
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${title}</title>
<style>body{background:#0b0d10;color:#e8edf2;font:15px/1.6 -apple-system,Inter,sans-serif;max-width:640px;margin:60px auto;padding:0 24px}
a{color:#60a5fa}code{background:#1b2027;padding:2px 6px;border-radius:4px;font-size:12px}
h1{font-weight:600;letter-spacing:-.02em}</style></head><body><h1>${title}</h1>${bodyHtml}</body></html>`;
}

app.listen(PORT, '127.0.0.1', () => console.log(`[google-oauth] listening on 127.0.0.1:${PORT}`));
