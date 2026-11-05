-- estrutura de /opt/jeff-apps/jeff-sdrs/data/sdrs.db (sem dados)
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
CREATE TABLE sdrs (
  slot INTEGER PRIMARY KEY,
  name TEXT,
  role_label TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_qr TEXT,
  last_qr_at TEXT,
  ready_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, pairing_code TEXT, pairing_code_at TEXT, instructions TEXT, instructions_updated_at TEXT, welcome_message TEXT, ai_active INTEGER NOT NULL DEFAULT 0, master_slot INTEGER, trigger_mode TEXT NOT NULL DEFAULT 'any', sdr_mode TEXT NOT NULL DEFAULT 'receptivo', personality_level INTEGER NOT NULL DEFAULT 5, reference_url TEXT, conversation_instructions TEXT, dispatch_min_delay INTEGER NOT NULL DEFAULT 30, dispatch_max_delay INTEGER NOT NULL DEFAULT 60, dispatch_pause_every INTEGER NOT NULL DEFAULT 10, dispatch_pause_seconds INTEGER NOT NULL DEFAULT 300, zeus_mode INTEGER NOT NULL DEFAULT 0, zeus_mode_at TEXT, ai_provider TEXT, ai_model TEXT, ai_key_id INTEGER, ai_daily_limit INTEGER NOT NULL DEFAULT 20, ai_paused_until TEXT, send_link_enabled INTEGER NOT NULL DEFAULT 0, send_link_url TEXT, send_link_trigger TEXT, send_file_enabled INTEGER NOT NULL DEFAULT 0, send_file_path TEXT, send_file_trigger TEXT, send_image_enabled INTEGER NOT NULL DEFAULT 0, send_image_path TEXT, send_image_trigger TEXT);
CREATE TABLE conversations (
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
CREATE TABLE messages (
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
CREATE TABLE slot_triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slot, keyword)
);
CREATE TABLE contact_slot_binding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  matched_keyword TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(phone, chat_id)
);
CREATE TABLE slot_upload_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  target_phone TEXT NOT NULL,
  target_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE TABLE slot_dispatch_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE slot_dispatch_state (
  slot INTEGER PRIMARY KEY,
  next_message_index INTEGER NOT NULL DEFAULT 0,
  sent_since_pause INTEGER NOT NULL DEFAULT 0,
  paused_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
, dispatch_running INTEGER NOT NULL DEFAULT 0, started_at TEXT, paused_at TEXT);
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  key_cipher TEXT NOT NULL,
  key_last4 TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);
CREATE TABLE ai_interactions (
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
CREATE INDEX idx_conv_slot_ts ON conversations(slot, last_ts DESC);
CREATE INDEX idx_msg_slot_chat_ts ON messages(slot, chat_id, ts DESC);
CREATE INDEX idx_slot_triggers_slot ON slot_triggers(slot);
CREATE INDEX idx_binding_phone ON contact_slot_binding(phone);
CREATE INDEX idx_upload_slot ON slot_upload_job(slot, status);
CREATE INDEX idx_dispatch_slot ON slot_dispatch_messages(slot, position);
CREATE INDEX idx_api_keys_provider ON api_keys(provider);
CREATE INDEX idx_ai_int_slot_day ON ai_interactions(slot, created_at);
CREATE INDEX idx_ai_int_chat ON ai_interactions(slot, chat_id);
COMMIT;
