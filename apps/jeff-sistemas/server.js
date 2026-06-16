const express = require('express');
const Database = require('better-sqlite3');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3017;
const DB_PATH = path.join(__dirname, 'data', 'sistemas.db');
const WORKER_BASE = 'http://127.0.0.1:3002';
const WORKER_ENV = '/opt/jeff-worker/.env';
const JEFF_PHONE = '5511910075450';
const JEFF_CHAT_ID = '5511910075450@c.us';
const ADMIN_EMAILS = new Set([
  'jefersonhenrike1@gmail.com',
  'jeferson.inteligenciaemocional@gmail.com'
]);
const INVITE_CODE = process.env.INVITE_CODE || 'alpha2026';

function workerToken() {
  try {
    const env = fs.readFileSync(WORKER_ENV, 'utf8');
    const m = env.match(/^API_TOKEN=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT,
    decided_by TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS systems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#C4FF0E',
    sort_order INTEGER DEFAULT 100,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(password, s, 64).toString('hex');
  return { hash: h, salt: s };
}

function verifyPassword(password, hash, salt) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(hash, 'hex'));
}

function newToken() { return crypto.randomBytes(32).toString('hex'); }

function createSession(userId) {
  const token = newToken();
  const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, exp);
  return token;
}

function getUserBySession(token) {
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!s) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
}

const seedSystems = [
  { slug: 'crm-ebc',     name: 'CRM EBC',           description: 'Pipeline de leads e clientes',          url: 'https://ebc-crm.propostaebcmkt2026.shop',  icon: 'CRM',  color: '#C4FF0E', sort_order: 10 },
  { slug: 'asaas',       name: 'Cobranças',         description: 'Asaas — caixa, recebíveis, inadimplência', url: 'https://asaas.jefersonhenrike.com',     icon: '$',    color: '#10F2A4', sort_order: 20 },
  { slug: 'meta-ads',    name: 'Meta Ads',          description: 'Performance de campanhas',              url: 'https://ads.propostaebcmkt2026.shop',      icon: 'ADS',  color: '#3FA9F5', sort_order: 30 },
  { slug: 'zapsign',     name: 'Contratos',         description: 'ZapSign — assinaturas e webhooks',      url: 'https://zapsign.jefersonhenrike.com',      icon: '✎',    color: '#C4FF0E', sort_order: 40 },
  { slug: 'onboarding',  name: 'Onboarding',        description: 'Cadastro de novos clientes Alpha',      url: 'https://onboarding.jefersonhenrike.com',   icon: '◉',    color: '#FF8A3D', sort_order: 50 },
  { slug: 'vps-monitor', name: 'VPS Monitor',       description: 'Saúde do servidor e processos',         url: 'https://vps.propostaebcmkt2026.shop',      icon: '⌬',    color: '#A78BFA', sort_order: 60 }
];
const seedStmt = db.prepare(`INSERT OR IGNORE INTO systems (slug, name, description, url, icon, color, sort_order) VALUES (@slug, @name, @description, @url, @icon, @color, @sort_order)`);
for (const s of seedSystems) seedStmt.run(s);

async function notifyJeff(text) {
  const token = workerToken();
  if (!token) return;
  try {
    await fetch(WORKER_BASE + '/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ chatId: JEFF_CHAT_ID, message: text })
    });
  } catch (e) { console.error('notify failed', e.message); }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

function requireAuth(req, res, next) {
  const u = getUserBySession(req.cookies.sid);
  if (!u) return res.redirect('/login');
  if (u.status !== 'approved') return res.redirect('/pending');
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  const u = getUserBySession(req.cookies.sid);
  if (!u || u.role !== 'admin' || u.status !== 'approved') return res.status(403).send('forbidden');
  req.user = u;
  next();
}

function apiAuth(req, res, next) {
  const u = getUserBySession(req.cookies.sid);
  if (!u || u.status !== 'approved') return res.status(401).json({ error: 'unauthorized' });
  req.user = u;
  next();
}

