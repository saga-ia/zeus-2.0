'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const multer = require('multer');
const Database = require('better-sqlite3');

const PORT = parseInt(process.env.PORT || '3020', 10);
const DB_PATH = path.join(__dirname, 'data', 'clientes.db');

const AUTO_ADMIN_EMAILS = new Set(['jefersonhenrike1@gmail.com']);
const JEFF_CHAT_ID = '196830382014470@lid';
const WAPI_SCRIPT = '/opt/jeff-worker/scripts/wapi.sh';
const WORKER_DB_PATH = '/opt/jeff-worker/data/worker.db';

function notifyJeff(message) {
  try {
    const payload = JSON.stringify({ chatId: JEFF_CHAT_ID, message });
    execFile(WAPI_SCRIPT, ['POST', '/send-message', payload], { timeout: 10000 }, (err) => {
      if (err) console.error('[notifyJeff]', err.message);
    });
  } catch (e) {
    console.error('[notifyJeff]', e.message);
  }
}
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString('hex');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// schema do form dinâmico (sections + questions + sessions + responses + app_settings)
require('./scripts/migrate-form-inline')(db);

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1);
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 8 },
}));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname).slice(0, 12);
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function audit(userId, action, target, meta) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, target, meta) VALUES (?, ?, ?, ?)')
      .run(userId || null, action, target || null, meta ? JSON.stringify(meta) : null);
  } catch (_) {}
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

function flash(req) {
  const f = req.session.flash;
  delete req.session.flash;
  return f || null;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function parseJsonField(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

// ===== GOOGLE SHEETS =====
async function getFreshGoogleToken() {
  const workerDb = new Database(WORKER_DB_PATH, { readonly: true });
  let t;
  try { t = workerDb.prepare("SELECT * FROM google_oauth_tokens WHERE provider='google' AND user_key='jefersonhenrike1@gmail.com'").get(); }
  finally { workerDb.close(); }
  if (!t) throw new Error('Token Google nao encontrado.');
  const expiresAt = new Date(t.expires_at.replace(' ', 'T') + 'Z').getTime();
  if (Date.now() < expiresAt) return t.access_token;
  // refresh
  const workerDb2 = new Database(WORKER_DB_PATH);
  try {
    const clientId = workerDb2.prepare("SELECT value FROM app_settings WHERE key='google_oauth_client_id'").get()?.value;
    const clientSecret = workerDb2.prepare("SELECT value FROM app_settings WHERE key='google_oauth_client_secret'").get()?.value;
    if (!clientId || !clientSecret) throw new Error('google_oauth credentials faltando');
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: t.refresh_token })
    });
    const tok = await r.json();
    if (!r.ok) throw new Error('refresh falhou: ' + JSON.stringify(tok));
    const newExp = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString().replace('T', ' ').slice(0, 19);
    workerDb2.prepare("UPDATE google_oauth_tokens SET access_token=?, expires_at=?, updated_at=datetime('now') WHERE provider='google' AND user_key='jefersonhenrike1@gmail.com'")
      .run(tok.access_token, newExp);
    return tok.access_token;
  } finally { workerDb2.close(); }
}

function getSetting(key) {
  const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return r ? r.value : null;
}

function setSetting(key, value) {
  db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run(key, value);
}

async function getOrCreateOnboardingSheet(accessToken) {
  let id = getSetting('onboarding_sheet_id');
  if (id) return id;
  const headers = ['timestamp_brt', 'session_id', 'slug', 'cliente'];
  const sections = db.prepare('SELECT id FROM form_sections WHERE ativo = 1 ORDER BY ordem').all();
  const qStmt = db.prepare('SELECT qkey, label FROM form_questions WHERE section_id = ? AND ativo = 1 ORDER BY ordem');
  for (const s of sections) for (const q of qStmt.all(s.id)) headers.push(q.qkey);

  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { title: 'Alpha Onboarding · Respostas' }, sheets: [{ properties: { title: 'Respostas' } }] })
  });
  const data = await r.json();
  if (!r.ok) throw new Error('criar planilha falhou: ' + JSON.stringify(data));
  id = data.spreadsheetId;
  setSetting('onboarding_sheet_id', id);
  setSetting('onboarding_sheet_url', data.spreadsheetUrl || '');
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Respostas!A1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [headers] })
  });
  return id;
}

async function appendOnboardingToSheets(sess, answers) {
  try {
    const accessToken = await getFreshGoogleToken();
    const sheetId = await getOrCreateOnboardingSheet(accessToken);
    const sections = db.prepare('SELECT id FROM form_sections WHERE ativo = 1 ORDER BY ordem').all();
    const qStmt = db.prepare('SELECT qkey FROM form_questions WHERE section_id = ? AND ativo = 1 ORDER BY ordem');
    const row = [
      new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      sess.id,
      sess.slug || '',
      answers.nome || '',
    ];
    for (const s of sections) for (const q of qStmt.all(s.id)) row.push(answers[q.qkey] || '');
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Respostas!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] })
    });
  } catch (e) {
    console.error('[sheets]', e.message);
  }
}

const TABS = [
  { key: 'informacoes',  label: 'Informações'  },
  { key: 'painel',       label: 'Painel'       },
  { key: 'visao_geral',  label: 'Visão Geral'  },
  { key: 'estrategia',   label: 'Estratégia'   },
  { key: 'ads',          label: 'Ads'          },
  { key: 'site',         label: 'Site / LP'    },
  { key: 'contrato',     label: 'Contrato'     },
  { key: 'financeiro',   label: 'Financeiro'   },
  { key: 'atendimento',  label: 'Atendimento'  },
  { key: 'tarefas',      label: 'Tarefas'      },
  { key: 'anexos',       label: 'Anexos'       },
];

const TAB_FIELDS = {
  visao_geral:  ['resumo', 'segmento', 'icp', 'posicionamento', 'observacoes'],
  estrategia:   ['objetivo', 'metas', 'planos', 'observacoes'],
  ads:          ['plataformas', 'budget_mensal', 'campanhas_ativas', 'observacoes'],
  site:         ['url', 'cms', 'status', 'observacoes'],
  contrato:     ['inicio', 'fim', 'valor_mensal', 'modalidade', 'zapsign_id', 'observacoes'],
  financeiro:   ['cliente_asaas_id', 'fatura_atual', 'inadimplencia', 'observacoes'],
  atendimento:  ['canal_principal', 'sla', 'responsavel', 'observacoes'],
  tarefas:      ['lista'],
  anexos:       ['observacoes'],
};

// ============== MIDDLEWARE: detecta subdomínio do painel do cliente ==============
const PAINEL_DOMAIN = 'jefersonhenrike.com';
const ADMIN_HOSTS = new Set(['cliente.jefersonhenrike.com', 'cliente.jefersonhenrike.com:3020']);

