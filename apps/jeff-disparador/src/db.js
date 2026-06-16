const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'disparador.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
  slot INTEGER PRIMARY KEY,
  label TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_qr TEXT,
  last_qr_at TEXT,
  ready_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  message_variants TEXT,
  agent_slots TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  vars TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  agent_slot INTEGER,
  attempts INTEGER DEFAULT 0,
  error TEXT,
  sent_at TEXT,
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_recipients_phone ON recipients(phone);

CREATE TABLE IF NOT EXISTS send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  recipient_id INTEGER,
  agent_slot INTEGER,
  status TEXT,
  detail TEXT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_log_campaign ON send_log(campaign_id, ts);

CREATE TABLE IF NOT EXISTS maturation_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  min_turns INTEGER NOT NULL DEFAULT 4,
  max_turns INTEGER NOT NULL DEFAULT 8,
  min_delay_seconds INTEGER NOT NULL DEFAULT 180,
  max_delay_seconds INTEGER NOT NULL DEFAULT 480,
  daily_max_sessions INTEGER NOT NULL DEFAULT 4,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO maturation_config (id) VALUES (1);

CREATE TABLE IF NOT EXISTS maturation_status (
  slot INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_session_at TEXT,
  sessions_today INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maturation_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_a INTEGER NOT NULL,
  slot_b INTEGER NOT NULL,
  turns INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS maturation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  from_slot INTEGER,
  to_slot INTEGER,
  body TEXT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES maturation_session(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(SCHEMA);

const TOTAL_SLOTS = 16;
const slotInsert = db.prepare('INSERT OR IGNORE INTO agents (slot, status) VALUES (?, ?)');
for (let i = 1; i <= TOTAL_SLOTS; i++) slotInsert.run(i, 'idle');

const userExists = db.prepare('SELECT 1 FROM users WHERE username = ?').get('jeff');
if (!userExists) {
  const hash = bcrypt.hashSync('jeff2026', 10);
  db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run('jeff', hash, 'Jeferson Henrike', 'admin');
}

module.exports = { db, TOTAL_SLOTS };
