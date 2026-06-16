CREATE TABLE IF NOT EXISTS sessoes_individuais_outlier (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  nome TEXT,
  programa TEXT DEFAULT 'outlier',
  sessoes_inclusas INTEGER DEFAULT 2,
  sessoes_usadas INTEGER DEFAULT 0,
  sessoes_extras_pagas INTEGER DEFAULT 0,
  observacao TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessoes_phone ON sessoes_individuais_outlier(phone);

CREATE TABLE IF NOT EXISTS sessoes_individuais_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlier_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  agendada_para TEXT,
  realizada_em TEXT,
  observacao TEXT,
  cobrada INTEGER DEFAULT 0,
  valor_cobrado_centavos INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (outlier_id) REFERENCES sessoes_individuais_outlier(id)
);
