#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.ANALYTICS_DB || path.join(__dirname, '..', 'data', 'analytics.db');
const MIG_DIR = path.join(__dirname, 'migrations');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const applied = new Set(
  db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
);

const files = fs.readdirSync(MIG_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

let count = 0;
for (const file of files) {
  const version = parseInt(file.split('_')[0], 10);
  if (applied.has(version)) continue;
  const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
  console.log(`[migrate] aplicando ${file}`);
  const tx = db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version, filename) VALUES (?, ?)').run(version, file);
  });
  tx();
  count++;
}

console.log(`[migrate] ${count} nova(s) migracao(oes) aplicada(s). DB: ${DB_PATH}`);
db.close();
