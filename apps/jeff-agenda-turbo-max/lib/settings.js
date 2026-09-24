// Acesso centralizado à tabela settings. Chaves sensíveis são criptografadas
// no banco automaticamente (seal na escrita, open na leitura).
const { getDb } = require('../db');
const { seal, open } = require('./crypto');

// Chaves que NUNCA ficam em texto plano no banco nem saem pela API.
const SENSITIVE_KEYS = new Set([
  'meta_app_secret',
  'google_client_secret',
  'tiktok_client_secret',
  'ai_claude_key',
  'ai_openai_key',
  'ai_gemini_key',
  'google_drive_access_token',
  'google_drive_refresh_token'
]);

function isSensitive(key) {
  return SENSITIVE_KEYS.has(key);
}

function getSetting(key) {
  const raw = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
  return raw === null ? null : open(raw);
}

function setSetting(key, value) {
  const stored = isSensitive(key) ? seal(value) : value;
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, stored);
}

module.exports = { getSetting, setSetting, isSensitive, SENSITIVE_KEYS };