app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  if (host && host.endsWith('.' + PAINEL_DOMAIN) && host !== 'cliente.' + PAINEL_DOMAIN && host !== 'www.' + PAINEL_DOMAIN) {
    const slug = host.slice(0, -('.' + PAINEL_DOMAIN).length);
    if (slug && /^[a-z0-9][a-z0-9-]{0,40}$/.test(slug)) {
      const client = db.prepare('SELECT * FROM clients WHERE slug = ? OR onboarding_slug = ?').get(slug, slug);
      if (client) {
        req.painelClient = client;
        req.painelSlug = slug;
        if (!req.url.startsWith('/_painel') && !req.url.startsWith('/static') && req.url !== '/health') {
          req.url = '/_painel' + req.url;
        }
      }
    }
  }
  res.locals.session = req.session;
  res.locals.flash = flash(req);
  res.locals.painelClient = req.painelClient || null;
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, t: Date.now() }));

// ================= LOGIN =================
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { step: 'password' });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    setFlash(req, 'error', 'Email ou senha inválidos.');
    return res.redirect('/login');
  }
  if (user.status === 'pending') {
    setFlash(req, 'error', 'Seu cadastro está aguardando aprovação do Jeferson.');
    return res.redirect('/login');
  }
  if (user.status === 'rejected' || user.status === 'disabled') {
    setFlash(req, 'error', 'Acesso desabilitado.');
    return res.redirect('/login');
  }
  req.session.userId = user.id;
  req.session.userEmail = user.email;
  req.session.userName = user.name;
  req.session.totpVerified = true; // 2FA desativado temporariamente
  audit(user.id, 'login_password_ok', 'user:' + user.id);
  res.redirect('/dashboard');
});

app.get('/login/totp', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('login', { step: 'totp' });
});

app.post('/login/totp', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.totp_enabled) return res.redirect('/login/totp/setup');
  const ok = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token: String(req.body.code || '').replace(/\D/g, ''),
    window: 1,
  });
  if (!ok) {
    setFlash(req, 'error', 'Código TOTP inválido.');
    return res.redirect('/login/totp');
  }
  req.session.totpVerified = true;
  audit(user.id, 'login_totp_ok', 'user:' + user.id);
  res.redirect('/dashboard');
});

app.get('/login/totp/setup', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.redirect('/login');
  if (user.totp_enabled) return res.redirect('/login/totp');
  let secret = user.totp_secret;
  if (!secret) {
    const gen = speakeasy.generateSecret({ length: 20, name: `Alpha Clientes (${user.email})`, issuer: 'Alpha Digital' });
    secret = gen.base32;
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);
  }
  const otpauth = speakeasy.otpauthURL({ secret, label: `Alpha Clientes (${user.email})`, issuer: 'Alpha Digital', encoding: 'base32' });
  const qr = await qrcode.toDataURL(otpauth);
  res.render('totp_setup', { secret, qr });
});

app.post('/login/totp/setup', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.redirect('/login');
  const ok = speakeasy.totp.verify({
    secret: user.totp_secret, encoding: 'base32',
    token: String(req.body.code || '').replace(/\D/g, ''), window: 1,
  });
  if (!ok) {
    setFlash(req, 'error', 'Código inválido. Confira o app autenticador.');
    return res.redirect('/login/totp/setup');
  }
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
  req.session.totpVerified = true;
  audit(user.id, 'totp_enabled', 'user:' + user.id);
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  const uid = req.session.userId;
  req.session.destroy(() => {});
  audit(uid, 'logout', 'user:' + uid);
  res.redirect('/login');
});

// ================= RESET DE SENHA =================
app.get('/forgot-password', (req, res) => {
  res.render('login', { step: 'forgot' });
});

app.post('/forgot-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare("SELECT id, email, name FROM users WHERE email = ? AND status = 'approved'").get(email);
  if (user) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?').run(user.id, Math.floor(Date.now() / 1000));
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/reset-password/${token}`;
    notifyJeff(`Redefinicao de senha solicitada para ${user.name} (${user.email}).\nLink (expira em 1h):\n${link}`);
    audit(user.id, 'password_reset_requested', 'user:' + user.id);
  }
  setFlash(req, 'ok', 'Se o email estiver cadastrado, voce receberao link de redefinicao via WhatsApp.');
  res.redirect('/forgot-password');
});

app.get('/reset-password/:token', (req, res) => {
  const record = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > ?')
    .get(req.params.token, Math.floor(Date.now() / 1000));
  if (!record) {
    setFlash(req, 'error', 'Link invalido ou expirado. Solicite um novo.');
    return res.redirect('/forgot-password');
  }
  res.render('login', { step: 'reset', token: req.params.token });
});

app.post('/reset-password/:token', (req, res) => {
  const record = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > ?')
    .get(req.params.token, Math.floor(Date.now() / 1000));
  if (!record) {
    setFlash(req, 'error', 'Link invalido ou expirado. Solicite um novo.');
    return res.redirect('/forgot-password');
  }
  const password = String(req.body.password || '');
  const password2 = String(req.body.password2 || '');
  if (password.length < 8) {
    setFlash(req, 'error', 'Senha precisa ter pelo menos 8 caracteres.');
    return res.redirect(`/reset-password/${req.params.token}`);
  }
  if (password !== password2) {
    setFlash(req, 'error', 'Senhas nao coincidem.');
    return res.redirect(`/reset-password/${req.params.token}`);
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, record.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(req.params.token);
  audit(record.user_id, 'password_reset_done', 'user:' + record.user_id);
  setFlash(req, 'ok', 'Senha redefinida com sucesso. Faca login.');
  res.redirect('/login');
});

// ================= CADASTRO =================
app.get('/signup', (req, res) => {
  res.render('signup', { form: {} });
});

app.post('/signup', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  const password2 = String(req.body.password2 || '');

  if (!email || !name || !password) {
    setFlash(req, 'error', 'Preencha email, nome e senha.');
    return res.redirect('/signup');
  }
  if (password.length < 8) {
    setFlash(req, 'error', 'Senha precisa ter pelo menos 8 caracteres.');
    return res.redirect('/signup');
  }
  if (password !== password2) {
    setFlash(req, 'error', 'As senhas não conferem.');
    return res.redirect('/signup');
  }
  const existing = db.prepare('SELECT id, status FROM users WHERE email = ?').get(email);
  if (existing) {
    setFlash(req, 'error', 'Já existe cadastro com esse email.');
    return res.redirect('/signup');
  }

  const isAuto = AUTO_ADMIN_EMAILS.has(email);
  const status = isAuto ? 'active' : 'pending';
  const role = isAuto ? 'admin' : 'user';
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (email, name, password_hash, role, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(email, name, hash, role, status);
  audit(info.lastInsertRowid, 'signup', 'user:' + info.lastInsertRowid, { auto: isAuto });

  if (isAuto) {
    setFlash(req, 'ok', 'Cadastro criado. Faça login pra configurar 2FA.');
    return res.redirect('/login');
  }

  notifyJeff(
    `Novo cadastro pendente em cliente.jefersonhenrike.com\n\n` +
    `Nome: ${name}\nEmail: ${email}\n\n` +
    `Aprovar: https://cliente.jefersonhenrike.com/admin/users\n` +
    `(login com seu admin)`
  );
  setFlash(req, 'ok', 'Cadastro recebido. Jeferson foi notificado e vai liberar seu acesso.');
  res.redirect('/login');
});