function apiAdmin(req, res, next) {
  const u = getUserBySession(req.cookies.sid);
  if (!u || u.role !== 'admin' || u.status !== 'approved') return res.status(403).json({ error: 'forbidden' });
  req.user = u;
  next();
}

app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/pending', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pending.html')));
app.get('/admin', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/me', (req, res) => {
  const u = getUserBySession(req.cookies.sid);
  if (!u) return res.json({ user: null });
  res.json({ user: { id: u.id, name: u.name, email: u.email, status: u.status, role: u.role } });
});

app.get('/api/systems', apiAuth, (req, res) => {
  const rows = db.prepare('SELECT id, slug, name, description, url, icon, color FROM systems WHERE active = 1 ORDER BY sort_order, name').all();
  res.json({ systems: rows });
});

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'campos obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'senha precisa de 6+ caracteres' });
  const emailNorm = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
  if (existing) return res.status(409).json({ error: 'email já cadastrado' });
  const { hash, salt } = hashPassword(password);
  const isAdmin = ADMIN_EMAILS.has(emailNorm);
  const status = isAdmin ? 'approved' : 'pending';
  const role = isAdmin ? 'admin' : 'user';
  const decided_at = new Date().toISOString();
  const decided_by = 'auto';
  const info = db.prepare(`INSERT INTO users (email, password_hash, password_salt, name, phone, status, role, decided_at, decided_by) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(emailNorm, hash, salt, name.trim(), null, status, role, decided_at, decided_by);
  const sid = createSession(info.lastInsertRowid);
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30*24*60*60*1000 });
  if (!isAdmin) {
    notifyJeff(
      `Novo cadastro no Alpha Sistemas:\n\nNome: ${name}\nEmail: ${emailNorm}\n\nAguardando aprovacao.`
    ).catch(()=>{});
  }
  res.json({ ok: true, status });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'campos obrigatórios' });
  const emailNorm = String(email).trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm);
  if (!u) return res.status(401).json({ error: 'credenciais inválidas' });
  if (!verifyPassword(password, u.password_hash, u.password_salt)) {
    return res.status(401).json({ error: 'credenciais inválidas' });
  }
  const sid = createSession(u.id);
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30*24*60*60*1000 });
  res.json({ ok: true, status: u.status });
});

app.post('/api/logout', (req, res) => {
  const sid = req.cookies.sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/admin/users', apiAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, email, name, phone, status, role, created_at, decided_at FROM users ORDER BY status="pending" DESC, created_at DESC').all();
  res.json({ users: rows });
});

app.post('/api/admin/users/:id/approve', apiAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE users SET status='approved', decided_at=datetime('now'), decided_by=? WHERE id=?`).run(req.user.email, id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/deny', apiAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE users SET status='denied', decided_at=datetime('now'), decided_by=? WHERE id=?`).run(req.user.email, id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true });
});

app.get('/api/admin/systems', apiAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM systems ORDER BY sort_order, name').all();
  res.json({ systems: rows });
});

app.post('/api/admin/systems', apiAdmin, (req, res) => {
  const { slug, name, description, url, icon, color, sort_order } = req.body || {};
  if (!slug || !name || !url || !icon) return res.status(400).json({ error: 'campos obrigatórios: slug, name, url, icon' });
  try {
    const info = db.prepare(`INSERT INTO systems (slug, name, description, url, icon, color, sort_order) VALUES (?,?,?,?,?,?,?)`)
      .run(slug, name, description || null, url, icon, color || '#C4FF0E', sort_order || 100);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/admin/systems/:id', apiAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const fields = ['slug','name','description','url','icon','color','sort_order','active'];
  const updates = []; const params = [];
  for (const f of fields) if (f in req.body) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  if (!updates.length) return res.status(400).json({ error: 'no fields' });
  params.push(id);
  db.prepare(`UPDATE systems SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

app.delete('/api/admin/systems/:id', apiAdmin, (req, res) => {
  db.prepare('DELETE FROM systems WHERE id = ?').run(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-sistemas listening on 0.0.0.0:${PORT}`);
});
