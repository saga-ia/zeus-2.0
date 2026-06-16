const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./index');
const logger = require('../logger');

const MIG_DIR = path.join(__dirname, 'migrations');

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function applied() {
  return new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
}

function files() {
  if (!fs.existsSync(MIG_DIR)) return [];
  return fs
    .readdirSync(MIG_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((name) => ({
      version: parseInt(name.slice(0, 3), 10),
      name,
      full: path.join(MIG_DIR, name),
    }));
}

function run() {
  ensureTable();
  const done = applied();
  const pending = files().filter((f) => !done.has(f.version));
  if (!pending.length) {
    logger.info('No pending migrations');
    return;
  }
  for (const m of pending) {
    const sql = fs.readFileSync(m.full, 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, filename) VALUES (?, ?)').run(m.version, m.name);
    });
    tx();
    logger.info({ version: m.version, name: m.name }, 'applied migration');
  }
}

module.exports = { run };
