-- Integração Google (OAuth 2.0). Armazena credenciais do client e tokens por usuário.

CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'google',
  user_key TEXT NOT NULL DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT NOT NULL,
  scopes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, user_key)
);

CREATE INDEX IF NOT EXISTS idx_google_oauth_tokens_provider_user
  ON google_oauth_tokens(provider, user_key);

-- App settings iniciais (client id/secret vão ser setados via script de bootstrap,
-- não hardcoded aqui por higiene de segredo).
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('google_oauth_client_id', '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('google_oauth_client_secret', '');
