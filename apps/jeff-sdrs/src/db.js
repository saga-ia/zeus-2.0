const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'sdrs.db'));
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

CREATE TABLE IF NOT EXISTS sdrs (
  slot INTEGER PRIMARY KEY,
  name TEXT,
  role_label TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_qr TEXT,
  last_qr_at TEXT,
  ready_at TEXT,
  pairing_code TEXT,
  pairing_code_at TEXT,
  instructions TEXT,
  instructions_updated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  contact_phone TEXT,
  contact_name TEXT,
  last_message TEXT,
  last_from_me INTEGER DEFAULT 0,
  last_ts INTEGER,
  unread INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slot, chat_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_slot_ts ON conversations(slot, last_ts DESC);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  wa_message_id TEXT,
  from_me INTEGER DEFAULT 0,
  body TEXT,
  ts INTEGER,
  type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slot, wa_message_id)
);
CREATE INDEX IF NOT EXISTS idx_msg_slot_chat_ts ON messages(slot, chat_id, ts DESC);

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

CREATE TABLE IF NOT EXISTS slot_triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slot, keyword)
);
CREATE INDEX IF NOT EXISTS idx_slot_triggers_slot ON slot_triggers(slot);

CREATE TABLE IF NOT EXISTS contact_slot_binding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  matched_keyword TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(phone, chat_id)
);
CREATE INDEX IF NOT EXISTS idx_binding_phone ON contact_slot_binding(phone);

CREATE TABLE IF NOT EXISTS slot_upload_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  target_phone TEXT NOT NULL,
  target_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_upload_slot ON slot_upload_job(slot, status);

CREATE TABLE IF NOT EXISTS slot_dispatch_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dispatch_slot ON slot_dispatch_messages(slot, position);

CREATE TABLE IF NOT EXISTS slot_dispatch_state (
  slot INTEGER PRIMARY KEY,
  next_message_index INTEGER NOT NULL DEFAULT 0,
  sent_since_pause INTEGER NOT NULL DEFAULT 0,
  paused_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

db.exec(SCHEMA);

function ensureColumn(table, name, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}
ensureColumn('sdrs', 'pairing_code', 'TEXT');
ensureColumn('sdrs', 'pairing_code_at', 'TEXT');
ensureColumn('sdrs', 'instructions', 'TEXT');
ensureColumn('sdrs', 'instructions_updated_at', 'TEXT');
ensureColumn('sdrs', 'welcome_message', 'TEXT');
ensureColumn('sdrs', 'ai_active', "INTEGER NOT NULL DEFAULT 0");
ensureColumn('sdrs', 'master_slot', 'INTEGER');
ensureColumn('sdrs', 'trigger_mode', "TEXT NOT NULL DEFAULT 'any'");
ensureColumn('sdrs', 'sdr_mode', "TEXT NOT NULL DEFAULT 'receptivo'");
ensureColumn('sdrs', 'personality_level', "INTEGER NOT NULL DEFAULT 5");
ensureColumn('sdrs', 'reference_url', 'TEXT');
ensureColumn('sdrs', 'conversation_instructions', 'TEXT');
ensureColumn('sdrs', 'dispatch_min_delay', "INTEGER NOT NULL DEFAULT 30");
ensureColumn('sdrs', 'dispatch_max_delay', "INTEGER NOT NULL DEFAULT 60");
ensureColumn('sdrs', 'dispatch_pause_every', "INTEGER NOT NULL DEFAULT 10");
ensureColumn('sdrs', 'dispatch_pause_seconds', "INTEGER NOT NULL DEFAULT 300");
ensureColumn('sdrs', 'zeus_mode', "INTEGER NOT NULL DEFAULT 0");
ensureColumn('sdrs', 'zeus_mode_at', 'TEXT');
ensureColumn('slot_dispatch_state', 'dispatch_running', "INTEGER NOT NULL DEFAULT 0");
ensureColumn('slot_dispatch_state', 'started_at', 'TEXT');
ensureColumn('slot_dispatch_state', 'paused_at', 'TEXT');

// ===== SDR IA (v1.1) — Fase 1: chaves globais + config por SDR + log de interacoes =====
db.exec(`
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  key_cipher TEXT NOT NULL,
  key_last4 TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);

CREATE TABLE IF NOT EXISTS ai_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  key_id INTEGER,
  status TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  error TEXT,
  reply_preview TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_int_slot_day ON ai_interactions(slot, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_int_chat ON ai_interactions(slot, chat_id);
`);

ensureColumn('sdrs', 'ai_provider', "TEXT");
ensureColumn('sdrs', 'ai_model', "TEXT");
ensureColumn('sdrs', 'ai_key_id', "INTEGER");
ensureColumn('sdrs', 'ai_daily_limit', "INTEGER NOT NULL DEFAULT 20");
ensureColumn('sdrs', 'ai_paused_until', "TEXT");

// ===== Recursos de envio por slot (link / arquivo / imagem) =====
ensureColumn('sdrs', 'send_link_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('sdrs', 'send_link_url', 'TEXT');
ensureColumn('sdrs', 'send_link_trigger', 'TEXT');
ensureColumn('sdrs', 'send_file_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('sdrs', 'send_file_path', 'TEXT');
ensureColumn('sdrs', 'send_file_trigger', 'TEXT');
ensureColumn('sdrs', 'send_image_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('sdrs', 'send_image_path', 'TEXT');
ensureColumn('sdrs', 'send_image_trigger', 'TEXT');

const TOTAL_SLOTS = 16;
const slotInsert = db.prepare('INSERT OR IGNORE INTO sdrs (slot, status) VALUES (?, ?)');
for (let i = 1; i <= TOTAL_SLOTS; i++) slotInsert.run(i, 'idle');

const userExists = db.prepare('SELECT 1 FROM users WHERE username = ?').get('jeff');
if (!userExists) {
  const hash = bcrypt.hashSync('Alpha@2026', 10);
  db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run('jeff', hash, 'Jeferson Henrike', 'admin');
}

module.exports = { db, TOTAL_SLOTS };
