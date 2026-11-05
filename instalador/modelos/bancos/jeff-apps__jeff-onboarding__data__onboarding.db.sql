-- estrutura de /opt/jeff-apps/jeff-onboarding/data/onboarding.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    last_section INTEGER DEFAULT 0,
    photo_path TEXT,
    user_agent TEXT,
    ip TEXT
  , slug TEXT);
CREATE TABLE responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    section INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    question_label TEXT,
    value TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
CREATE INDEX idx_resp_session ON responses(session_id, question_key, version);
CREATE UNIQUE INDEX idx_sessions_slug ON sessions(slug) WHERE slug IS NOT NULL;
COMMIT;
