const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const PORT = parseInt(process.env.PORT || '3015', 10);
const DB_PATH = path.join(__dirname, 'data', 'crm.db');
const SESSION_SECRET = process.env.SESSION_SECRET || 'ebc-crm-' + Math.random().toString(36).slice(2);
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://ebc-crm.propostaebcmkt2026.shop';
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:3002';
const JEFF_PHONE = '5511910075450';

// Lê o API_TOKEN do worker para enviar notificações
let WORKER_API_TOKEN = process.env.WORKER_API_TOKEN || '';
if (!WORKER_API_TOKEN) {
  try {
    const envFile = fs.readFileSync('/opt/labastia/whatsapp-worker/.env', 'utf8');
    const m = envFile.match(/^API_TOKEN=(.+)$/m);
    if (m) WORKER_API_TOKEN = m[1].trim();
  } catch (e) {
    console.warn('[ebc-crm] WORKER_API_TOKEN não encontrado:', e.message);
  }
}

async function notifyJeff(text) {
  if (!WORKER_API_TOKEN) { console.warn('[notifyJeff] sem token, pulando'); return; }
  try {
    const r = await fetch(`${WORKER_URL}/messages/private`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_API_TOKEN}` },
      body: JSON.stringify({ to: JEFF_PHONE, body: text })
    });
    if (!r.ok) console.warn('[notifyJeff] HTTP', r.status, await r.text().catch(()=>''));
  } catch (e) {
    console.error('[notifyJeff]', e.message);
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  approved INTEGER NOT NULL DEFAULT 0,
  whatsapp TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  volume TEXT,
  origem TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  geo TEXT,
  device TEXT,
  user_agent TEXT,
  ip TEXT,
  status TEXT NOT NULL DEFAULT 'esperando',
  assigned_to INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  user_id INTEGER,
  event TEXT NOT NULL,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
`);

// Migração: colunas de qualificação do form inteligente
const leadCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
const ensureCol = (col, type) => {
  if (!leadCols.includes(col)) db.exec(`ALTER TABLE leads ADD COLUMN ${col} ${type}`);
};
ensureCol('experience', 'TEXT');
ensureCol('motivation', 'TEXT');
ensureCol('timing', 'TEXT');
ensureCol('wants_specialist', 'TEXT');
ensureCol('content_pref', 'TEXT');
ensureCol('temperature', 'TEXT');

// Migração: token de aprovação rápida para link 1-tap
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('approve_token')) db.exec('ALTER TABLE users ADD COLUMN approve_token TEXT');

// Bootstrap admin Jeff (única conta pré-aprovada)
const adminEmail = 'jeferson.inteligenciaemocional@gmail.com';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const tempPass = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'mudaragora2026';
  const hash = bcrypt.hashSync(tempPass, 10);
  db.prepare(`INSERT INTO users (email, name, password_hash, role, approved, whatsapp)
              VALUES (?, ?, ?, 'admin', 1, ?)`).run(adminEmail, 'Jeferson', hash, '5511910075450');
  fs.writeFileSync(path.join(__dirname, 'data', 'BOOTSTRAP_PASSWORD.txt'),
    `Senha inicial do admin (${adminEmail}): ${tempPass}\nTroque assim que entrar.\n`);
}

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1);

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 }
}));

