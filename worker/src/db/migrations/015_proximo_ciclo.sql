-- Aplicações para a Mentoria O Próximo Ciclo (Farias Souza)
CREATE TABLE IF NOT EXISTS proximo_ciclo_aplicacoes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                  TEXT NOT NULL,
  linkedin              TEXT,
  whatsapp              TEXT NOT NULL,
  email                 TEXT,
  posicionamento        TEXT,     -- CEO/Diretor/Ex-CEO/Outro
  faturamento           TEXT,     -- faixa para empresários
  experiencia           TEXT,     -- faixa para executivos
  momento_profissional  TEXT,     -- persona: Ricardo/Marcos/André
  decisoes_sozinho      TEXT,
  preocupacao_futuro    TEXT,
  por_que_pronto        TEXT,
  capacidade_financeira TEXT,
  dispositivo           TEXT,
  sistema_op            TEXT,
  navegador             TEXT,
  rede                  TEXT,
  ip                    TEXT,
  cidade_pais           TEXT,
  tempo_preenchimento   INTEGER,  -- segundos
  user_agent            TEXT,
  sheets_synced         INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pca_whatsapp  ON proximo_ciclo_aplicacoes(whatsapp);
CREATE INDEX IF NOT EXISTS idx_pca_created   ON proximo_ciclo_aplicacoes(created_at DESC);
