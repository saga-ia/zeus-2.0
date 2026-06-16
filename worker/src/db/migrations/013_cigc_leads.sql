-- Leads captados pelo formulário CIGC.cadastrofirms.com
CREATE TABLE IF NOT EXISTS cigc_leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL,
  telefone        TEXT NOT NULL,
  email           TEXT NOT NULL,
  instagram       TEXT,
  dono_clinica    TEXT,     -- 'sim' ou 'nao'
  nome_clinica    TEXT,
  segmento        TEXT,     -- 'multidisciplinar', 'medica', 'odont'
  origem          TEXT DEFAULT 'cigc_cadastrofirms',
  user_agent      TEXT,
  ip              TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cigc_leads_telefone  ON cigc_leads(telefone);
CREATE INDEX IF NOT EXISTS idx_cigc_leads_created   ON cigc_leads(created_at DESC);
