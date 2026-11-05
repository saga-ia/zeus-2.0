-- estrutura de /opt/jeff-apps/jeff-ebc-crm/data/crm.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  approved INTEGER NOT NULL DEFAULT 0,
  whatsapp TEXT,
  created_at TEXT DEFAULT (datetime('now'))
, approve_token TEXT);
CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  volume TEXT,
  origem TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  geo TEXT,
  device TEXT,
  user_agent TEXT,
  ip TEXT,
  status TEXT NOT NULL DEFAULT 'esperando',
  assigned_to INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), experience TEXT, motivation TEXT, timing TEXT, wants_specialist TEXT, content_pref TEXT, temperature TEXT,
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);
CREATE TABLE lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  user_id INTEGER,
  event TEXT NOT NULL,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
COMMIT;
