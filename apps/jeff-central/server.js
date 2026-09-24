const express = require('express');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const Database = require('better-sqlite3');

const execP = promisify(exec);

const PORT = process.env.PORT || 3031;
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'central.jefersonhenrike.com';
const SERVER_IP = process.env.SERVER_IP || '';
const WORKER_DB_PATH = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';

// ─── Auth ─────────────────────────────────────────────────────────────────────
const AUTH_SALT = 'jeff-central-2026';
const AUTH_HASH = 'ed5abdcfb6390b649b9dabba706936f093d3370f70fa0b7fbca2079da1657b2cbe209bc307b0a4184aa0bb86a7d30951ca09c3443cdf63213cf02ac2308b7a7c';
const sessions = new Map();
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

function verifyPwd(pwd) {
  try {
    const test = crypto.scryptSync(pwd, AUTH_SALT, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(AUTH_HASH, 'hex'));
  } catch { return false; }
}
function newSession() {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, Date.now() + SESSION_TTL);
  return tok;
}
function parseCookies(req) {
  const list = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) list[k.trim()] = decodeURIComponent(v.join('='));
  });
  return list;
}
function getSession(req) {
  const exp = sessions.get(parseCookies(req).sid);
  return exp && exp > Date.now();
}
function requireAuth(req, res, next) {
  if (!getSession(req)) return res.redirect('/login');
  next();
}
function apiAuth(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ─── DB (app_settings) ────────────────────────────────────────────────────────
let db = null;
try {
  db = new Database(WORKER_DB_PATH, { readonly: false, fileMustExist: true, timeout: 5000 });
  db.pragma('journal_mode = WAL');
} catch (e) {
  console.error('[central] aviso: nao abriu worker.db:', e.message);
}

const getSetting = (key) => {
  if (!db) return null;
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
};
const setSetting = (key, value) => {
  if (!db) return false;
  db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, value);
  return true;
};
const listSettingKeys = () => {
  if (!db) return [];
  return db.prepare('SELECT key, length(value) AS len FROM app_settings ORDER BY key').all();
};

