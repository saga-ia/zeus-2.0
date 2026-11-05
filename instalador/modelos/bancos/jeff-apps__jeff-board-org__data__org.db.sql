-- estrutura de /opt/jeff-apps/jeff-board-org/data/org.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    level TEXT DEFAULT 'equipe',
    parent_id INTEGER,
    phone TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    email TEXT DEFAULT '',
    photo TEXT DEFAULT '',
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, color TEXT DEFAULT '',
    FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE
  );
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
COMMIT;
