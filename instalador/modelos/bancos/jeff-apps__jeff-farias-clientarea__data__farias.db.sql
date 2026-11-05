-- estrutura de /opt/jeff-apps/jeff-farias-clientarea/data/farias.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block TEXT NOT NULL,
    question_key TEXT NOT NULL,
    answer TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    title TEXT NOT NULL,
    block TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'pendente',
    completed_at TEXT,
    last_chase_at TEXT,
    chase_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE overrides (
    key TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
CREATE UNIQUE INDEX idx_answers_qk ON answers(question_key);
COMMIT;
