const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function resolve(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(__dirname, '..', p);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3002),
  host: process.env.HOST || '127.0.0.1',
  logLevel: process.env.LOG_LEVEL || 'info',

  dbPath: resolve(process.env.DB_PATH || './data/worker.db'),
  authPath: resolve(process.env.AUTH_PATH || './data/.wwebjs_auth'),
  mediaPath: resolve(process.env.MEDIA_PATH || './data/media'),
  chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  clientId: process.env.CLIENT_ID || 'whatsapp-worker',

  apiToken: process.env.API_TOKEN || '',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtTtlDays: num(process.env.JWT_TTL_DAYS, 7),

  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookToken: process.env.WEBHOOK_TOKEN || '',

  sendMinDelayMs: num(process.env.SEND_MIN_DELAY_MS, 3000),
  sendMaxDelayMs: num(process.env.SEND_MAX_DELAY_MS, 7000),
  sendBurstLimit: num(process.env.SEND_BURST_LIMIT, 30),
  sendBurstWindowMs: num(process.env.SEND_BURST_WINDOW_MS, 300000),
  typingPerCharMs: num(process.env.TYPING_PER_CHAR_MS, 30),
  typingMaxMs: num(process.env.TYPING_MAX_MS, 10000),

  authWatchdogMs: num(process.env.AUTH_WATCHDOG_MS, 120000),
  reconnectBaseMs: num(process.env.RECONNECT_BASE_MS, 5000),
  reconnectMaxMs: num(process.env.RECONNECT_MAX_MS, 120000),

  agentWhitelist: (process.env.AGENT_WHITELIST || '')
    .split(',')
    .map((s) => s.trim().replace(/\D+/g, ''))
    .filter(Boolean)
    .map((s) => s.slice(-9)),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',

  ttsVoice: process.env.TTS_VOICE || 'pt-BR-AntonioNeural',
  ttsRate: process.env.TTS_RATE || '+0%',
  ttsPitch: process.env.TTS_PITCH || '+0Hz',
};

function validate() {
  const missing = [];
  if (!config.apiToken || config.apiToken.length < 32) missing.push('API_TOKEN (>=32 chars)');
  if (!config.jwtSecret || config.jwtSecret.length < 32) missing.push('JWT_SECRET (>=32 chars)');
  if (!config.adminPasswordHash) missing.push('ADMIN_PASSWORD_HASH (run npm run hash-password -- <password>)');
  if (missing.length) {
    const err = new Error(`Missing required env: ${missing.join(', ')}`);
    err.code = 'EINVALIDCONFIG';
    throw err;
  }
}

module.exports = { config, validate };
