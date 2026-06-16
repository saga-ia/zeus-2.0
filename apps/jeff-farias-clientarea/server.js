const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3022;
const DB_PATH = path.join(__dirname, 'data', 'farias.db');
const DOC_PATH = path.join(__dirname, 'data', 'doc.json');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block TEXT NOT NULL,
    question_key TEXT NOT NULL,
    answer TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_qk ON answers(question_key);

  CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    title TEXT NOT NULL,
    block TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'pendente',
    completed_at TEXT,
    last_chase_at TEXT,
    chase_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS overrides (
    key TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
try { db.exec("ALTER TABLE overrides ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0"); } catch(e) {}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const AUTH_SALT = 'jeff-alpha-2026';
const AUTH_HASH = 'c87024690d8e99d03de873f3bc3fd46d2e1736947b5bdd4e0a924a47e41e87721d257e2b72c1fb72400fbc31aab0f00f031b485582f6a8a11c855c4a2c35d57b';
const sessions = new Map();
function verifyPwd(pwd) {
  try {
    const test = crypto.scryptSync(pwd, AUTH_SALT, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(AUTH_HASH, 'hex'));
  } catch { return false; }
}
function newSession() {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, Date.now() + 30 * 24 * 60 * 60 * 1000);
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
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.post('/api/login', express.urlencoded({ extended: false }), (req, res) => {
  if (!verifyPwd(req.body.password || '')) return res.redirect('/login?error=1');
  const tok = newSession();
  res.set('Set-Cookie', `sid=${tok}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}`);
  res.redirect('/');
});
app.get('/api/logout', (req, res) => {
  const c = parseCookies(req);
  if (c.sid) sessions.delete(c.sid);
  res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.get('/api/doc', apiAuth, (_req, res) => {
  const paras = JSON.parse(fs.readFileSync(DOC_PATH, 'utf8'));
  res.json({ paras });
});

app.get('/api/state', apiAuth, (_req, res) => {
  const answers = db.prepare('SELECT block, question_key, answer, updated_at FROM answers').all();
  const actions = db.prepare('SELECT * FROM actions ORDER BY status, due_date, id').all();
  res.json({ answers, actions });
});

app.post('/api/answer', apiAuth, (req, res) => {
  const { block, question_key, answer } = req.body || {};
  if (!question_key || typeof answer !== 'string') return res.status(400).json({ error: 'invalid' });
  db.prepare(`INSERT INTO answers(block, question_key, answer) VALUES(?,?,?)
              ON CONFLICT(question_key) DO UPDATE SET answer=excluded.answer, updated_at=datetime('now')`)
    .run(block || '', question_key, answer);
  res.json({ ok: true });
});

app.post('/api/action', apiAuth, (req, res) => {
  const { owner, title, block, due_date } = req.body || {};
  if (!owner || !title) return res.status(400).json({ error: 'invalid' });
  const r = db.prepare(`INSERT INTO actions(owner,title,block,due_date) VALUES(?,?,?,?)`)
    .run(owner, title, block || '', due_date || null);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.patch('/api/action/:id', apiAuth, (req, res) => {
  const id = Number(req.params.id);
  const { due_date, status } = req.body || {};
  if (due_date !== undefined) {
    db.prepare('UPDATE actions SET due_date=? WHERE id=?').run(due_date || null, id);
  }
  if (status === 'concluida') {
    db.prepare("UPDATE actions SET status='concluida', completed_at=datetime('now') WHERE id=?").run(id);
  } else if (status === 'pendente') {
    db.prepare("UPDATE actions SET status='pendente', completed_at=NULL WHERE id=?").run(id);
  }
  res.json({ ok: true });
});

app.delete('/api/action/:id', apiAuth, (req, res) => {
  db.prepare('DELETE FROM actions WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/overrides', apiAuth, (_req, res) => {
  const rows = db.prepare('SELECT key, content, hidden FROM overrides').all();
  const map = {};
  rows.forEach(r => { map[r.key] = { content: r.content, hidden: !!r.hidden }; });
  res.json({ overrides: map });
});

app.post('/api/overrides', apiAuth, (req, res) => {
  const { changes } = req.body || {};
  if (!changes || typeof changes !== 'object') return res.status(400).json({ error: 'invalid' });
  const stmt = db.prepare(`INSERT INTO overrides(key, content, hidden) VALUES(?,?,?)
                           ON CONFLICT(key) DO UPDATE SET content=excluded.content, hidden=excluded.hidden, updated_at=datetime('now')`);
  const tx = db.transaction(entries => {
    for (const [k, v] of entries) {
      const content = typeof v === 'string' ? v : (v && typeof v.content === 'string' ? v.content : '');
      const hidden = (v && typeof v === 'object' && v.hidden) ? 1 : 0;
      stmt.run(k, content, hidden);
    }
  });
  tx(Object.entries(changes));
  res.json({ ok: true, count: Object.keys(changes).length });
});

app.delete('/api/overrides/:key', apiAuth, (req, res) => {
  db.prepare('DELETE FROM overrides WHERE key=?').run(req.params.key);
  res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, '0.0.0.0', () => console.log(`farias clientarea on :${PORT}`));
