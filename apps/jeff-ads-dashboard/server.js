const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookie = require('cookie');

// ─── Auth ─────────────────────────────────────────────────────────────────────
const AUTH_SALT = 'jeff-alpha-2026';
// Legacy single-password hash (kept for backward compat — use user accounts instead)
const AUTH_HASH = '291a2852d717eecba0aee5c77d7f55bcee7e5c48e2c2ce6ccf6f21c76eef87fb59808e18d963233be18fbce988ca8600a9bbc78759bcdd27bed10760c9b61d7d';
const sessions = new Map(); // tok → { exp, userId, username, role }

// Users DB (writable, separate from worker.db)
const AUTH_DB_PATH = path.join(__dirname, 'auth.db');
const authDb = new Database(AUTH_DB_PATH);
authDb.pragma('journal_mode = WAL');
authDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Create jeff account automatically if not exists (admin, no approval needed)
const jeffExists = authDb.prepare('SELECT id FROM users WHERE username = ?').get('jeff');
if (!jeffExists) {
  const salt = crypto.randomBytes(16).toString('hex');
  // Generate a random initial password — Jeff can reset via /api/reset-my-password
  const initialPwd = crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(initialPwd, salt, 64).toString('hex');
  authDb.prepare('INSERT INTO users (name, username, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)').run('Jefferson', 'jeff', hash, salt, 'admin');
  console.log(`[auth] jeff account created. Initial password: ${initialPwd}`);
}

function hashPwd(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyLegacyPwd(pwd) {
  try {
    const test = crypto.scryptSync(pwd, AUTH_SALT, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(AUTH_HASH, 'hex'));
  } catch { return false; }
}

function verifyUserPwd(username, password) {
  const user = authDb.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());
  if (!user) return null;
  try {
    const test = hashPwd(password, user.salt);
    const match = crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(user.password_hash, 'hex'));
    if (!match) return null;
    return user;
  } catch { return null; }
}

function newSession(userId, username, role) {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, { exp: Date.now() + 30 * 24 * 60 * 60 * 1000, userId, username, role });
  return tok;
}

function getSession(req) {
  const c = cookie.parse(req.headers.cookie || '');
  const s = sessions.get(c.sid);
  return s && s.exp > Date.now() ? s : null;
}

function requireAuth(req, res, next) {
  if (!getSession(req)) return res.redirect('/login');
  next();
}

function apiAuth(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}
// ──────────────────────────────────────────────────────────────────────────────

const DB_PATH = '/opt/jeff-worker/data/worker.db';
const PORT = process.env.PORT || 3011;
const GRAPH = 'https://graph.facebook.com/v19.0';

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma('journal_mode = WAL');

const setting = (k) => {
  const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k);
  return r ? r.value : null;
};

const getEnv = (k) => {
  try {
    const env = fs.readFileSync('/opt/jeff-worker/.env', 'utf8');
    const m = env.match(new RegExp('^' + k + '=(.+)$', 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch { return null; }
};

const USER_TOKEN = setting('jeff_meta_user_token');
const SYSTEM_TOKEN = setting('jeff_meta_system_token');
const ANTHROPIC_KEY = getEnv('ANTHROPIC_API_KEY');
const GROQ_KEY = getEnv('GROQ_API_KEY');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function dateParams(src, fallback) {
  const since = String(src?.since || '').trim();
  const until = String(src?.until || '').trim();
  if (ISO_DATE_RE.test(since) && ISO_DATE_RE.test(until)) {
    return { time_range: JSON.stringify({ since, until }) };
  }
  return { date_preset: src?.date_preset || fallback };
}
function dateLabel(dp, fallback) {
  if (dp.time_range) {
    try { const t = JSON.parse(dp.time_range); return `${t.since} a ${t.until}`; } catch { return fallback; }
  }
  return dp.date_preset || fallback;
}

async function graph(path, params = {}, useFallback = false) {
  const token = useFallback ? SYSTEM_TOKEN : USER_TOKEN;
  if (!token) throw new Error('no_token');
  const u = new URL(GRAPH + '/' + path);
  u.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString());
  const data = await res.json();
  if (data.error && !useFallback && SYSTEM_TOKEN) {
    return graph(path, params, true);
  }
  if (data.error) {
    const e = new Error(data.error.message || 'graph_error');
    e.code = data.error.code;
    throw e;
  }
  return data;
}

async function graphPaged(path, params = {}, maxPages = 5) {
  const out = [];
  let next = null;
  let page = 0;
  let p = { ...params, limit: params.limit || 100 };
  while (page < maxPages) {
    const data = next
      ? await (await fetch(next)).json()
      : await graph(path, p);
    if (data.error) throw new Error(data.error.message);
    if (Array.isArray(data.data)) out.push(...data.data);
    next = data.paging && data.paging.next ? data.paging.next : null;
    if (!next) break;
    page++;
  }
  return out;
}

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false }));


