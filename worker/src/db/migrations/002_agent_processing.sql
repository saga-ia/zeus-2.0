-- Flag para controle de contexto do agente autônomo.
-- Default = 1 (já processado / não-acionável). Insert explicito com 0 apenas para
-- mensagens inbound DM de remetentes na whitelist — acorda o agente.

ALTER TABLE messages ADD COLUMN processed_by_agent INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_messages_unprocessed
  ON messages(chat_id, timestamp)
  WHERE processed_by_agent = 0;
