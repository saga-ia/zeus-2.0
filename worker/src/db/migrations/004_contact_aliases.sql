-- Mapa phone ↔ @c.us ↔ @lid. LID é opaco: last9(lid) NÃO é o número.
-- Precisamos resolver via client.getContactById para popular.
CREATE TABLE IF NOT EXISTS contact_aliases (
  phone TEXT PRIMARY KEY,
  lid TEXT,
  c_us TEXT,
  name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_aliases_lid ON contact_aliases(lid);
CREATE INDEX IF NOT EXISTS idx_contact_aliases_cus ON contact_aliases(c_us);

-- Phone canônico do contato "do outro lado" — permite o agente filtrar por pessoa
-- mesmo que o chat_id flutue entre @c.us e @lid.
ALTER TABLE messages ADD COLUMN contact_phone TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_contact_phone ON messages(contact_phone);