// ==== Helpers ====
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'unauthenticated' });
  const user = db.prepare('SELECT id, email, name, role, approved FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.approved) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

function logEvent(leadId, userId, event, payload = null) {
  db.prepare('INSERT INTO lead_events (lead_id, user_id, event, payload) VALUES (?, ?, ?, ?)')
    .run(leadId, userId, event, payload ? JSON.stringify(payload) : null);
}

// ==== Auth routes ====
app.post('/api/register', (req, res) => {
  const { email, name, password, whatsapp } = req.body || {};
  if (!email || !name || !password) return res.status(400).json({ error: 'campos obrigatórios: email, name, password' });
  if (password.length < 6) return res.status(400).json({ error: 'senha mínimo 6 caracteres' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const token = crypto.randomBytes(24).toString('hex');
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();
    const cleanWa = whatsapp || null;
    db.prepare('INSERT INTO users (email, name, password_hash, whatsapp, approved, approve_token) VALUES (?, ?, ?, ?, 0, ?)')
      .run(cleanEmail, cleanName, hash, cleanWa, token);
    const approveUrl = `${PUBLIC_URL}/api/quick-approve?t=${token}`;
    notifyJeff(
      `Novo cadastro no CRM EBC\n\n` +
      `Nome: ${cleanName}\n` +
      `E-mail: ${cleanEmail}\n` +
      (cleanWa ? `WhatsApp: ${cleanWa}\n` : '') +
      `\nLiberar acesso (1 toque):\n${approveUrl}`
    );
    res.json({ ok: true, status: 'pending', message: 'Cadastro recebido. Aguarde aprovação do Jeferson.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'email já cadastrado' });
    res.status(500).json({ error: e.message });
  }
});

// Polling público: o frontend pergunta se o cadastro já foi aprovado
app.get('/api/register-status', (req, res) => {
  const email = String(req.query.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'email obrigatório' });
  const user = db.prepare('SELECT approved FROM users WHERE email = ?').get(email);
  if (!user) return res.json({ exists: false, approved: false });
  res.json({ exists: true, approved: !!user.approved });
});

// Aprovação 1-tap via link enviado no WhatsApp do Jeff
app.get('/api/quick-approve', (req, res) => {
  const token = String(req.query.t || '').trim();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!token) return res.status(400).send(approvePage('Token ausente.', false));
  const user = db.prepare('SELECT id, name, email, approved FROM users WHERE approve_token = ?').get(token);
  if (!user) return res.status(404).send(approvePage('Link inválido ou já utilizado.', false));
  if (user.approved) {
    db.prepare('UPDATE users SET approve_token = NULL WHERE id = ?').run(user.id);
    return res.send(approvePage(`${user.name} já estava liberado.`, true));
  }
  db.prepare('UPDATE users SET approved = 1, approve_token = NULL WHERE id = ?').run(user.id);
  res.send(approvePage(`Acesso liberado para ${user.name} (${user.email}).`, true));
});

function approvePage(msg, ok) {
  const color = ok ? '#2c8557' : '#760006';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EBC CRM</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#1f0000;color:#fff;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;margin:0}
  .card{background:#fff;color:#1a1a1a;border-radius:6px;padding:40px;max-width:420px;text-align:center;
        border-top:3px solid #c49a6c;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}
  .ico{width:64px;height:64px;border-radius:50%;background:${color};margin:0 auto 20px;
       display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;font-weight:700}
  h1{font-family:'Noto Serif',serif;font-size:22px;margin:0 0 12px;color:#1f0000}
  p{color:#555;line-height:1.5;margin:0}
</style></head><body>
<div class="card">
  <div class="ico">${ok ? '✓' : '!'}</div>
  <h1>${ok ? 'Pronto' : 'Ops'}</h1>
  <p>${msg}</p>
</div></body></html>`;
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email e senha obrigatórios' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'credenciais inválidas' });
  }
  if (!user.approved) return res.status(403).json({ error: 'aguardando aprovação do Jeferson' });
  req.session.userId = user.id;
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

// ==== Admin: aprovar usuários ====
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, approved, whatsapp, created_at FROM users ORDER BY approved ASC, created_at DESC').all();
  res.json({ users });
});

app.post('/api/users/:id/approve', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET approved = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/users/:id/reject', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ? AND role != ?').run(req.params.id, 'admin');
  res.json({ ok: true });
});

app.post('/api/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body || {};
  if (!['admin','vendedor','sdr'].includes(role)) return res.status(400).json({ error: 'role inválida' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

// ==== Leads ====
const VALID_STATUSES = ['esperando','em_atendimento','negociando','fechado','perdido'];

app.get('/api/leads', requireAuth, (req, res) => {
  const leads = db.prepare(`
    SELECT l.*, u.name AS assigned_name
    FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
    ORDER BY l.created_at DESC
  `).all();
  res.json({ leads });
});

app.post('/api/leads', requireAuth, (req, res) => {
  const { name, phone, email, volume, origem, notes } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'name e phone obrigatórios' });
  const info = db.prepare(`
    INSERT INTO leads (name, phone, email, volume, origem, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, phone, email || null, volume || null, origem || 'manual', notes || null);
  logEvent(info.lastInsertRowid, req.user.id, 'created_manual');
  res.json({ ok: true, id: info.lastInsertRowid });
});

// CORS aberto só pro endpoint público (chamado da landing externa)
app.use('/api/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function classifyTemperature(timing, wantsSpecialist) {
  const hot = ['esta-semana', 'este-mes'].includes(timing);
  const cold = ['3-meses', 'aprendendo'].includes(timing);
  if (hot && wantsSpecialist === 'sim') return 'quente';
  if (hot && wantsSpecialist === 'nao') return 'morno';
  if (cold) return 'frio';
  return 'morno';
}

// Endpoint público para landing EBC
app.post('/api/public/lead', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.phone) return res.status(400).json({ error: 'name e phone obrigatórios' });
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const temperature = classifyTemperature(b.timing, b.wants_specialist);
  const info = db.prepare(`
    INSERT INTO leads (name, phone, email, volume, origem,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      geo, device, user_agent, ip,
      experience, motivation, timing, wants_specialist, content_pref, temperature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.name, b.phone, b.email || null, b.volume || null,
    b.origem || 'landing-ebc',
    b.utm_source || null, b.utm_medium || null, b.utm_campaign || null,
    b.utm_content || null, b.utm_term || null,
    b.geo || null, b.device || null,
    req.headers['user-agent'] || null, ip,
    b.experience || null, b.motivation || null, b.timing || null,
    b.wants_specialist || null, b.content_pref || null, temperature
  );
  logEvent(info.lastInsertRowid, null, 'lead_received_public', b);
  res.json({ ok: true, id: info.lastInsertRowid, temperature });
});

// Iniciar atendimento: muda status + retorna wa.me link
app.post('/api/leads/:id/iniciar', requireAuth, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'lead não encontrado' });
  const phone = String(lead.phone).replace(/\D/g, '');
  db.prepare(`UPDATE leads SET status = 'em_atendimento', assigned_to = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(req.user.id, req.params.id);
  logEvent(lead.id, req.user.id, 'atendimento_iniciado');
  res.json({ ok: true, wa_url: `https://wa.me/${phone}` });
});

app.post('/api/leads/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'status inválido' });
  db.prepare(`UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
  logEvent(req.params.id, req.user.id, 'status_changed', { status });
  res.json({ ok: true });
});

app.post('/api/leads/:id/notes', requireAuth, (req, res) => {
  const { notes } = req.body || {};
  db.prepare(`UPDATE leads SET notes = ?, updated_at = datetime('now') WHERE id = ?`).run(notes || '', req.params.id);
  logEvent(req.params.id, req.user.id, 'notes_updated');
  res.json({ ok: true });
});

app.get('/api/leads/:id/events', requireAuth, (req, res) => {
  const events = db.prepare(`
    SELECT e.*, u.name AS user_name FROM lead_events e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.lead_id = ? ORDER BY e.created_at DESC
  `).all(req.params.id);
  res.json({ events });
});

// Métricas básicas
app.get('/api/stats', requireAuth, (req, res) => {
  const counts = db.prepare(`
    SELECT status, COUNT(*) as n FROM leads GROUP BY status
  `).all();
  const total = db.prepare('SELECT COUNT(*) as n FROM leads').get().n;
  const today = db.prepare(`SELECT COUNT(*) as n FROM leads WHERE DATE(created_at) = DATE('now')`).get().n;
  res.json({ counts, total, today });
});

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[ebc-crm] listening on 127.0.0.1:${PORT}`);
});