// ================= ADMIN USUÁRIOS =================
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!u || u.role !== 'admin') return res.status(403).send('Acesso restrito a admin.');
  next();
}

app.get('/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare("SELECT id, email, name, role, status, totp_enabled, created_at FROM users ORDER BY status = 'pending' DESC, created_at DESC").all();
  res.render('admin_users', { users });
});

app.post('/admin/users/:id/aprovar', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).send('Usuário não encontrado');
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(id);
  audit(req.session.userId, 'user_approve', 'user:' + id);
  notifyJeff(`Cadastro aprovado: ${target.name} <${target.email}>`);
  setFlash(req, 'ok', 'Usuário aprovado.');
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/rejeitar', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const target = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).send('Usuário não encontrado');
  db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(id);
  audit(req.session.userId, 'user_reject', 'user:' + id);
  setFlash(req, 'ok', 'Usuário rejeitado.');
  res.redirect('/admin/users');
});

app.post('/admin/users/:id/excluir', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.session.userId) {
    setFlash(req, 'error', 'Não pode excluir a si mesmo.');
    return res.redirect('/admin/users');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  audit(req.session.userId, 'user_delete', 'user:' + id);
  setFlash(req, 'ok', 'Usuário excluído.');
  res.redirect('/admin/users');
});

// ================= DASHBOARD =================
app.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard');
});

app.get('/clientes', requireAuth, (req, res) => {
  const clients = db.prepare(`
    SELECT c.id, c.name, c.slug, c.status, c.contact_name, c.contact_phone, c.contact_email,
           c.onboarding_slug, c.updated_at, c.qa_token, c.external_url,
           s.id AS session_id, s.completed_at AS onb_completed,
           CASE WHEN s.photo_path IS NOT NULL AND s.photo_path != '' THEN 1 ELSE 0 END AS has_photo
    FROM clients c
    LEFT JOIN form_sessions s ON s.id = c.onboarding_session_id
    ORDER BY c.status = 'ativo' DESC, c.updated_at DESC
  `).all();
  const pendingLeads = db.prepare("SELECT COUNT(*) as n FROM leads WHERE status = 'pending'").get().n;
  res.render('clientes', { clients, pendingLeads });
});

// ============== CLIENTES ==============
app.get('/clientes/novo', requireAuth, (req, res) => {
  res.render('cliente_novo', { form: {} });
});

app.post('/clientes/novo', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) {
    setFlash(req, 'error', 'Nome é obrigatório.');
    return res.redirect('/clientes/novo');
  }
  const slug = slugify(req.body.slug || name) || ('cliente-' + Date.now());
  const info = db.prepare(`
    INSERT INTO clients (name, slug, status, contact_name, contact_phone, contact_email)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name, slug, req.body.status || 'ativo',
    req.body.contact_name || null, req.body.contact_phone || null, req.body.contact_email || null
  );
  audit(req.session.userId, 'client_create', 'client:' + info.lastInsertRowid, { name, slug });
  setFlash(req, 'ok', 'Cliente criado.');
  res.redirect('/clientes/' + info.lastInsertRowid);
});

app.get('/clientes/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).send('Cliente não encontrado');
  const tab = (req.query.tab && TABS.find(t => t.key === req.query.tab)) ? req.query.tab : 'informacoes';
  const tabData = parseJsonField(client[tab + '_json']);
  const attachments = db.prepare('SELECT * FROM attachments WHERE client_id = ? ORDER BY uploaded_at DESC').all(id);

  let painel = null;
  if (tab === 'painel') {
    painel = {
      blocks: loadDocTemplate().blocks,
      state: loadClientPanelState(client.id),
      subdomainUrl: client.slug ? `https://${client.slug}.jefersonhenrike.com` : null,
    };
  }

  let info = null;
  if (tab === 'informacoes') {
    let session = client.onboarding_session_id ? db.prepare('SELECT * FROM form_sessions WHERE id = ?').get(client.onboarding_session_id) : null;
    if (!session && client.onboarding_slug) session = db.prepare('SELECT * FROM form_sessions WHERE slug = ?').get(client.onboarding_slug);
    const answers = session ? loadSessionAnswers(session.id) : {};
    const schema = loadFormSchema();
    const totalQs = schema.reduce((s, sec) => s + sec.questions.length, 0);
    const answered = Object.values(answers).filter(v => String(v || '').trim()).length;
    info = {
      session, answers, schema, totalQs, answered,
      onboardingLink: client.onboarding_slug ? `https://cliente.jefersonhenrike.com/onboarding/${client.onboarding_slug}` : null,
      publicLink: client.qa_token ? `https://cliente.jefersonhenrike.com/r/${client.qa_token}.md` : null,
      iaConfigured: !!loadAnthropicKey(),
    };
  }

  res.render('cliente', { client, tab, tabs: TABS, tabData, tabFields: TAB_FIELDS[tab] || [], attachments, info, painel });
});

app.post('/clientes/:id/tab/:tab', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tab = req.params.tab;
  if (!TABS.find(t => t.key === tab)) return res.status(400).send('Aba inválida');
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).send('Cliente não encontrado');
  const fields = TAB_FIELDS[tab] || [];
  const data = {};
  for (const f of fields) data[f] = req.body[f] || '';
  db.prepare(`UPDATE clients SET ${tab}_json = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(data), id);
  audit(req.session.userId, 'client_tab_save', 'client:' + id, { tab });
  setFlash(req, 'ok', 'Salvo.');
  res.redirect(`/clientes/${id}?tab=${tab}`);
});

app.post('/clientes/:id/meta', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).send('Cliente não encontrado');
  db.prepare(`UPDATE clients SET name = ?, status = ?, contact_name = ?, contact_phone = ?, contact_email = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      String(req.body.name || '').trim() || 'Sem nome',
      req.body.status || 'ativo',
      req.body.contact_name || null,
      req.body.contact_phone || null,
      req.body.contact_email || null,
      id
    );
  audit(req.session.userId, 'client_meta_save', 'client:' + id);
  setFlash(req, 'ok', 'Dados do cliente atualizados.');
  res.redirect(`/clientes/${id}`);
});

app.post('/clientes/:id/anexos', requireAuth, upload.single('file'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).send('Cliente não encontrado');
  if (!req.file) {
    setFlash(req, 'error', 'Selecione um arquivo.');
    return res.redirect(`/clientes/${id}?tab=anexos`);
  }
  db.prepare(`INSERT INTO attachments (client_id, filename, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?)`)
    .run(id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size);
  audit(req.session.userId, 'attachment_upload', 'client:' + id, { name: req.file.originalname, size: req.file.size });
  setFlash(req, 'ok', 'Anexo enviado.');
  res.redirect(`/clientes/${id}?tab=anexos`);
});

