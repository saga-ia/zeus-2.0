-- estrutura de /opt/jeff-apps/jeff-cigc-comercial/data/comercial.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE clinicas_estados (
    uf TEXT PRIMARY KEY,
    estado TEXT NOT NULL,
    regiao TEXT NOT NULL,
    cidades TEXT,
    quantidade INTEGER,
    inscritos_2025 INTEGER DEFAULT 0,
    notas TEXT,
    fonte TEXT,
    updated_at TEXT
  );
CREATE TABLE pesquisas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    summary TEXT,
    raw TEXT
  );
COMMIT;
