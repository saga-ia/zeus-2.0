const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3016;
const DB_PATH = path.join(__dirname, 'data', 'onboarding.db');
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    last_section INTEGER DEFAULT 0,
    photo_path TEXT,
    user_agent TEXT,
    ip TEXT
  );
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    section INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    question_label TEXT,
    value TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  CREATE INDEX IF NOT EXISTS idx_resp_session ON responses(session_id, question_key, version);
`);

const sessionCols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
if (!sessionCols.includes('slug')) {
  db.exec("ALTER TABLE sessions ADD COLUMN slug TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_slug ON sessions(slug) WHERE slug IS NOT NULL");
}

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadAnswers(sessionId) {
  const rows = db.prepare(`
    SELECT r.question_key, r.value
    FROM responses r
    JOIN (
      SELECT question_key, MAX(version) AS v
      FROM responses WHERE session_id = ?
      GROUP BY question_key
    ) m ON m.question_key = r.question_key AND m.v = r.version
    WHERE r.session_id = ?
  `).all(sessionId, sessionId);
  const out = {};
  for (const r of rows) out[r.question_key] = r.value || '';
  return out;
}

app.post('/api/session', (req, res) => {
  const slug = (req.body && typeof req.body.slug === 'string' && req.body.slug.trim()) ? req.body.slug.trim().toLowerCase() : null;
  if (slug) {
    const existing = db.prepare('SELECT id FROM sessions WHERE slug=?').get(slug);
    if (existing) {
      return res.json({ session_id: existing.id, slug, answers: loadAnswers(existing.id) });
    }
  }
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO sessions (id, slug, user_agent, ip) VALUES (?, ?, ?, ?)').run(
    id,
    slug,
    String(req.headers['user-agent'] || '').slice(0, 200),
    req.ip || ''
  );
  res.json({ session_id: id, slug, answers: {} });
});

app.post('/api/save', (req, res) => {
  const { session_id, section, answers } = req.body || {};
  if (!session_id || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'session_id and answers[] required' });
  }
  const sess = db.prepare('SELECT id FROM sessions WHERE id=?').get(session_id);
  if (!sess) return res.status(404).json({ error: 'session not found' });

  const getMaxVer = db.prepare(
    'SELECT COALESCE(MAX(version),0) AS v FROM responses WHERE session_id=? AND question_key=?'
  );
  const insertResp = db.prepare(
    'INSERT INTO responses (session_id, section, question_key, question_label, value, version) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction((items) => {
    for (const a of items) {
      const prev = getMaxVer.get(session_id, a.key);
      const lastRow = prev.v
        ? db.prepare('SELECT value FROM responses WHERE session_id=? AND question_key=? AND version=?').get(session_id, a.key, prev.v)
        : null;
      if (!lastRow || (lastRow.value || '') !== (a.value || '')) {
        insertResp.run(session_id, section || 0, a.key, a.label || a.key, a.value || '', prev.v + 1);
      }
    }
    db.prepare('UPDATE sessions SET last_section=? WHERE id=?').run(section || 0, session_id);
  });
  tx(answers);
  res.json({ ok: true });
});

app.post('/api/photo', (req, res) => {
  const { session_id, data_url } = req.body || {};
  if (!session_id || !data_url) return res.status(400).json({ error: 'session_id and data_url required' });
  const m = String(data_url).match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'invalid image' });
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const filename = `${session_id}_${Date.now()}.${ext}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, Buffer.from(m[3], 'base64'));
  db.prepare('UPDATE sessions SET photo_path=? WHERE id=?').run(fullPath, session_id);
  res.json({ ok: true, path: fullPath });
});

app.post('/api/complete', (req, res) => {
  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: 'session_id required' });
  db.prepare("UPDATE sessions SET completed_at=datetime('now') WHERE id=?").run(session_id);
  res.json({ ok: true });
});

function checkAdminToken(token) {
  return token && (token === process.env.ADMIN_TOKEN || token === 'jeffalpha2026');
}

app.get('/api/admin/responses', (req, res) => {
  if (!checkAdminToken(req.query.token)) return res.status(401).json({ error: 'unauthorized' });
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all();
  const out = sessions.map(s => {
    const rows = db.prepare(
      'SELECT section, question_key, question_label, value, version, created_at FROM responses WHERE session_id=? ORDER BY question_key, version'
    ).all(s.id);
    return { ...s, responses: rows };
  });
  res.json(out);
});

app.get('/api/admin/photo/:sessionId', (req, res) => {
  if (!checkAdminToken(req.query.token)) return res.status(401).json({ error: 'unauthorized' });
  const s = db.prepare('SELECT photo_path FROM sessions WHERE id=?').get(req.params.sessionId);
  if (!s || !s.photo_path || !fs.existsSync(s.photo_path)) return res.status(404).end();
  res.sendFile(s.photo_path);
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[onboarding] listening on 0.0.0.0:${PORT}`);
});