app.get('/clientes/:id/anexos/:attId', requireAuth, (req, res) => {
  const att = db.prepare('SELECT * FROM attachments WHERE id = ? AND client_id = ?')
    .get(parseInt(req.params.attId, 10), parseInt(req.params.id, 10));
  if (!att) return res.status(404).send('Não encontrado');
  res.download(path.join(UPLOAD_DIR, att.filename), att.original_name || att.filename);
});

app.post('/clientes/:id/anexos/:attId/delete', requireAuth, (req, res) => {
  const att = db.prepare('SELECT * FROM attachments WHERE id = ? AND client_id = ?')
    .get(parseInt(req.params.attId, 10), parseInt(req.params.id, 10));
  if (!att) return res.status(404).send('Não encontrado');
  try { fs.unlinkSync(path.join(UPLOAD_DIR, att.filename)); } catch {}
  db.prepare('DELETE FROM attachments WHERE id = ?').run(att.id);
  audit(req.session.userId, 'attachment_delete', 'client:' + req.params.id, { id: att.id });
  setFlash(req, 'ok', 'Anexo removido.');
  res.redirect(`/clientes/${req.params.id}?tab=anexos`);
});

// ============== INFO DO CLIENTE: Q&A pública (markdown), perguntar à IA, token ==============
const ANTHROPIC_KEY_FILE = '/root/.zeus/anthropic_api_key';
function loadAnthropicKey() {
  try {
    if (fs.existsSync(ANTHROPIC_KEY_FILE)) {
      const k = fs.readFileSync(ANTHROPIC_KEY_FILE, 'utf8').trim();
      if (k) return k;
    }
  } catch (_) {}
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  const s = getSetting('anthropic_api_key');
  return s || null;
}

function buildClientMarkdown(client) {
  const session = client.onboarding_session_id ? db.prepare('SELECT * FROM form_sessions WHERE id = ?').get(client.onboarding_session_id) : null;
  const answers = session ? loadSessionAnswers(session.id) : {};
  const schema = loadFormSchema();
  const lines = [];
  lines.push(`# Cliente: ${client.name}`);
  lines.push('');
  lines.push(`- Status: ${client.status}`);
  if (client.contact_phone) lines.push(`- Telefone: ${client.contact_phone}`);
  if (client.contact_email) lines.push(`- Email: ${client.contact_email}`);
  lines.push(`- Onboarding: ${session ? (session.completed_at ? 'finalizado em ' + session.completed_at : 'em andamento, último update ' + (session.started_at)) : 'não iniciado'}`);
  lines.push('');
  if (!session) {
    lines.push('_Cliente ainda não preencheu o questionário de onboarding._');
    return lines.join('\n');
  }
  for (const sec of schema) {
    const hasAny = sec.questions.some(q => (answers[q.qkey] || '').trim());
    if (!hasAny && !sec.questions.some(q => q.qtype === 'photo' && answers[q.qkey])) continue;
    lines.push(`## ${sec.title}`);
    lines.push('');
    for (const q of sec.questions) {
      const v = (answers[q.qkey] || '').trim();
      if (q.qtype === 'photo') {
        if (v) lines.push(`**${q.label}**: [foto enviada]`);
        continue;
      }
      if (!v) continue;
      lines.push(`**${q.label}**`);
      lines.push('');
      lines.push(v);
      lines.push('');
    }
  }
  return lines.join('\n');
}

// link público — markdown plain (sem auth, token único)
app.get('/r/:token([0-9a-f]{16,})\\.:ext(md|txt)', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE qa_token = ?').get(req.params.token);
  if (!client) return res.status(404).type('text/plain').send('Token invalido ou expirado.');
  const md = buildClientMarkdown(client);
  res.set('Cache-Control', 'no-store');
  res.type('text/plain; charset=utf-8').send(md);
});
app.get('/r/:token([0-9a-f]{16,})', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE qa_token = ?').get(req.params.token);
  if (!client) return res.status(404).type('text/plain').send('Token invalido ou expirado.');
  res.type('text/plain; charset=utf-8').send(buildClientMarkdown(client));
});

app.post('/clientes/:id/regenerar-token', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ ok: false, error: 'cliente nao encontrado' });
  const newToken = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE clients SET qa_token = ? WHERE id = ?').run(newToken, id);
  audit(req.session.userId, 'qa_token_regenerate', 'client:' + id);
  res.json({ ok: true, token: newToken, link: `https://cliente.jefersonhenrike.com/r/${newToken}.md` });
});

app.post('/clientes/:id/perguntar-ia', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ ok: false, error: 'cliente nao encontrado' });
  const pergunta = String((req.body && req.body.pergunta) || '').trim();
  if (!pergunta) return res.json({ ok: false, error: 'pergunta vazia' });
  const apiKey = loadAnthropicKey();
  if (!apiKey) {
    return res.json({
      ok: false,
      configure: true,
      error: 'Chave Claude não configurada. Cole a chave em /root/.zeus/anthropic_api_key (chmod 600) e o sistema lê automaticamente.',
    });
  }
  const md = buildClientMarkdown(client);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: 'Você é um assistente que responde perguntas sobre um cliente da consultoria Alpha Digital, baseado APENAS nas respostas que ele deu no formulário de onboarding. Responda em PT-BR, direto e objetivo. Se a informação não estiver nas respostas, diga claramente que não tem essa informação. Não invente.',
        messages: [{
          role: 'user',
          content: `Aqui estão as respostas do cliente no formulário de onboarding:\n\n---\n${md}\n---\n\nPergunta: ${pergunta}`,
        }],
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error('[claude]', j);
      return res.json({ ok: false, error: 'Claude API erro: ' + (j.error?.message || r.status) });
    }
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    audit(req.session.userId, 'qa_ai_query', 'client:' + id, { tokens_in: j.usage?.input_tokens, tokens_out: j.usage?.output_tokens });
    res.json({ ok: true, resposta: text || '(sem resposta)', usage: j.usage });
  } catch (e) {
    console.error('[claude]', e);
    res.json({ ok: false, error: 'falha ao chamar Claude: ' + e.message });
  }
});

// ============== LEADS ==============
app.get('/leads', requireAuth, (req, res) => {
  const status = req.query.status || 'pending';
  const leads = db.prepare(`SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC`).all(status);
  const counts = db.prepare(`SELECT status, COUNT(*) as n FROM leads GROUP BY status`).all()
    .reduce((acc, r) => (acc[r.status] = r.n, acc), {});
  res.render('leads', { leads, status, counts });
});

app.get('/leads/:id', requireAuth, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!lead) return res.status(404).send('Lead não encontrado');
  res.render('lead', { lead, payload: parseJsonField(lead.payload_json) });
});

