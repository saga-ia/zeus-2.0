-- estrutura de /opt/jeff-apps/jeff-farias-crm/kanban.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE lead_stages (
    lead_key TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'novo_lead',
    notes TEXT DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE TABLE sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
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
  );
COMMIT;
