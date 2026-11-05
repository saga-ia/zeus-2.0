-- estrutura de /opt/jeff-apps/zeus-platform/data/zeus.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'owner' | 'editor' | 'viewer'
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login INTEGER
);
CREATE TABLE vault_passwords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,          -- nome do serviço (ex: "Instagram Jeff")
  username_enc TEXT,            -- cifrado
  password_enc TEXT NOT NULL,   -- cifrado
  url_enc TEXT,                 -- cifrado
  notes_enc TEXT,               -- cifrado
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE vault_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,        -- ex: "Anthropic", "Meta", "Asaas"
  key_enc TEXT NOT NULL,        -- cifrado
  description TEXT,
  expires_at INTEGER,           -- null = sem vencimento
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,    -- ex: "zeus", "maicon", "sobral"
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-opus-4-7',
  api_key_id INTEGER REFERENCES vault_api_keys(id),
  icon TEXT,                    -- emoji ou URL
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,     -- UUID gerado no frontend
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,         -- ex: "login", "vault.read", "agent.create"
  target TEXT,                  -- ex: "vault_passwords:5"
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_chat_session ON chat_messages(session_id, created_at);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at);
INSERT OR IGNORE INTO "schema_migrations" ("version", "applied_at") VALUES ('001_initial.sql', 1778948279);
COMMIT;