// ─── Users (admin cadastro) ───────────────────────────────────────────────────
if (db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS central_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT,
        company TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_central_users_email ON central_users(email);
    `);
  } catch (e) { console.error('[central] falha criando central_users:', e.message); }
}

function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function createUser({ email, password, name, company, role }) {
  if (!db) throw new Error('db indisponivel');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const info = db.prepare(`INSERT INTO central_users (email, password_hash, salt, name, company, role)
                           VALUES (?, ?, ?, ?, ?, ?)`)
    .run(normEmail(email), hash, salt, name || null, company || null, role || 'admin');
  return { id: info.lastInsertRowid, email: normEmail(email), name, company, role: role || 'admin' };
}
function getUserByEmail(email) {
  if (!db) return null;
  return db.prepare('SELECT * FROM central_users WHERE email = ?').get(normEmail(email)) || null;
}
function verifyUserPassword(email, password) {
  const u = getUserByEmail(email);
  if (!u) return null;
  const test = hashPassword(password, u.salt);
  try {
    if (crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(u.password_hash, 'hex'))) return u;
  } catch {}
  return null;
}
function countAdmins() {
  if (!db) return 0;
  const r = db.prepare(`SELECT COUNT(*) AS c FROM central_users WHERE role = 'admin'`).get();
  return r ? r.c : 0;
}

// ─── Inventario apps PM2 ──────────────────────────────────────────────────────
const APP_CATALOG = [
  { name: 'gerente-comercial-ia',    label: 'Gerente Comercial IA',  port: null, desc: 'IA gerente comercial',         health: null,       group: 'core', logo: { letter: 'G', color: '#C4FF0E' } },
  { name: 'whatsapp-worker',         label: 'Zeus Worker',           port: 3002, desc: 'Core WhatsApp + API',          health: '/health',  group: 'core', logo: { letter: 'Z', color: '#C4FF0E' } },
  { name: 'agent-runner',            label: 'Agent Runner',          port: null, desc: 'Daemon Claude PM2',            health: null,       group: 'core', logo: { letter: 'A', color: '#C4FF0E' } },
  { name: 'zeus-platform',           label: 'Zeus Platform',         port: 4000, desc: 'Plataforma interna',           health: '/',        group: 'core', logo: { letter: 'Z', color: '#C4FF0E' } },
  { name: 'zeus-contacts',           label: 'Contatos',              port: 3010, desc: 'Gestão de contatos',           health: '/',        group: 'core', logo: { letter: 'C', color: '#0D9488' } },
  { name: 'jeff-ads-dashboard',      label: 'Ads Dashboard',         port: 3011, desc: 'Dashboard de anúncios',        health: '/',        group: 'ads',  logo: { letter: 'A', color: '#0866FF' } },
  { name: 'jeff-vps-monitor',        label: 'VPS Monitor',           port: 3012, desc: 'Monitoramento VPS',            health: '/login',   group: 'infra',logo: { letter: 'V', color: '#0EA5E9' } },
  { name: 'jeff-asaas-dashboard',    label: 'Asaas Dashboard',       port: 3013, desc: 'Financeiro Asaas',             health: '/',        group: 'fin',  logo: { letter: 'A', color: '#1A6CFF' } },
  { name: 'jeff-zapsign-webhook',    label: 'ZapSign Webhook',       port: 3014, desc: 'ZapSign listener',             health: '/',        group: 'wh',   logo: { letter: 'Z', color: '#16A37B' } },
  { name: 'jeff-clickup-webhook',    label: 'ClickUp Webhook',       port: 3015, desc: 'ClickUp listener',             health: '/',        group: 'wh',   logo: { letter: 'C', color: '#7B68EE' } },
  { name: 'jeff-onboarding',         label: 'Onboarding',            port: 3016, desc: 'Onboarding cliente',           health: '/',        group: 'cli',  logo: { letter: 'O', color: '#22C55E' } },
  { name: 'jeff-sistemas',           label: 'Hub Sistemas',          port: 3017, desc: 'Hub administrativo',           health: '/',        group: 'core', logo: { letter: 'H', color: '#2563EB' } },
  { name: 'jeff-google-oauth',       label: 'Google OAuth',          port: 3018, desc: 'OAuth Google',                 health: '/',        group: 'int',  logo: { letter: 'G', color: '#4285F4' } },
  { name: 'jeff-instagram-webhook',  label: 'Instagram Webhook',     port: 3019, desc: 'Instagram listener',           health: '/',        group: 'wh',   logo: { letter: 'I', color: '#E4405F' } },
  { name: 'jeff-alpha-clientes',     label: 'Alpha Clientes',        port: 3020, desc: 'Área Alpha clientes',          health: '/',        group: 'cli',  logo: { letter: 'A', color: '#C4FF0E' } },
  { name: 'jeff-cigc-clientarea',    label: 'CIGC Client Area',      port: 3021, desc: 'Área CIGC',                    health: '/',        group: 'cli',  logo: { letter: 'C', color: '#8B5CF6' } },
  { name: 'jeff-cigc-comercial',     label: 'CIGC Comercial',        port: 3022, desc: 'Comercial CIGC',               health: '/',        group: 'cli',  logo: { letter: 'C', color: '#8B5CF6' } },
  { name: 'jeff-farias-clientarea',  label: 'Farias Client Area',    port: 3023, desc: 'Área Farias',                  health: '/',        group: 'cli',  logo: { letter: 'F', color: '#F59E0B' } },
  { name: 'jeff-disparador',         label: 'Disparador',            port: 3024, desc: 'Disparo em massa',             health: '/',        group: 'core', logo: { letter: 'D', color: '#F59E0B' } },
  { name: 'jeff-meta-dashboard',     label: 'Meta Dashboard',        port: 3025, desc: 'Meta Ads',                     health: '/',        group: 'ads',  logo: { letter: 'M', color: '#0866FF' } },
  { name: 'jeff-cigc-forms',         label: 'CIGC Forms',            port: 3026, desc: 'Formulários CIGC',             health: '/',        group: 'cli',  logo: { letter: 'F', color: '#8B5CF6' } },
  { name: 'jeff-cigc-congresso',     label: 'CIGC Congresso',        port: 3028, desc: 'Congresso CIGC',               health: '/',        group: 'cli',  logo: { letter: 'C', color: '#8B5CF6' } },
  { name: 'jeff-farias-forms',       label: 'Farias Forms',          port: 3029, desc: 'Formulários Farias',           health: '/',        group: 'cli',  logo: { letter: 'F', color: '#F59E0B' } },
  { name: 'farias-monitor',          label: 'Farias Monitor',        port: null, desc: 'Monitor Farias (daemon)',      health: null,       group: 'mon',  logo: { letter: 'F', color: '#F59E0B' } },
  { name: 'jeff-board-org',          label: 'Board Org',             port: 3030, desc: 'Board organização',            health: '/',        group: 'core', logo: { letter: 'B', color: '#22C55E' } },
  { name: 'cigc-monitor',            label: 'CIGC Monitor',          port: null, desc: 'Monitor CIGC (daemon)',        health: null,       group: 'mon',  logo: { letter: 'C', color: '#8B5CF6' } },
];

const pmList = async () => {
  try {
    const { stdout } = await execP('pm2 jlist', { maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (e) {
    return [];
  }
};

const httpCheck = (port, pathTo = '/') => new Promise((resolve) => {
  if (!port) return resolve({ status: 'noport', ms: null, code: null });
  const start = Date.now();
  const req = http.request({ host: '127.0.0.1', port, path: pathTo, method: 'GET', timeout: 1800 }, (res) => {
    const ms = Date.now() - start;
    res.resume();
    resolve({ status: 'ok', ms, code: res.statusCode });
  });
  req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', ms: null, code: null }); });
  req.on('error', () => resolve({ status: 'down', ms: null, code: null }));
  req.end();
});

const computeAppsState = async () => {
  const list = await pmList();
  const byName = new Map(list.map(p => [p.name, p]));
  const out = [];
  for (const def of APP_CATALOG) {
    const pm = byName.get(def.name);
    const pmStatus = pm ? (pm.pm2_env && pm.pm2_env.status) : 'absent';
    let st = 'offline', ms = null, code = null;
    if (pmStatus === 'online') {
      if (def.port) {
        const h = await httpCheck(def.port, def.health || '/');
        if (h.status === 'ok') {
          code = h.code; ms = h.ms;
          if (h.code >= 200 && h.code < 400) st = 'online';
          else st = 'warn';
        } else if (h.status === 'noport') {
          st = 'online';
        } else {
          st = 'offline';
        }
      } else {
        st = 'online';
      }
    } else if (pmStatus === 'absent') {
      st = 'absent';
    }
    out.push({
      name: def.name,
      label: def.label,
      desc: def.desc,
      port: def.port,
      group: def.group,
      logo: def.logo,
      status: st,
      ms,
      code,
      pm2Status: pmStatus,
      restarts: pm ? (pm.pm2_env && pm.pm2_env.restart_time) : 0,
      uptime: pm && pm.pm2_env && pm.pm2_env.pm_uptime ? pm.pm2_env.pm_uptime : null,
    });
  }
  return out;
};

// ─── HTTP ─────────────────────────────────────────────────────────────────────
const app = express();
// Painel do Agente Posts (Automatik Inst embutido). Fica antes do express.json pra não consumir o corpo.
require('./zeuspost').mount(app, requireAuth);

// Exportar resposta do chat em PDF. Antes do express.json global porque uma resposta
// longa passa do limite de 256kb; este router usa um limite próprio.
app.use('/api/export', apiAuth, express.json({ limit: '4mb' }), require('./export').router);

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));


// Esqueci minha senha (código via WhatsApp do dono) — módulo compartilhado jeff-shared
require('/opt/jeff-apps/jeff-shared/password-reset').mount(app, {
  appName: 'Jeff Central',
  needsIdentifier: true,
  identifierLabel: 'E-mail',
  userExists: (email) => !!getUserByEmail(email),
  setPassword: (newPass, email) => {
    if (!db) return false;
    const salt = crypto.randomBytes(16).toString('hex');
    const r = db.prepare('UPDATE central_users SET password_hash = ?, salt = ? WHERE email = ?').run(hashPassword(newPass, salt), salt, normEmail(email));
    if (r.changes > 0) sessions.clear();
    return r.changes > 0;
  }
});

app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

app.get('/api/signup/status', (_req, res) => {
  res.json({ hasAdmin: countAdmins() > 0 });
});

app.post('/api/login', express.urlencoded({ extended: false }), (req, res) => {
  const email = req.body._email || req.body.email || '';
  const password = req.body.password || '';
  let ok = false;
  if (email) {
    ok = !!verifyUserPassword(email, password);
  } else {
    ok = verifyPwd(password);
  }
  if (!ok) return res.redirect('/login?error=1');
  const tok = newSession();
  res.set('Set-Cookie', `sid=${tok}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`);
  res.redirect('/');
});

app.post('/api/signup', express.urlencoded({ extended: false }), (req, res) => {
  const email = normEmail(req.body._email || req.body.email);
  const password = String(req.body.password || '');
  const name = (req.body._name || req.body.name || '').trim();
  const company = (req.body._company || req.body.company || '').trim();
  const invite = String(req.body.invite || req.query.invite || '');

  if (!email || !password) return res.redirect('/login?error=missing&mode=signup');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.redirect('/login?error=email&mode=signup');
  if (password.length < 8) return res.redirect('/login?error=weak&mode=signup');

  const alreadyAdmin = countAdmins() > 0;
  const INVITE_TOKEN = process.env.CENTRAL_INVITE_TOKEN || '';
  if (alreadyAdmin) {
    if (!INVITE_TOKEN || invite !== INVITE_TOKEN) {
      return res.redirect('/login?error=invite&mode=signup');
    }
  }

  if (getUserByEmail(email)) return res.redirect('/login?error=exists&mode=signup');

  try {
    createUser({ email, password, name, company, role: 'admin' });
  } catch (e) {
    console.error('[central] signup falhou:', e.message);
    return res.redirect('/login?error=server&mode=signup');
  }

  const tok = newSession();
  res.set('Set-Cookie', `sid=${tok}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`);
  res.redirect('/');
});
app.get('/api/logout', (req, res) => {
  const c = parseCookies(req);
  if (c.sid) sessions.delete(c.sid);
  res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});
app.get('/', requireAuth, (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ─── WhatsApp (Evolution API proxy) ───────────────────────────────────────────
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution.jefersonhenrike.com';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '81e2543a6cef506445dd9554223deffe89cdc1e4f6a65526';

if (db) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS wa_instance_meta (
        instance_name TEXT PRIMARY KEY,
        friendly_name TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  } catch (e) { console.error('[central] falha wa_instance_meta:', e.message); }
}

async function evo(method, pathTo, body) {
  const url = EVOLUTION_URL.replace(/\/+$/, '') + pathTo;
  const opts = { method, headers: { 'apikey': EVOLUTION_KEY, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, data: json };
}

function getMeta(name) {
  if (!db) return {};
  const r = db.prepare('SELECT friendly_name, note FROM wa_instance_meta WHERE instance_name = ?').get(name);
  return r || {};
}
function setMeta(name, friendly, note) {
  if (!db) return;
  db.prepare(`INSERT INTO wa_instance_meta (instance_name, friendly_name, note, updated_at)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(instance_name) DO UPDATE SET
                friendly_name = COALESCE(excluded.friendly_name, wa_instance_meta.friendly_name),
                note = COALESCE(excluded.note, wa_instance_meta.note),
                updated_at = excluded.updated_at`).run(name, friendly || null, note || null);
}

app.get('/api/wa/instances', apiAuth, async (_req, res) => {
  const r = await evo('GET', '/instance/fetchInstances');
  if (!r.ok) return res.status(r.status).json({ error: 'evolution_error', data: r.data });
  const list = Array.isArray(r.data) ? r.data : [];
  const enriched = list.map(i => {
    const meta = getMeta(i.name);
    return {
      name: i.name,
      friendly: meta.friendly_name || i.name,
      note: meta.note || null,
      status: i.connectionStatus,
      number: i.ownerJid ? String(i.ownerJid).split('@')[0] : null,
      profileName: i.profileName || null,
      avatar: i.profilePicUrl || null,
      integration: i.integration
    };
  });
  res.json({ instances: enriched });
});

app.post('/api/wa/instances', apiAuth, async (req, res) => {
  const { friendly, note } = req.body || {};
  if (!friendly || typeof friendly !== 'string') return res.status(400).json({ error: 'friendly_required' });
  const slug = friendly.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || ('wa-' + Date.now());
  const name = slug + '-' + crypto.randomBytes(3).toString('hex');
  const r = await evo('POST', '/instance/create', { instanceName: name, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
  if (!r.ok) return res.status(r.status).json({ error: 'create_failed', data: r.data });
  setMeta(name, friendly, note);
  res.json({ name, friendly, qr: (r.data && r.data.qrcode) || null, data: r.data });
});

app.get('/api/wa/instances/:name/qr', apiAuth, async (req, res) => {
  const r = await evo('GET', `/instance/connect/${encodeURIComponent(req.params.name)}`);
  if (!r.ok) return res.status(r.status).json({ error: 'qr_failed', data: r.data });
  res.json(r.data);
});

app.get('/api/wa/instances/:name/state', apiAuth, async (req, res) => {
  const r = await evo('GET', `/instance/connectionState/${encodeURIComponent(req.params.name)}`);
  if (!r.ok) return res.status(r.status).json({ error: 'state_failed', data: r.data });
  res.json(r.data);
});

app.patch('/api/wa/instances/:name', apiAuth, (req, res) => {
  const { friendly, note } = req.body || {};
  setMeta(req.params.name, friendly, note);
  res.json({ ok: true });
});

app.post('/api/wa/instances/:name/logout', apiAuth, async (req, res) => {
  const r = await evo('DELETE', `/instance/logout/${encodeURIComponent(req.params.name)}`);
  res.json({ ok: r.ok, data: r.data });
});

app.delete('/api/wa/instances/:name', apiAuth, async (req, res) => {
  const r = await evo('DELETE', `/instance/delete/${encodeURIComponent(req.params.name)}`);
  if (db) db.prepare('DELETE FROM wa_instance_meta WHERE instance_name = ?').run(req.params.name);
  res.json({ ok: r.ok, data: r.data });
});

// API
app.get('/api/me', apiAuth, (_req, res) => res.json({ ok: true, host: PUBLIC_HOST, ip: SERVER_IP }));

app.get('/api/apps', apiAuth, async (_req, res) => {
  const apps = await computeAppsState();
  const total = apps.length;
  const online = apps.filter(a => a.status === 'online').length;
  const warn = apps.filter(a => a.status === 'warn').length;
  const offline = apps.filter(a => a.status === 'offline' || a.status === 'absent').length;
  const msVals = apps.filter(a => typeof a.ms === 'number').map(a => a.ms);
  const avg = msVals.length ? Math.round(msVals.reduce((s, v) => s + v, 0) / msVals.length) : 0;
  res.json({ apps, summary: { total, online, warn, offline, avgMs: avg } });
});

app.post('/api/apps/:name/restart', apiAuth, async (req, res) => {
  const name = req.params.name;
  if (!APP_CATALOG.some(a => a.name === name)) return res.status(404).json({ error: 'unknown app' });
  try {
    await execP(`pm2 restart ${name}`, { timeout: 15000 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/whatsapp/status', apiAuth, async (_req, res) => {
  const h = await httpCheck(3002, '/health');
  res.json({ status: h.status === 'ok' && h.code < 400 ? 'connected' : 'disconnected', code: h.code, ms: h.ms });
});
app.post('/api/whatsapp/restart', apiAuth, async (_req, res) => {
  try { await execP('pm2 restart whatsapp-worker', { timeout: 20000 }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/whatsapp/logout', apiAuth, async (_req, res) => {
  res.json({ ok: false, note: 'logout do WhatsApp requer ação no worker; use /api/whatsapp/restart e re-pareie via /qr no worker' });
});

// Chaves: lista mascarada de TODAS as chaves do app_settings; permite atualizar
const SECRET_PATTERNS = /(_api_key|_api_token|_token|_secret|_password|_passphrase|_pwd|_pin|_signing_key|_webhook_auth)$/i;
const VISIBLE_PATTERNS = /(_id|_handle|_url|_email|_phone|_folder|_voice|_default|_model|_users_authorized|_panic|_debounce_ms|_history_limit|_max_tokens|_last_id|_group|_name|_workspace|_space|_assignee)$/i;

const maskValue = (v) => {
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return v.slice(0, 4) + '••••' + v.slice(-4);
};

app.get('/api/keys', apiAuth, (_req, res) => {
  const rows = listSettingKeys();
  const items = rows.map(r => {
    const isSecret = SECRET_PATTERNS.test(r.key);
    const val = getSetting(r.key);
    return {
      key: r.key,
      secret: isSecret,
      preview: isSecret ? maskValue(val) : (val || ''),
      length: r.len,
      empty: !r.len,
    };
  });
  res.json({ items });
});
app.post('/api/keys', apiAuth, (req, res) => {
  const { key, value } = req.body || {};
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key obrigatório' });
  if (typeof value !== 'string') return res.status(400).json({ error: 'value deve ser string' });
  setSetting(key, value);
  res.json({ ok: true });
});

// Links — webhooks, OAuth, infra
const LINKS = (host, ip) => ({
  ip,
  groups: [
    {
      title: 'Webhooks de entrada',
      hint: 'Cole estes URLs nos serviços externos',
      rows: [
        { id: 'wh-zapsign',   name: 'ZapSign Webhook',       desc: 'URL configurada no ZapSign',           url: 'https://zapsign.jefersonhenrike.com/webhook' },
        { id: 'wh-instagram', name: 'Instagram Webhook',     desc: 'Callback Meta Graph',                  url: 'https://instagram.jefersonhenrike.com/webhook' },
        { id: 'wh-clickup',   name: 'ClickUp Webhook',       desc: 'Listener ClickUp',                     url: 'https://clickup.jefersonhenrike.com/webhook' },
        { id: 'wh-asaas',     name: 'Asaas Webhook',         desc: 'Callback Asaas',                       url: 'https://asaas.jefersonhenrike.com/webhook' },
      ],
    },
    {
      title: 'OAuth & Callbacks',
      hint: 'Endpoints OAuth e verificação',
      rows: [
        { id: 'oc-google',  name: 'Google OAuth Callback', desc: 'Redirect URI Google Cloud Console',     url: 'https://google.jefersonhenrike.com/oauth/callback' },
        { id: 'oc-meta',    name: 'Meta OAuth',            desc: 'Redirect Meta Business',                url: `http://${ip}:3025/oauth/callback` },
        { id: 'oc-health',  name: 'Worker Health Check',   desc: 'Verificação de status do worker',       url: `http://${ip}:3002/health` },
      ],
    },
    {
      title: 'Infraestrutura interna',
      hint: 'Painéis de infraestrutura e proxy',
      rows: [
        { id: 'inf-npm',    name: 'NPM (Nginx Proxy Manager)', desc: 'Proxy reverso e SSL',                url: `http://${ip}:81` },
        { id: 'inf-vps',    name: 'VPS Monitor',               desc: 'Métricas e logs do servidor',        url: `http://${ip}:3012` },
        { id: 'inf-central',name: 'Central (este painel)',     desc: 'Acesso ao painel central',           url: `https://${host}` },
      ],
    },
  ],
  accessCards: APP_CATALOG.filter(a => a.port).map(a => ({
    id: a.name,
    name: a.label,
    port: ':' + a.port,
    desc: a.desc,
    url: `http://${ip}:${a.port}`,
  })),
});