// Esqueci minha senha (código via WhatsApp do dono) — módulo compartilhado jeff-shared
require('/opt/jeff-apps/jeff-shared/password-reset').mount(app, {
  appName: 'Meta Ads Dashboard',
  needsIdentifier: true,
  identifierLabel: 'Usuário',
  userExists: (username) => !!authDb.prepare('SELECT 1 FROM users WHERE username = ?').get(username),
  setPassword: (newPass, username) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const r = authDb.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?').run(hashPwd(newPass, salt), salt, username);
    return r.changes > 0;
  }
});

app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (_req, res) => res.status(403).send('Cadastro fechado. Acesso somente por convite.'));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.redirect('/login?error=1');

  const user = verifyUserPwd(username, password);
  if (!user) return res.redirect('/login?error=1');
  if (user.role === 'pending') return res.redirect('/login?pending=1');

  const tok = newSession(user.id, user.username, user.role);
  res.setHeader('Set-Cookie', cookie.serialize('sid', tok, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 }));
  res.redirect('/');
});

app.post('/api/signup', (req, res) => {
  return res.status(403).json({ error: 'Cadastro fechado. Acesso somente por convite.' });
  // eslint-disable-next-line no-unreachable
  const { name, username, password } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: 'Preencha todos os campos.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha muito curta (minimo 6 caracteres).' });
  if (!/^[a-z0-9._-]+$/.test(username.toLowerCase())) return res.status(400).json({ error: 'Usuario invalido.' });
  if (name.length > 80 || username.length > 40) return res.status(400).json({ error: 'Campos muito longos.' });

  const existing = authDb.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Usuario ja cadastrado.' });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPwd(password, salt);
  authDb.prepare('INSERT INTO users (name, username, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)').run(name.trim(), username.toLowerCase(), hash, salt, 'pending');
  res.json({ ok: true, message: 'Conta criada. Aguarde aprovacao.' });
});

