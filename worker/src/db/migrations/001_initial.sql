-- Phase 1 initial schema.
-- Everything here is idempotent via IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,
  from_id TEXT,
  to_id TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  type TEXT,
  body TEXT,
  has_media INTEGER DEFAULT 0,
  media_path TEXT,
  from_me INTEGER DEFAULT 0,
  author_name TEXT,
  ack INTEGER DEFAULT 0,
  is_group INTEGER DEFAULT 0,
  timestamp TEXT NOT NULL,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

CREATE TABLE IF NOT EXISTS chats (
  jid TEXT PRIMARY KEY,
  name TEXT,
  is_group INTEGER DEFAULT 0,
  last_message_ts TEXT,
  unread_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  jid TEXT PRIMARY KEY,
  name TEXT,
  push_name TEXT,
  number TEXT,
  is_business INTEGER DEFAULT 0,
  is_blocked INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS send_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error TEXT,
  scheduled_for TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_status ON send_queue(status, priority, id);
CREATE INDEX IF NOT EXISTS idx_queue_created ON send_queue(created_at);

CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '*',
  token TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON webhook_deliveries(status, next_retry_at);

CREATE TABLE IF NOT EXISTS api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT,
  path TEXT,
  auth_type TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_logs(created_at);
