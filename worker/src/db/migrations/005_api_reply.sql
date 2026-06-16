-- Fase 2: respostas automáticas via Anthropic API para contatos não-whitelist.

-- KV geral pra configurações dinâmicas (panic button, etc.).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Opt-out / tags por contato.
-- api_replies_enabled = 0 → agente da API ignora esse contato mesmo que panic esteja desligado.
CREATE TABLE IF NOT EXISTS contact_settings (
  phone TEXT PRIMARY KEY,
  api_replies_enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  set_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Auditoria: cada tentativa de resposta pela API.
CREATE TABLE IF NOT EXISTS api_reply_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,
  chat_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reply_body TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_reply_log_phone ON api_reply_log(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_reply_log_status ON api_reply_log(status, created_at DESC);

-- Bootstrap: botão de pânico ATIVO (nada é respondido pela API até destravar explicitamente).
-- Semântica: api_replies_panic='1' → sistema silenciado; '0' → liberado sujeito a opt-outs individuais.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('api_replies_panic', '1');
-- Modelo Anthropic padrão (pode ser sobrescrito via env ou UPDATE direto).
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('api_reply_model', 'claude-opus-4-7');
-- Máximo de tokens na resposta.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('api_reply_max_tokens', '512');
-- Quantas mensagens do histórico incluir como contexto.
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('api_reply_history_limit', '20');
