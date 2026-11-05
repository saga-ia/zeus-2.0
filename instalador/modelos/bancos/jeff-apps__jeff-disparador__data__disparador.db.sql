-- estrutura de /opt/jeff-apps/jeff-disparador/data/disparador.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE agents (
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
CREATE TABLE campaigns (
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
CREATE TABLE recipients (
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
CREATE TABLE send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  recipient_id INTEGER,
  agent_slot INTEGER,
  status TEXT,
  detail TEXT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE maturation_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  min_turns INTEGER NOT NULL DEFAULT 4,
  max_turns INTEGER NOT NULL DEFAULT 8,
  min_delay_seconds INTEGER NOT NULL DEFAULT 180,
  max_delay_seconds INTEGER NOT NULL DEFAULT 480,
  daily_max_sessions INTEGER NOT NULL DEFAULT 4,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE maturation_status (
  slot INTEGER PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_session_at TEXT,
  sessions_today INTEGER DEFAULT 0
);
CREATE TABLE maturation_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_a INTEGER NOT NULL,
  slot_b INTEGER NOT NULL,
  turns INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE maturation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  from_slot INTEGER,
  to_slot INTEGER,
  body TEXT,
  ts TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES maturation_session(id) ON DELETE CASCADE
);
CREATE TABLE flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_recipients_campaign ON recipients(campaign_id, status);
CREATE INDEX idx_recipients_phone ON recipients(phone);
CREATE INDEX idx_log_campaign ON send_log(campaign_id, ts);
COMMIT;