app.get('/api/links', apiAuth, (_req, res) => res.json(LINKS(PUBLIC_HOST, SERVER_IP || '127.0.0.1')));

// Chat com Zeus (Claude CLI)
const chat = require('./chat');
app.use('/api/chat', apiAuth, chat.router);

// "Seu dia" da home: tarefas reais do ClickUp (cache do worker) e do Agente de Ações
app.use('/api/home', apiAuth, require('./home-dia').router);

// Agentes (ZEUS + próprios): persona, habilidades e base de conhecimento
const agents = require('./agents');
app.use('/api/agents', apiAuth, agents.router);

// Base de conhecimento da empresa (tela /conhecimento): documentos, extração, chunks e busca pro RAG
const knowledge = require('./knowledge');
app.use('/api/knowledge', apiAuth, knowledge.router);

// Motor de Growth: dashboard de mídia paga com dados reais (Meta Ads) e base do Estrategista de Growth IA
const growth = require('./growth');
app.use('/api/growth', apiAuth, growth.router);

// Equipes de agentes: orquestrador planeja, distribui entre os agentes e consolida
const teams = require('./teams');
app.use('/api/teams', apiAuth, teams.router);

// PDI: planos de desenvolvimento individual, metas 70-20-10, check-ins e templates
const pdi = require('./pdi');
app.use('/api/pdi', apiAuth, pdi.router);