// Admin: list users (jeff/admin only)
app.get('/api/users', apiAuth, (req, res) => {
  const s = getSession(req);
  if (s.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const users = authDb.prepare('SELECT id, name, username, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

// Admin: approve/reject user
app.post('/api/users/:id/role', apiAuth, (req, res) => {
  const s = getSession(req);
  if (s.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { role } = req.body || {};
  if (!['admin', 'user', 'pending'].includes(role)) return res.status(400).json({ error: 'role invalido' });
  const info = authDb.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'user not found' });
  res.json({ ok: true });
});

// Reset own password (must be logged in)
app.post('/api/reset-password', apiAuth, (req, res) => {
  const s = getSession(req);
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: 'Campos obrigatorios.' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Senha muito curta.' });
  const user = verifyUserPwd(s.username, current_password);
  if (!user) return res.status(401).json({ error: 'Senha atual incorreta.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPwd(new_password, salt);
  authDb.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const c = cookie.parse(req.headers.cookie || '');
  if (c.sid) sessions.delete(c.sid);
  res.setHeader('Set-Cookie', cookie.serialize('sid', '', { httpOnly: true, maxAge: 0, path: '/' }));
  res.redirect('/login');
});

async function groqTranscribe(buf, filename, mime) {
  if (!GROQ_KEY) throw new Error('groq_key_missing');
  const boundary = '----jad' + Math.random().toString(16).slice(2);
  const CRLF = '\r\n';
  const fields = { model: 'whisper-large-v3', language: 'pt', response_format: 'json' };
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`, 'utf8'));
  }
  parts.push(Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: ${mime || 'application/octet-stream'}${CRLF}${CRLF}`,
    'utf8'
  ));
  parts.push(buf);
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8'));
  const body = Buffer.concat(parts);

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`groq ${r.status}: ${raw.slice(0, 300)}`);
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error('groq response not JSON'); }
  return (json.text || '').trim();
}

app.post('/api/transcribe', apiAuth, async (req, res) => {
  try {
    const { audio_b64, mime } = req.body || {};
    if (!audio_b64) return res.status(400).json({ error: 'audio_b64 required' });
    const buf = Buffer.from(audio_b64, 'base64');
    if (buf.length < 200) return res.status(400).json({ error: 'audio too short' });
    if (buf.length > 24 * 1024 * 1024) return res.status(413).json({ error: 'audio too large (max 24MB)' });
    const ext = (mime && mime.includes('webm')) ? 'webm'
              : (mime && mime.includes('mp4')) ? 'm4a'
              : (mime && mime.includes('ogg')) ? 'ogg'
              : 'webm';
    const text = await groqTranscribe(buf, `audio.${ext}`, mime);
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.get('/api/accounts', apiAuth, async (_req, res) => {
  try {
    const data = await graph('me/adaccounts', {
      fields: 'id,account_id,name,account_status,currency,timezone_name,business',
      limit: 200
    });
    const accounts = (data.data || []).map(a => ({
      id: a.account_id,
      act_id: a.id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      status: a.account_status,
      bm_id: a.business?.id || null,
      bm_name: a.business?.name || 'Pessoal'
    }));
    const bms = {};
    for (const acc of accounts) {
      const k = acc.bm_id || 'personal';
      if (!bms[k]) bms[k] = { id: acc.bm_id, name: acc.bm_name, accounts: [] };
      bms[k].accounts.push(acc);
    }
    res.json({ accounts, bms: Object.values(bms) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/campaigns', apiAuth, async (req, res) => {
  try {
    const accountId = req.query.account_id;
    const showInactive = req.query.show_inactive === '1';
    const dp = dateParams(req.query, 'last_7d');
    if (!accountId) return res.status(400).json({ error: 'account_id required' });

    const camps = await graphPaged(`act_${accountId}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time',
      limit: 100
    });

    const filtered = showInactive
      ? camps
      : camps.filter(c => c.status === 'ACTIVE' || c.effective_status === 'ACTIVE');

    let insightsByCamp = {};
    if (filtered.length > 0) {
      try {
        const insights = await graphPaged(`act_${accountId}/insights`, {
          fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,cpm,cpc,ctr,actions,cost_per_action_type',
          ...dp,
          level: 'campaign',
          limit: 200
        });
        for (const ins of insights) {
          insightsByCamp[ins.campaign_id] = ins;
        }
      } catch (e) { /* insights may fail; continue with empty */ }
    }

    const result = filtered.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      effective_status: c.effective_status,
      objective: c.objective,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      start_time: c.start_time,
      stop_time: c.stop_time,
      insights: insightsByCamp[c.id] || null
    }));

    result.sort((a, b) => {
      const sa = a.insights ? Number(a.insights.spend || 0) : -1;
      const sb = b.insights ? Number(b.insights.spend || 0) : -1;
      return sb - sa;
    });

    res.json({ campaigns: result, total: result.length, ...dp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/account-summary', apiAuth, async (req, res) => {
  try {
    const accountId = req.query.account_id;
    const dp = dateParams(req.query, 'last_7d');
    if (!accountId) return res.status(400).json({ error: 'account_id required' });
    const data = await graph(`act_${accountId}/insights`, {
      fields: 'spend,impressions,clicks,reach,cpm,cpc,ctr,actions,cost_per_action_type',
      ...dp,
      level: 'account'
    });
    res.json({ summary: data.data?.[0] || null, ...dp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/creatives', apiAuth, async (req, res) => {
  try {
    const accountId = req.query.account_id;
    const dp = dateParams(req.query, 'last_14d');
    if (!accountId) return res.status(400).json({ error: 'account_id required' });

    const ads = await graphPaged(`act_${accountId}/ads`, {
      fields: 'id,name,status,effective_status,campaign_id,adset_id,creative{id,name,thumbnail_url,object_type,title,body,call_to_action_type,image_url,video_id}',
      limit: 100
    }, 3);

    const insights = await graphPaged(`act_${accountId}/insights`, {
      fields: 'ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,reach,cpm,cpc,ctr,actions,cost_per_action_type',
      ...dp,
      level: 'ad',
      limit: 200
    });

    const insByAd = {};
    for (const ins of insights) insByAd[ins.ad_id] = ins;

    const out = ads.map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      effective_status: a.effective_status,
      campaign_id: a.campaign_id,
      adset_id: a.adset_id,
      creative: a.creative || null,
      insights: insByAd[a.id] || null
    })).filter(a => a.insights);

    out.sort((a, b) => Number(b.insights.spend || 0) - Number(a.insights.spend || 0));

    res.json({ creatives: out, ...dp, total: out.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze', apiAuth, async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'anthropic_key_missing' });
    const { account_id, query } = req.body || {};
    const dp = dateParams(req.body || {}, 'last_14d');
    if (!account_id || !query) return res.status(400).json({ error: 'account_id and query required' });

    const [campRes, creatRes, sumRes] = await Promise.all([
      graphPaged(`act_${account_id}/insights`, {
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,reach,cpm,cpc,ctr,actions,cost_per_action_type',
        ...dp,
        level: 'campaign',
        limit: 100
      }).catch(() => []),
      graphPaged(`act_${account_id}/insights`, {
        fields: 'ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,reach,cpm,cpc,ctr,actions,cost_per_action_type',
        ...dp,
        level: 'ad',
        limit: 200
      }).catch(() => []),
      graph(`act_${account_id}/insights`, {
        fields: 'spend,impressions,clicks,reach,cpm,cpc,ctr,actions',
        ...dp,
        level: 'account'
      }).catch(() => null)
    ]);

    let creativeMeta = [];
    try {
      creativeMeta = await graphPaged(`act_${account_id}/ads`, {
        fields: 'id,name,creative{id,name,thumbnail_url,title,body,call_to_action_type}',
        limit: 100
      }, 3);
    } catch {}
    const creativeMetaById = {};
    for (const c of creativeMeta) creativeMetaById[c.id] = c.creative || null;

    const enrichedCreatives = creatRes.map(c => ({
      ...c,
      creative_meta: creativeMetaById[c.ad_id] || null
    }));

    const summary = sumRes?.data?.[0] || null;

    const prompt = `Você é um analista de marketing performance. O Jeff (head de marketing) pediu a seguinte análise sobre a conta de anúncios Meta:

PEDIDO DO JEFF: "${query}"

PERÍODO: ${dateLabel(dp, 'last_14d')}

RESUMO DA CONTA:
${JSON.stringify(summary, null, 2)}

CAMPANHAS (${campRes.length}):
${JSON.stringify(campRes.slice(0, 30), null, 2)}

CRIATIVOS / ADS (${enrichedCreatives.length}, top 50 por spend):
${JSON.stringify(enrichedCreatives.sort((a,b)=>Number(b.spend||0)-Number(a.spend||0)).slice(0, 50), null, 2)}

Retorne SOMENTE um JSON válido (sem markdown, sem explicação fora do JSON) no formato:

{
  "headline": "Frase curta e direta com o insight principal",
  "kpis": [
    {"label": "Gasto total", "value": "R$ X", "trend": "up|down|flat"},
    ...4-6 KPIs principais
  ],
  "winners": [
    {"name": "nome do criativo/campanha", "why": "razão curta do que está funcionando", "metric": "métrica chave"}
  ],
  "losers": [
    {"name": "nome", "why": "razão da baixa performance", "metric": "métrica chave"}
  ],
  "summary": "Parágrafo de 3-5 frases explicando o que está funcionando e por quê. Linguagem direta, sem jargão técnico desnecessário.",
  "recommendations": [
    "Ação concreta 1",
    "Ação concreta 2",
    "Ação concreta 3"
  ]
}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const ai = await aiRes.json();
    if (ai.error) return res.status(500).json({ error: ai.error.message || 'anthropic_error' });
    const text = ai.content?.[0]?.text || '';
    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      return res.json({ raw: text, parse_error: true });
    }
    res.json({ analysis: parsed, query, ...dp, account_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Meta Dashboard completo ───────────────────────────────────────────────
const getLeads = (actions) => {
  if (!Array.isArray(actions)) return 0;
  const types = ['lead', 'onsite_conversion.lead_grouped', 'leadgen.other', 'offsite_conversion.fb_pixel_lead'];
  return types.reduce((sum, t) => {
    const a = actions.find(x => x.action_type === t);
    return sum + (a ? Number(a.value || 0) : 0);
  }, 0);
};

app.get('/api/meta-dashboard', apiAuth, async (req, res) => {
  try {
    const accountId = req.query.account_id;
    const dp = dateParams(req.query, 'last_30d');
    if (!accountId) return res.status(400).json({ error: 'account_id required' });

    const FIELDS_ACCOUNT = 'spend,impressions,clicks,reach,cpm,cpc,ctr,frequency,actions,cost_per_action_type';
    const FIELDS_BASIC = 'spend,impressions,clicks,reach,actions';

    const [summaryRes, timeRes, ageRes, genderRes, regionRes, campRes, adRes] = await Promise.allSettled([
      graph(`act_${accountId}/insights`, { fields: FIELDS_ACCOUNT, ...dp, level: 'account' }),
      graph(`act_${accountId}/insights`, { fields: `${FIELDS_BASIC},date_start`, ...dp, level: 'account', time_increment: 1, limit: 90 }),
      graph(`act_${accountId}/insights`, { fields: FIELDS_BASIC, ...dp, level: 'account', breakdowns: 'age', limit: 20 }),
      graph(`act_${accountId}/insights`, { fields: FIELDS_BASIC, ...dp, level: 'account', breakdowns: 'gender', limit: 10 }),
      graph(`act_${accountId}/insights`, { fields: FIELDS_BASIC, ...dp, level: 'account', breakdowns: 'region', limit: 50 }),
      graphPaged(`act_${accountId}/insights`, { fields: `campaign_id,campaign_name,spend,impressions,clicks,reach,cpm,cpc,ctr,actions`, ...dp, level: 'campaign', limit: 100 }),
      graphPaged(`act_${accountId}/insights`, { fields: `ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,reach,ctr,actions`, ...dp, level: 'ad', limit: 100 })
    ]);

    const campsData0 = campRes.status === 'fulfilled' ? campRes.value : [];
    let campObjectives = {};
    let campStatuses = {};
    if (campsData0.length > 0) {
      try {
        const campIds = campsData0.map(c => c.campaign_id);
        const campDetails = await graphPaged(`act_${accountId}/campaigns`, {
          fields: 'id,objective,effective_status',
          filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: campIds }]),
          limit: 200
        }, 1);
        for (const c of campDetails) {
          campObjectives[c.id] = c.objective || null;
          campStatuses[c.id] = c.effective_status || null;
        }
      } catch {}
    }

    const summaryData = summaryRes.status === 'fulfilled' ? (summaryRes.value.data?.[0] || null) : null;
    const timeData = timeRes.status === 'fulfilled' ? (timeRes.value.data || []) : [];
    const ageData = ageRes.status === 'fulfilled' ? (ageRes.value.data || []) : [];
    const genderData = genderRes.status === 'fulfilled' ? (genderRes.value.data || []) : [];
    const regionData = regionRes.status === 'fulfilled' ? (regionRes.value.data || []) : [];
    const campsData = campsData0;
    const adsData = adRes.status === 'fulfilled' ? adRes.value : [];

    // Thumbnails dos top 12 anúncios por spend
    const top12 = adsData.slice(0, 12);
    let thumbMap = {};
    if (top12.length > 0) {
      try {
        const ids = top12.map(a => a.ad_id);
        const adObjs = await graphPaged(`act_${accountId}/ads`, {
          fields: 'id,name,creative{id,name,thumbnail_url,image_url}',
          filtering: JSON.stringify([{ field: 'id', operator: 'IN', value: ids }]),
          limit: 12
        }, 1);
        for (const a of adObjs) {
          if (a.creative) thumbMap[a.id] = a.creative.thumbnail_url || a.creative.image_url || null;
        }
      } catch {}
    }

    const spend = Number(summaryData?.spend || 0);
    const leads = getLeads(summaryData?.actions);
    const cpl = leads > 0 ? spend / leads : 0;
    const freq = Number(summaryData?.frequency || 0);
    const ctr = Number(summaryData?.ctr || 0);

    // Delta % — 1ª metade vs 2ª metade da série temporal
    let delta = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0 };
    if (timeData.length >= 2) {
      const half = Math.floor(timeData.length / 2);
      const sum1 = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0 };
      const sum2 = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0 };
      for (const d of timeData.slice(0, half)) {
        sum1.spend += Number(d.spend || 0);
        sum1.impressions += Number(d.impressions || 0);
        sum1.clicks += Number(d.clicks || 0);
        sum1.reach += Number(d.reach || 0);
        sum1.leads += getLeads(d.actions);
      }
      for (const d of timeData.slice(half)) {
        sum2.spend += Number(d.spend || 0);
        sum2.impressions += Number(d.impressions || 0);
        sum2.clicks += Number(d.clicks || 0);
        sum2.reach += Number(d.reach || 0);
        sum2.leads += getLeads(d.actions);
      }
      const pct = (a, b) => b > 0 ? ((a - b) / b * 100) : (a > 0 ? 100 : 0);
      delta = {
        spend: pct(sum2.spend, sum1.spend),
        impressions: pct(sum2.impressions, sum1.impressions),
        clicks: pct(sum2.clicks, sum1.clicks),
        reach: pct(sum2.reach, sum1.reach),
        leads: pct(sum2.leads, sum1.leads)
      };
    }

    // Score de saúde
    let score = 100;
    const reasons = [];
    if (freq > 2.5) { score -= 15; reasons.push(`frequência alta (${freq.toFixed(1)})`); }
    if (ctr < 0.5) { score -= 15; reasons.push(`CTR muito baixo (${ctr.toFixed(2)}%)`); }
    else if (ctr < 1) { score -= 15; reasons.push(`CTR abaixo de 1% (${ctr.toFixed(2)}%)`); }
    if (delta.leads < -5 && delta.spend > 5) { score -= 20; reasons.push('leads caindo com gasto subindo'); }
    if (delta.reach < -25) { score -= 10; reasons.push('alcance caindo >25%'); }
    if (cpl > 50) { score -= 10; reasons.push(`CPL alto (R$ ${cpl.toFixed(2)})`); }
    score = Math.max(0, score);

    // Recomendações
    const recs = [];
    if (freq > 2.5) recs.push({ priority: 'alta', text: 'Frequência alta - renovar criativos urgente' });
    if (cpl > 50) recs.push({ priority: 'alta', text: `CPL em R$ ${cpl.toFixed(2)} - revisar segmentação e criativos` });
    if (delta.leads < -10) recs.push({ priority: 'alta', text: 'Leads caindo - checar criativos e público' });
    const burnAds = adsData.filter(a => Number(a.spend || 0) > 100 && getLeads(a.actions) < 2);
    if (burnAds.length > 0) recs.push({ priority: 'media', text: `${burnAds.length} anúncio(s) gastando >R$100 sem leads - pausar` });
    if (delta.reach < -25) recs.push({ priority: 'media', text: 'Alcance caindo - ampliar público ou aumentar orçamento' });
    if (!recs.length) recs.push({ priority: 'ok', text: 'Conta saudável, sem alertas críticos' });

    res.json({
      summary: summaryData,
      leads,
      cpl,
      score,
      score_reasons: reasons,
      recommendations: recs,
      delta,
      time_series: timeData.map(d => ({
        date: d.date_start,
        spend: Number(d.spend || 0),
        impressions: Number(d.impressions || 0),
        clicks: Number(d.clicks || 0),
        reach: Number(d.reach || 0),
        leads: getLeads(d.actions)
      })),
      age_breakdown: ageData,
      gender_breakdown: genderData,
      region_breakdown: regionData.sort((a, b) => Number(b.reach || 0) - Number(a.reach || 0)).slice(0, 15),
      campaigns: campsData.map(c => ({ ...c, leads: getLeads(c.actions), objective: campObjectives[c.campaign_id] || null, effective_status: campStatuses[c.campaign_id] || null })).sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)),
      top_ads: top12.map(a => ({ ...a, leads: getLeads(a.actions), thumbnail: thumbMap[a.ad_id] || null })),
      all_ads: adsData.map(a => ({ ...a, leads: getLeads(a.actions) })).slice(0, 50)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/index.html', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-ads-dashboard listening on 0.0.0.0:${PORT}`);
});
