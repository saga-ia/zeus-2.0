-- estrutura de /opt/jeff-apps/jeff-sdrs-crm/kanban.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE lead_stages (
    lead_key TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'novo_lead',
    notes TEXT DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  , synced_from_sdrs INTEGER DEFAULT 0, sent_at INTEGER, delivered_at INTEGER, replied_at INTEGER);
CREATE TABLE manual_leads (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    empresa TEXT,
    telefone TEXT,
    email TEXT,
    posicao TEXT,
    cidade TEXT,
    estado TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  , synced_from_sdrs INTEGER DEFAULT 0, campaign_id TEXT, synced_at INTEGER, dispatch_slot INTEGER);
CREATE TABLE sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
CREATE TABLE global_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    category TEXT DEFAULT 'geral',
    usage_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  , instruction TEXT DEFAULT '', is_system INTEGER DEFAULT 0);
CREATE TABLE lead_tags (
    lead_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (lead_id, tag_id),
    FOREIGN KEY(tag_id) REFERENCES global_tags(id) ON DELETE CASCADE
  );
CREATE TABLE lead_conversas_stream (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL,
    whatsapp_message_id TEXT UNIQUE,
    from_phone TEXT,
    body TEXT,
    tags_detected TEXT,
    ia_confidence REAL DEFAULT 0,
    ts INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE TABLE integration_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_a TEXT NOT NULL,
    system_b TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    secret TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE INDEX idx_lead_conversas_lead_id ON lead_conversas_stream(lead_id, ts DESC);
CREATE INDEX idx_lead_tags_tag_id ON lead_tags(tag_id);
CREATE INDEX idx_global_tags_name ON global_tags(name);
CREATE INDEX idx_integration_tokens_token ON integration_tokens(token);
COMMIT;
