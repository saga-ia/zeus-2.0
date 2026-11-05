-- estrutura de /opt/jeff-apps/jeff-cigc-crm/kanban.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE lead_stages (
    phone TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'novo_lead',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
CREATE TABLE sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
COMMIT;
