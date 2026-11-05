-- estrutura de /opt/jeff-apps/jeff-mapadocloser/data/mapadocloser.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event_date TEXT,
  theme TEXT,
  sheet_url TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
, linkedin_urls TEXT);
CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processando',
  csv_raw TEXT,
  lead_count INTEGER DEFAULT 0,
  result_html TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
, progress_current INTEGER DEFAULT 0, progress_total INTEGER DEFAULT 0, progress_message TEXT, started_at INTEGER);
CREATE INDEX idx_analyses_event ON analyses(event_id, created_at DESC);
COMMIT;