app.post('/leads/:id/aprovar', requireAuth, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!lead) return res.status(404).send('Lead não encontrado');
  if (lead.status !== 'pending') {
    setFlash(req, 'error', 'Lead já foi processado.');
    return res.redirect(`/leads/${lead.id}`);
  }
  const name = lead.business_name || lead.contact_name || 'Cliente sem nome';
  const slug = slugify(name) + '-' + Date.now().toString(36);
  const visao = JSON.stringify({
    resumo: lead.notes || '',
    segmento: lead.segment || '',
    icp: '',
    posicionamento: '',
    observacoes: `Veio do form público em ${lead.created_at}. Receita declarada: ${lead.monthly_revenue || 'n/a'}. Marketing atual: ${lead.current_marketing || 'n/a'}. Metas: ${lead.goals || 'n/a'}.`,
  });
  const info = db.prepare(`
    INSERT INTO clients (name, slug, status, contact_name, contact_phone, contact_email, visao_geral_json)
    VALUES (?, ?, 'ativo', ?, ?, ?, ?)
  `).run(name, slug, lead.contact_name, lead.contact_phone, lead.contact_email, visao);
  db.prepare(`UPDATE leads SET status = 'approved', approved_client_id = ? WHERE id = ?`)
    .run(info.lastInsertRowid, lead.id);
  audit(req.session.userId, 'lead_approve', 'lead:' + lead.id, { client_id: info.lastInsertRowid });
  setFlash(req, 'ok', 'Lead aprovado e virou cliente.');
  res.redirect(`/clientes/${info.lastInsertRowid}`);
});

app.post('/leads/:id/rejeitar', requireAuth, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!lead) return res.status(404).send('Lead não encontrado');
  db.prepare(`UPDATE leads SET status = 'rejected', rejected_reason = ? WHERE id = ?`)
    .run(req.body.reason || null, lead.id);
  audit(req.session.userId, 'lead_reject', 'lead:' + lead.id, { reason: req.body.reason });
  setFlash(req, 'ok', 'Lead rejeitado.');
  res.redirect('/leads');
});

// ============== ONBOARDING PÚBLICO (form dinâmico) ==============
const HERO_LEAD = 'Bem-vindo. Esta é a etapa de pente fino que vamos usar para mapear quem você é, o que você vende e onde você quer chegar. Suas respostas vão alimentar nossa equipe e o agente estratégico que vai construir seu plano de posicionamento.';

function loadFormSchema() {
  const sections = db.prepare('SELECT * FROM form_sections WHERE ativo = 1 ORDER BY ordem').all();
  const qStmt = db.prepare('SELECT id, qkey, label, hint, qtype, required, min_length, big, ordem FROM form_questions WHERE section_id = ? AND ativo = 1 ORDER BY ordem');
  return sections.map(s => ({
    id: s.id, ordem: s.ordem, tag: s.tag || '', title: s.title, subtitle: s.subtitle || '',
    questions: qStmt.all(s.id),
  }));
}

function loadSessionAnswers(sessionId) {
  const rows = db.prepare(`
    SELECT r.question_key, r.value
    FROM form_responses r
    JOIN (
      SELECT question_key, MAX(version) AS v
      FROM form_responses WHERE session_id = ?
      GROUP BY question_key
    ) m ON m.question_key = r.question_key AND m.v = r.version
    WHERE r.session_id = ?
  `).all(sessionId, sessionId);
  const out = {};
  for (const r of rows) out[r.question_key] = r.value || '';
  return out;
}

app.get('/onboarding', (req, res) => {
  res.render('onboarding_public', { slug: null, heroLead: HERO_LEAD });
});

app.get('/onboarding/:slug', (req, res) => {
  res.render('onboarding_public', { slug: String(req.params.slug || '').toLowerCase(), heroLead: HERO_LEAD });
});

app.get('/api/form/schema', (req, res) => {
  res.json({ sections: loadFormSchema() });
});

app.post('/api/form/session', (req, res) => {
  const slug = (req.body && typeof req.body.slug === 'string' && req.body.slug.trim())
    ? req.body.slug.trim().toLowerCase() : null;
  if (slug) {
    const existing = db.prepare('SELECT id, completed_at FROM form_sessions WHERE slug = ?').get(slug);
    if (existing) {
      return res.json({
        session_id: existing.id, slug,
        completed: !!existing.completed_at,
        answers: loadSessionAnswers(existing.id),
      });
    }
  }
  const id = crypto.randomBytes(8).toString('hex');
  const client = slug ? db.prepare('SELECT id FROM clients WHERE onboarding_slug = ?').get(slug) : null;
  db.prepare('INSERT INTO form_sessions (id, slug, client_id, user_agent, ip) VALUES (?, ?, ?, ?, ?)').run(
    id, slug, client ? client.id : null,
    String(req.headers['user-agent'] || '').slice(0, 200),
    req.ip || ''
  );
  if (client && slug) {
    db.prepare('UPDATE clients SET onboarding_session_id = ? WHERE id = ?').run(id, client.id);
  }
  res.json({ session_id: id, slug, completed: false, answers: {} });
});

app.post('/api/form/save', (req, res) => {
  const { session_id, section, answers } = req.body || {};
  if (!session_id || !Array.isArray(answers)) return res.status(400).json({ error: 'session_id and answers[] required' });
  const sess = db.prepare('SELECT id FROM form_sessions WHERE id = ?').get(session_id);
  if (!sess) return res.status(404).json({ error: 'session not found' });
  const getMaxVer = db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM form_responses WHERE session_id=? AND question_key=?');
  const insertResp = db.prepare('INSERT INTO form_responses (session_id, section, question_key, question_label, value, version) VALUES (?, ?, ?, ?, ?, ?)');
  const tx = db.transaction((items) => {
    for (const a of items) {
      const prev = getMaxVer.get(session_id, a.key);
      const lastRow = prev.v
        ? db.prepare('SELECT value FROM form_responses WHERE session_id=? AND question_key=? AND version=?').get(session_id, a.key, prev.v)
        : null;
      if (!lastRow || (lastRow.value || '') !== (a.value || '')) {
        insertResp.run(session_id, section || 0, a.key, a.label || a.key, a.value || '', prev.v + 1);
      }
    }
    db.prepare('UPDATE form_sessions SET last_section = ? WHERE id = ?').run(section || 0, session_id);
  });
  tx(answers);
  res.json({ ok: true });
});

