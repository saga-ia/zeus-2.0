const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3030;
const DB_PATH = path.join(__dirname, 'data', 'org.db');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    level TEXT DEFAULT 'equipe',
    parent_id INTEGER,
    phone TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    email TEXT DEFAULT '',
    photo TEXT DEFAULT '',
    color TEXT DEFAULT '',
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  INSERT OR IGNORE INTO settings VALUES ('company_name', 'Board Academy');
  INSERT OR IGNORE INTO settings VALUES ('company_logo', '');
`);
// Migration: add color column if not exists
try { db.exec(`ALTER TABLE nodes ADD COLUMN color TEXT DEFAULT ''`); } catch (_) {}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `photo_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function buildTree(nodes, parentId = null) {
  return nodes
    .filter(n => n.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map(n => ({ ...n, children: buildTree(nodes, n.id) }));
}

app.get('/api/org', (req, res) => {
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY order_index ASC').all();
  const settings = db.prepare('SELECT key, value FROM settings').all();
  const config = {};
  settings.forEach(s => { config[s.key] = s.value; });
  res.json({ tree: buildTree(nodes), settings: config });
});

app.get('/api/nodes', (req, res) => {
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY order_index ASC').all();
  res.json(nodes);
});

app.post('/api/nodes', (req, res) => {
  const { name, role, level, parent_id, phone, whatsapp, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM nodes WHERE parent_id IS ?'
  ).get(parent_id ?? null);

  const { color } = req.body;
  const stmt = db.prepare(`
    INSERT INTO nodes (name, role, level, parent_id, phone, whatsapp, email, color, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    name, role || '', level || 'equipe', parent_id || null,
    phone || '', whatsapp || '', email || '', color || '', maxOrder.next
  );
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(result.lastInsertRowid);
  res.json(node);
});

app.put('/api/nodes/:id', (req, res) => {
  const { name, role, level, parent_id, phone, whatsapp, email, color, order_index } = req.body;
  const id = parseInt(req.params.id);

  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  if (!node) return res.status(404).json({ error: 'Nó não encontrado' });

  db.prepare(`
    UPDATE nodes SET
      name = ?, role = ?, level = ?, parent_id = ?,
      phone = ?, whatsapp = ?, email = ?, color = ?, order_index = ?
    WHERE id = ?
  `).run(
    name ?? node.name, role ?? node.role, level ?? node.level,
    parent_id !== undefined ? (parent_id || null) : node.parent_id,
    phone ?? node.phone, whatsapp ?? node.whatsapp, email ?? node.email,
    color !== undefined ? color : (node.color || ''),
    order_index ?? node.order_index, id
  );

  res.json(db.prepare('SELECT * FROM nodes WHERE id = ?').get(id));
});

app.delete('/api/nodes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  function deleteRecursive(nodeId) {
    const children = db.prepare('SELECT id FROM nodes WHERE parent_id = ?').all(nodeId);
    children.forEach(c => deleteRecursive(c.id));
    db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
  }
  deleteRecursive(id);
  res.json({ ok: true });
});

app.post('/api/nodes/:id/photo', upload.single('photo'), (req, res) => {
  const id = parseInt(req.params.id);
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
  if (!node) return res.status(404).json({ error: 'Nó não encontrado' });

  if (node.photo && node.photo.startsWith('/uploads/')) {
    const oldFile = path.join(__dirname, 'public', node.photo);
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  const photoPath = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE nodes SET photo = ? WHERE id = ?').run(photoPath, id);
  res.json({ photo: photoPath });
});

app.put('/api/settings', (req, res) => {
  const { company_name, company_logo, custom_departments } = req.body;
  if (company_name !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run('company_name', company_name);
  if (company_logo !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run('company_logo', company_logo);
  if (custom_departments !== undefined)
    db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run('custom_departments', custom_departments);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Board Academy Org rodando na porta ${PORT}`);
});
