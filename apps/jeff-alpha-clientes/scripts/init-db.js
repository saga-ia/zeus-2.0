'use strict';
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'clientes.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ativo',
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  visao_geral_json TEXT,
  estrategia_json TEXT,
  ads_json TEXT,
  site_json TEXT,
  contrato_json TEXT,
  financeiro_json TEXT,
  atendimento_json TEXT,
  tarefas_json TEXT,
  anexos_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  business_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  segment TEXT,
  monthly_revenue TEXT,
  current_marketing TEXT,
  goals TEXT,
  notes TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_client_id INTEGER,
  rejected_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  mimetype TEXT,
  size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT,
  target TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_attachments_client ON attachments(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
`);

console.log('Schema OK em', dbPath);
db.close();