app.post('/api/form/photo', (req, res) => {
  const { session_id, data_url } = req.body || {};
  if (!session_id || !data_url) return res.status(400).json({ error: 'session_id and data_url required' });
  const m = String(data_url).match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'invalid image' });
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const filename = `onb_${session_id}_${Date.now()}.${ext}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, Buffer.from(m[3], 'base64'));
  db.prepare('UPDATE form_sessions SET photo_path = ? WHERE id = ?').run(fullPath, session_id);
  res.json({ ok: true });
});

app.get('/api/form/photo/:sessionId', (req, res) => {
  const s = db.prepare('SELECT photo_path FROM form_sessions WHERE id = ?').get(req.params.sessionId);
  if (!s || !s.photo_path || !fs.existsSync(s.photo_path)) return res.status(404).end();
  res.sendFile(s.photo_path);
});

app.post('/api/form/complete', (req, res) => {
  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  const sess = db.prepare('SELECT * FROM form_sessions WHERE id = ?').get(session_id);
  if (!sess) return res.status(404).json({ error: 'session not found' });
  if (sess.completed_at) return res.json({ ok: true, already: true });
  db.prepare("UPDATE form_sessions SET completed_at = datetime('now') WHERE id = ?").run(session_id);
  audit(null, 'form_complete', 'session:' + session_id, { slug: sess.slug, client_id: sess.client_id });
  triggerOnFormComplete(session_id).catch(e => console.error('[onComplete]', e.message));
  res.json({ ok: true });
});

async function triggerOnFormComplete(sessionId) {
  const sess = db.prepare('SELECT * FROM form_sessions WHERE id = ?').get(sessionId);
  if (!sess) return;
  const answers = loadSessionAnswers(sessionId);
  const client = sess.client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(sess.client_id) : null;
  const nome = answers.nome || (client ? client.name : '') || 'Cliente';
  const telefone = answers.telefone || (client ? client.contact_phone : '') || '';
  const email = answers.email || (client ? client.contact_email : '') || '';

  if (client) {
    db.prepare(`UPDATE clients SET
      contact_name = COALESCE(NULLIF(contact_name,''), ?),
      contact_phone = COALESCE(NULLIF(contact_phone,''), ?),
      contact_email = COALESCE(NULLIF(contact_email,''), ?),
      updated_at = datetime('now') WHERE id = ?`)
      .run(nome, telefone, email, client.id);
  }

  notifyJeff(
    `Cliente respondeu o formulario de onboarding.\n\n` +
    `Nome: ${nome}\nTel: ${telefone}\nEmail: ${email}\n` +
    (sess.slug ? `Slug: ${sess.slug}\n` : '') +
    `\nVer: https://cliente.jefersonhenrike.com/onboarding/respostas/${sessionId}`
  );

  appendOnboardingToSheets(sess, answers).catch(e => console.error('[sheets]', e.message));
}

// ============== ADMIN: EDITOR DO FORMULÁRIO ==============
app.get('/admin/form', requireAdmin, (req, res) => {
  res.render('admin_form_editor', { sections: loadFormSchema(), sheetUrl: getSetting('onboarding_sheet_url') || '' });
});

app.post('/api/admin/form/save', requireAdmin, (req, res) => {
  const payload = req.body || {};
  if (!Array.isArray(payload.sections)) return res.status(400).json({ error: 'sections[] required' });
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM form_questions').run();
      db.prepare('DELETE FROM form_sections').run();
      const insSec = db.prepare('INSERT INTO form_sections (ordem, tag, title, subtitle) VALUES (?, ?, ?, ?)');
      const insQ = db.prepare('INSERT INTO form_questions (section_id, ordem, qkey, label, hint, qtype, required, min_length, big) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      payload.sections.forEach((s, i) => {
        const r = insSec.run(i + 1, String(s.tag || '').slice(0, 80), String(s.title || 'Seção').slice(0, 200), s.subtitle ? String(s.subtitle).slice(0, 1000) : null);
        const sid = r.lastInsertRowid;
        const seenKeys = new Set();
        (s.questions || []).forEach((q, j) => {
          let qkey = slugify(q.qkey || q.label).replace(/-/g, '_').slice(0, 60);
          if (!qkey) qkey = `q_${i+1}_${j+1}`;
          let final = qkey, k = 1;
          while (seenKeys.has(final)) { k += 1; final = `${qkey}_${k}`; }
          seenKeys.add(final);
          const qtype = ['text', 'tel', 'email', 'textarea', 'photo'].includes(q.qtype) ? q.qtype : 'text';
          insQ.run(sid, j + 1, final, String(q.label || '').slice(0, 500), q.hint ? String(q.hint).slice(0, 500) : null,
            qtype, q.required ? 1 : 0, parseInt(q.min_length || 0, 10) || 0, q.big ? 1 : 0);
        });
      });
    });
    tx();
  } catch (e) {
    console.error('[form_save]', e);
    return res.status(500).json({ error: e.message });
  }
  audit(req.session.userId, 'form_schema_save', 'form');
  res.json({ ok: true });
});

// ============== ADMIN: VER RESPOSTAS DE UMA SESSAO ==============
app.get('/onboarding/respostas/:sessionId', requireAuth, (req, res) => {
  const sess = db.prepare('SELECT * FROM form_sessions WHERE id = ?').get(req.params.sessionId);
  if (!sess) return res.status(404).send('Sessao nao encontrada');
  const answers = loadSessionAnswers(sess.id);
  const schema = loadFormSchema();
  const client = sess.client_id ? db.prepare('SELECT id, name FROM clients WHERE id = ?').get(sess.client_id) : null;
  res.render('onboarding_respostas', { sess, answers, schema, client });
});

// ============== CADASTRO RAPIDO DE CLIENTE (dashboard) ==============
app.post('/clientes/cadastrar-rapido', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!name || phone.length < 10) return res.json({ ok: false, error: 'Nome e telefone obrigatorios.' });

  let base = slugify(name);
  if (!base) base = 'cliente-' + Date.now().toString(36);
  let finalSlug = base, n = 1;
  // mesmo slug serve pra clients.slug, onboarding_slug e subdominio — coerente
  while (db.prepare('SELECT 1 FROM clients WHERE slug = ? OR onboarding_slug = ?').get(finalSlug, finalSlug)) {
    n += 1; finalSlug = `${base}-${n}`;
  }

  const info = db.prepare(`
    INSERT INTO clients (name, slug, status, contact_name, contact_phone, contact_email, onboarding_slug)
    VALUES (?, ?, 'ativo', ?, ?, ?, ?)
  `).run(name, finalSlug, name, phone, email || null, finalSlug);

  audit(req.session.userId, 'client_quick_create', 'client:' + info.lastInsertRowid, { name, phone, email, slug: finalSlug });

  // dispara provisionamento subdominio em background — pode demorar 30-60s
  const provisionScript = path.join(__dirname, 'scripts', 'provision-subdomain.sh');
  execFile(provisionScript, [finalSlug], { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[provision-subdomain]', err.message, stderr);
      notifyJeff(`Provisionamento subdominio FALHOU para ${finalSlug}.jefersonhenrike.com\n\n${stderr || err.message}\n\nRode manualmente: ssh root@server bash /opt/jeff-apps/jeff-alpha-clientes/scripts/provision-subdomain.sh ${finalSlug}`);
    } else {
      console.log('[provision-subdomain]', finalSlug, 'OK');
      notifyJeff(`Subdominio criado: https://${finalSlug}.jefersonhenrike.com`);
    }
  });

  const onboardingLink = `https://cliente.jefersonhenrike.com/onboarding/${finalSlug}`;
  const painelLink = `https://${finalSlug}.jefersonhenrike.com`;
  const msg = `Ola, ${name}! Aqui é da Alpha Digital.\n\n1) Comece preenchendo o questionario de onboarding:\n${onboardingLink}\n\n2) Depois, crie seu acesso ao seu painel personalizado:\n${painelLink}\n(o painel fica pronto em alguns minutos enquanto provisionamos)`;
  const payload = JSON.stringify({ to: phone, body: msg });
  execFile(WAPI_SCRIPT, ['POST', '/messages/private', payload], { timeout: 15000 }, (err) => {
    if (err) {
      console.error('[cadastrar-rapido WA]', err.message);
      return res.json({ ok: true, client_id: info.lastInsertRowid, slug: finalSlug, link: onboardingLink, painelLink, wa_error: 'Cliente criado e subdominio sendo provisionado, mas falhou envio do WhatsApp.' });
    }
    notifyJeff(`Cliente novo cadastrado: ${name} (${phone}).\nLink enviado: ${onboardingLink}`);
    res.json({ ok: true, client_id: info.lastInsertRowid, slug: finalSlug, link: onboardingLink, painelLink });
  });
});

