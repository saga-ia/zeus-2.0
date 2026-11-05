-- estrutura de /opt/jeff-apps/jeff-cigc-clientarea/data/cigc.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  , phone TEXT);
CREATE TABLE speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    instagram TEXT,
    talk_topic TEXT,
    photo_url TEXT,
    confirmed INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    phone TEXT,
    instagram TEXT,
    photo_url TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE ig_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handle TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE ig_search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    query_text TEXT,
    status TEXT DEFAULT 'pending',
    result_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
CREATE TABLE invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    used_at TEXT,
    used_by_user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE clinic_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload_json TEXT NOT NULL,
    source TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE venue_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_url TEXT NOT NULL,
    caption TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE venue_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_url TEXT,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
COMMIT;
