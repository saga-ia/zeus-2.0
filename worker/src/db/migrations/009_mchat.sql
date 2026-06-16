-- mchat: Instagram comment-to-DM automation (substituto do ManyChat)
CREATE TABLE IF NOT EXISTS mchat_processed_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL,
  ig_user_id TEXT,
  ig_username TEXT,
  text TEXT,
  matched_keyword TEXT,
  reply_sent INTEGER DEFAULT 0,
  reply_id TEXT,
  dm_sent INTEGER DEFAULT 0,
  dm_message_id TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mchat_comment_id ON mchat_processed_comments(comment_id);
CREATE INDEX IF NOT EXISTS idx_mchat_username ON mchat_processed_comments(ig_username);

CREATE TABLE IF NOT EXISTS mchat_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO mchat_settings (key, value) VALUES ('keywords', 'paradigma');
INSERT OR IGNORE INTO mchat_settings (key, value) VALUES ('comment_reply', 'Acabei de te chamar no direct! 🚀');
INSERT OR IGNORE INTO mchat_settings (key, value) VALUES ('dm_message', 'Oi! Vi que você comentou paradigma no meu post 🙌\n\nSegue o link da Imersão Paradigma — 3 dias que viram a chave do empresário:\nhttps://imersaoparadigma.com.br\n\nQualquer coisa me responde aqui que eu te explico tudo. Forte abraço, Lucas.');
INSERT OR IGNORE INTO mchat_settings (key, value) VALUES ('enabled', '1');
INSERT OR IGNORE INTO mchat_settings (key, value) VALUES ('poll_interval_ms', '30000');