// OKRs (/okrs): ciclos, objetivos desdobrados, resultados-chave, check-ins e criação com IA
const okrs = require('./okrs');
app.use('/api/okrs', apiAuth, okrs.router);

// Configurações: dados da empresa, marca, preferências, pessoas, estrutura, liderança, permissões e consumo
const config = require('./config');
app.use('/api/config', apiAuth, config.router);

// Botão flutuante: tarefas do Agente de Ações e chamados de Suporte
const widget = require('./widget');
app.use('/api/widget', apiAuth, widget.router);

// Habilidades (/habilidades): regras de prompt e skills do Claude Code, com criação e edição
const skills = require('./skills');
app.use('/api/skills', apiAuth, skills.router);

// Ações (/acoes): tarefas reais do ClickUp (token em app_settings.clickup_api_token)
const clickup = require('./clickup');
app.use('/api/clickup', apiAuth, clickup.router);

// Rotinas (/rotinas): pedidos agendados que o ZEUS executa sozinho e entrega em Conversas, WhatsApp ou e-mail
const rotinas = require('./rotinas');
app.use('/api/rotinas', apiAuth, rotinas.router);
rotinas.startScheduler();

// Rotas do app com URL limpa (/okrs, /motor/vendas): tudo que não é /api nem arquivo cai no index
app.get(/^\/(?!api\/)[^.]*$/, requireAuth, (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`[jeff-central] up on :${PORT} (public: ${PUBLIC_HOST}, server ip: ${SERVER_IP || '?'})`);
});