// ============== PAINEL: TEMPLATE (admin) ==============
function loadDocTemplate() {
  const r = db.prepare('SELECT blocks_json, updated_at FROM doc_template WHERE id = 1').get();
  if (!r) return { blocks: [], updated_at: null };
  let blocks = [];
  try { blocks = JSON.parse(r.blocks_json) || []; } catch {}
  return { blocks, updated_at: r.updated_at };
}

function loadClientPanelState(clientId) {
  const rows = db.prepare('SELECT kind, block_key, value, updated_at FROM client_doc_state WHERE client_id = ?').all(clientId);
  const out = { answers: {}, actions: {} };
  for (const r of rows) {
    if (r.kind === 'answer') out.answers[r.block_key] = r.value || '';
    else if (r.kind === 'action') out.actions[r.block_key] = { value: r.value || '', updated_at: r.updated_at };
  }
  return out;
}

function setClientPanelState(clientId, kind, key, value) {
  db.prepare(`INSERT INTO client_doc_state (client_id, kind, block_key, value, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
              ON CONFLICT(client_id, kind, block_key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`)
    .run(clientId, kind, key, value || '');
}

app.get('/admin/aba-padrao', requireAdmin, (req, res) => {
  res.render('admin_template_preview', { template: loadDocTemplate() });
});

app.get('/admin/aba-padrao/editar', requireAdmin, (req, res) => {
  res.render('admin_template_editor', { template: loadDocTemplate() });
});

app.post('/api/admin/template/save', requireAdmin, (req, res) => {
  const blocks = (req.body && Array.isArray(req.body.blocks)) ? req.body.blocks : null;
  if (!blocks) return res.status(400).json({ error: 'blocks[] required' });
  const cleaned = blocks.map((b, i) => {
    const id = String(b.id || '').trim() || `b${Date.now().toString(36)}_${i}`;
    const kind = ['tab', 'text', 'highlight', 'question', 'action'].includes(b.kind) ? b.kind : 'text';
    const out = { id, kind };
    if (kind === 'tab') out.title = String(b.title || 'Aba sem nome').slice(0, 200);
    else if (kind === 'text') out.text = String(b.text || '').slice(0, 8000);
    else if (kind === 'highlight') {
      out.term = String(b.term || '').slice(0, 200);
      out.popup = String(b.popup || '').slice(0, 2000);
    }
    else if (kind === 'question') out.text = String(b.text || '').slice(0, 1500);
    else if (kind === 'action') out.text = String(b.text || '').slice(0, 1500);
    return out;
  });
  db.prepare("UPDATE doc_template SET blocks_json = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1")
    .run(JSON.stringify(cleaned), req.session.userId);
  audit(req.session.userId, 'doc_template_save', 'template', { blocks: cleaned.length });
  res.json({ ok: true, blocks_count: cleaned.length });
});

// ============== PAINEL DO CLIENTE (subdomínio <slug>.jefersonhenrike.com) ==============
function requirePainelLogin(req, res, next) {
  if (!req.painelClient) return res.status(404).send('Cliente nao encontrado nesse subdominio.');
  if (!req.session.painelUserId || req.session.painelClientId !== req.painelClient.id) {
    return res.redirect('/login');
  }
  next();
}

app.get('/_painel/health', (req, res) => res.json({ ok: !!req.painelClient, slug: req.painelSlug }));

app.get('/_painel/', (req, res) => {
  if (!req.painelClient) return res.status(404).send('Cliente nao encontrado.');
  if (!req.session.painelUserId || req.session.painelClientId !== req.painelClient.id) {
    return res.redirect('/login');
  }
  const tpl = loadDocTemplate();
  const state = loadClientPanelState(req.painelClient.id);
  const cuser = db.prepare('SELECT id, email, name FROM client_users WHERE id = ?').get(req.session.painelUserId);
  res.render('cliente_painel', { client: req.painelClient, blocks: tpl.blocks, state, cuser, slug: req.painelSlug });
});

app.get('/_painel/login', (req, res) => {
  if (!req.painelClient) return res.status(404).send('Cliente nao encontrado.');
  if (req.session.painelUserId && req.session.painelClientId === req.painelClient.id) return res.redirect('/');
  const has = db.prepare('SELECT id FROM client_users WHERE client_id = ? LIMIT 1').get(req.painelClient.id);
  res.render('cliente_painel_login', { client: req.painelClient, slug: req.painelSlug, hasUsers: !!has, error: req.query.err || null });
});

app.post('/_painel/login', (req, res) => {
  if (!req.painelClient) return res.status(404).send('Cliente nao encontrado.');
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const u = db.prepare("SELECT * FROM client_users WHERE client_id = ? AND lower(email) = ? AND status = 'active'").get(req.painelClient.id, email);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.redirect('/login?err=Credenciais invalidas.');
  req.session.painelUserId = u.id;
  req.session.painelClientId = req.painelClient.id;
  db.prepare("UPDATE client_users SET last_login_at = datetime('now') WHERE id = ?").run(u.id);
  audit(null, 'painel_login', 'client_user:' + u.id, { client_id: req.painelClient.id });
  res.redirect('/');
});

app.get('/_painel/signup', (req, res) => {
  if (!req.painelClient) return res.status(404).send('Cliente nao encontrado.');
  if (req.session.painelUserId && req.session.painelClientId === req.painelClient.id) return res.redirect('/');
  res.render('cliente_painel_signup', { client: req.painelClient, slug: req.painelSlug, error: req.query.err || null, prefill: { name: req.painelClient.contact_name, phone: req.painelClient.contact_phone, email: req.painelClient.contact_email } });
});

app.post('/_painel/signup', (req, res) => {
  if (!req.painelClient) return res.status(404).send('Cliente nao encontrado.');
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const password = String(req.body.password || '');
  if (!name || !email || !phone || password.length < 6) return res.redirect('/signup?err=Preencha todos os campos. Senha minimo 6 caracteres.');
  const exists = db.prepare("SELECT id FROM client_users WHERE client_id = ? AND lower(email) = ?").get(req.painelClient.id, email);
  if (exists) return res.redirect('/signup?err=Ja existe cadastro com esse email. Faca login.');
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`INSERT INTO client_users (client_id, email, name, phone, password_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(req.painelClient.id, email, name, phone, hash);
  req.session.painelUserId = info.lastInsertRowid;
  req.session.painelClientId = req.painelClient.id;
  audit(null, 'painel_signup', 'client_user:' + info.lastInsertRowid, { client_id: req.painelClient.id, email });
  notifyJeff(`Cliente fez signup no painel: ${req.painelClient.name} (${name}, ${email})\nLink: https://${req.painelSlug}.jefersonhenrike.com`);
  res.redirect('/');
});

