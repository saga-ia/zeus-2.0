-- Campanha de indicações do PQV (método de coaching de vendas).
-- Participantes do evento mandam mensagens pro worker com nomes/telefones
-- de pessoas que querem indicar pra próxima turma. O worker registra aqui
-- e depois consulta ranking pra sorteio.

CREATE TABLE IF NOT EXISTS pqv_referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_phone TEXT NOT NULL,           -- quem indicou (phone canônico, só dígitos)
  referrer_name TEXT,                     -- nome de quem indicou (pode estar em contact_aliases)
  referred_name TEXT,                     -- nome do indicado
  referred_phone TEXT,                    -- telefone do indicado (pode ficar null se só veio nome)
  referred_email TEXT,                    -- opcional
  source_message_id TEXT,                 -- messages.message_id da mensagem original
  campaign TEXT NOT NULL DEFAULT 'pqv',   -- identificador da campanha, extensível pra futuras
  notes TEXT,                             -- observações livres (ex.: "veio com contexto adicional")
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pqv_referrals_referrer
  ON pqv_referrals(referrer_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pqv_referrals_campaign
  ON pqv_referrals(campaign, created_at DESC);

-- Settings KV pra toggle da campanha (abre/fecha período de coleta sem depender de deploy).
-- pqv_campaign_active='1' → agente aceita indicações e responde coletando.
-- pqv_campaign_active='0' → agente não entra em modo coleta mesmo que a msg mencione PQV.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('pqv_campaign_active', '0');
-- Nome legível da campanha atual (pra aparecer em mensagens e ranking).
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('pqv_campaign_label', 'PQV');
