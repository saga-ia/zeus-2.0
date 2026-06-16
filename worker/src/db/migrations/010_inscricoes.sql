CREATE TABLE IF NOT EXISTS inscricoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  genero TEXT,
  renda_faixa TEXT,
  cidade TEXT,
  origem TEXT DEFAULT 'inscricao_imersao',
  user_agent TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inscricoes_phone ON inscricoes(telefone);
CREATE INDEX IF NOT EXISTS idx_inscricoes_created ON inscricoes(created_at);