app.post('/_painel/logout', (req, res) => {
  delete req.session.painelUserId;
  delete req.session.painelClientId;
  res.redirect('/login');
});

app.get('/_painel/api/state', requirePainelLogin, (req, res) => {
  res.json({
    template: loadDocTemplate().blocks,
    state: loadClientPanelState(req.painelClient.id),
  });
});

app.post('/_painel/api/answer', requirePainelLogin, (req, res) => {
  const { block_id, value } = req.body || {};
  if (!block_id) return res.status(400).json({ error: 'block_id required' });
  setClientPanelState(req.painelClient.id, 'answer', String(block_id).slice(0, 100), String(value || '').slice(0, 8000));
  audit(null, 'painel_answer', 'client:' + req.painelClient.id, { block_id });
  res.json({ ok: true });
});

// ============== ADMIN: marcar acao feita por cliente ==============
app.post('/clientes/:id/painel/action', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { block_id, done } = req.body || {};
  if (!block_id) return res.status(400).json({ error: 'block_id required' });
  setClientPanelState(id, 'action', String(block_id).slice(0, 100), done ? 'done' : '');
  res.json({ ok: true });
});

// ============== UPLOADS DE DOCUMENTOS DO PAINEL (Estratégia/Início/etc) ==============
const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);
const ALLOWED_UPLOAD_EXTS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt']);
const PANEL_SCOPES = new Set(['estrategia', 'inicio']);

const panelUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
      cb(null, `panel_${Date.now()}_${id}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_UPLOAD_MIMES.has(file.mimetype) || ALLOWED_UPLOAD_EXTS.has(ext)) cb(null, true);
    else cb(new Error('Tipo de arquivo nao permitido (so PDF, Word, Excel, PowerPoint ou TXT).'));
  },
  limits: { fileSize: 30 * 1024 * 1024 },
});

function listPanelUploads(clientId, scope) {
  return db.prepare(`SELECT id, scope, original_name, mimetype, size, uploaded_by_kind, uploaded_at
                     FROM panel_uploads WHERE client_id = ? AND scope = ?
                     ORDER BY uploaded_at DESC`).all(clientId, scope);
}

function savePanelUpload(clientId, scope, file, byKind, byId) {
  const info = db.prepare(`INSERT INTO panel_uploads (client_id, scope, filename, original_name, mimetype, size, uploaded_by_kind, uploaded_by_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(clientId, scope, file.filename, file.originalname, file.mimetype, file.size, byKind, byId || null);
  return info.lastInsertRowid;
}

// --- ADMIN (na ficha /clientes/:id?tab=painel) ---
app.post('/clientes/:id/painel/uploads', requireAuth, panelUpload.single('file'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const scope = String(req.body.scope || '').trim();
  if (!PANEL_SCOPES.has(scope)) {
    if (req.file) try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    return res.status(400).json({ ok: false, error: 'scope invalido' });
  }
  if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(id)) return res.status(404).json({ ok: false, error: 'cliente nao encontrado' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'arquivo obrigatorio' });
  const fileId = savePanelUpload(id, scope, req.file, 'admin', req.session.userId);
  audit(req.session.userId, 'panel_upload', 'client:' + id, { scope, name: req.file.originalname, size: req.file.size });
  res.json({ ok: true, id: fileId });
});

app.get('/clientes/:id/painel/uploads', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const scope = String(req.query.scope || '').trim();
  if (!PANEL_SCOPES.has(scope)) return res.status(400).json({ ok: false, error: 'scope invalido' });
  res.json({ ok: true, uploads: listPanelUploads(id, scope) });
});

app.get('/clientes/:id/painel/uploads/:fileId', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const fileId = parseInt(req.params.fileId, 10);
  const u = db.prepare('SELECT * FROM panel_uploads WHERE id = ? AND client_id = ?').get(fileId, id);
  if (!u) return res.status(404).send('arquivo nao encontrado');
  res.download(path.join(UPLOAD_DIR, u.filename), u.original_name || u.filename);
});

app.post('/clientes/:id/painel/uploads/:fileId/delete', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const fileId = parseInt(req.params.fileId, 10);
  const u = db.prepare('SELECT * FROM panel_uploads WHERE id = ? AND client_id = ?').get(fileId, id);
  if (!u) return res.status(404).json({ ok: false, error: 'nao encontrado' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, u.filename)); } catch {}
  db.prepare('DELETE FROM panel_uploads WHERE id = ?').run(fileId);
  audit(req.session.userId, 'panel_upload_delete', 'client:' + id, { fileId, name: u.original_name });
  res.json({ ok: true });
});

// --- CLIENTE (no painel <slug>.jefersonhenrike.com) ---
app.post('/_painel/api/upload', requirePainelLogin, panelUpload.single('file'), (req, res) => {
  const scope = String(req.body.scope || '').trim();
  if (!PANEL_SCOPES.has(scope)) {
    if (req.file) try { fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename)); } catch {}
    return res.status(400).json({ ok: false, error: 'scope invalido' });
  }
  if (!req.file) return res.status(400).json({ ok: false, error: 'arquivo obrigatorio' });
  const fileId = savePanelUpload(req.painelClient.id, scope, req.file, 'client', req.session.painelUserId);
  audit(null, 'painel_upload_client', 'client:' + req.painelClient.id, { scope, name: req.file.originalname, size: req.file.size });
  res.json({ ok: true, id: fileId });
});

app.get('/_painel/api/uploads', requirePainelLogin, (req, res) => {
  const scope = String(req.query.scope || '').trim();
  if (!PANEL_SCOPES.has(scope)) return res.status(400).json({ ok: false, error: 'scope invalido' });
  res.json({ ok: true, uploads: listPanelUploads(req.painelClient.id, scope) });
});

app.get('/_painel/uploads/:fileId', requirePainelLogin, (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  const u = db.prepare('SELECT * FROM panel_uploads WHERE id = ? AND client_id = ?').get(fileId, req.painelClient.id);
  if (!u) return res.status(404).send('arquivo nao encontrado');
  res.download(path.join(UPLOAD_DIR, u.filename), u.original_name || u.filename);
});

app.post('/_painel/uploads/:fileId/delete', requirePainelLogin, (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  const u = db.prepare('SELECT * FROM panel_uploads WHERE id = ? AND client_id = ?').get(fileId, req.painelClient.id);
  if (!u) return res.status(404).json({ ok: false, error: 'nao encontrado' });
  if (u.uploaded_by_kind !== 'client') return res.status(403).json({ ok: false, error: 'so pode apagar arquivo proprio' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, u.filename)); } catch {}
  db.prepare('DELETE FROM panel_uploads WHERE id = ?').run(fileId);
  res.json({ ok: true });
});

// ============== ERROR HANDLER ==============
app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  res.status(500).send('Erro interno.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[jeff-alpha-clientes] http://0.0.0.0:${PORT}`);
});
