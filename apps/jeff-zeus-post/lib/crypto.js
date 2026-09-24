// Criptografia de dados sensíveis em repouso (tokens, secrets, API keys).
// AES-256-GCM. Chave vem de ENCRYPTION_KEY (hex de 64 chars) ou é gerada e
// persistida em data/.encryption-key (fora do dump do banco — quem copiar só o
// .db não consegue ler os tokens).
const nodeCrypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', 'data', '.encryption-key');
const PREFIX = 'enc.v1.';
let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;
  const env = process.env.ENCRYPTION_KEY;
  if (env && /^[0-9a-f]{64}$/i.test(env)) {
    cachedKey = Buffer.from(env, 'hex');
    return cachedKey;
  }
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  if (fs.existsSync(KEY_FILE)) {
    cachedKey = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  } else {
    const k = nodeCrypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, k.toString('hex'), { mode: 0o600 });
    console.log('[crypto] Chave de criptografia gerada em data/.encryption-key — faça backup dela junto com o banco');
    cachedKey = k;
  }
  return cachedKey;
}

function isSealed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// Criptografa. Idempotente: valor já criptografado passa direto.
function seal(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  const s = String(plain);
  if (isSealed(s)) return s;
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

// Descriptografa. Valor legado em texto plano passa direto (retrocompatível).
function open(value) {
  if (value === null || value === undefined) return value;
  const s = String(value);
  if (!isSealed(s)) return value;
  try {
    const parts = s.slice(PREFIX.length).split('.');
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('[crypto] Falha ao descriptografar valor (chave errada ou dado corrompido):', err.message);
    return null;
  }
}

// Remove tokens/segredos de qualquer texto antes de ir pro log.
// A Meta ecoa access_token em algumas respostas de erro, e o axios inclui a
// URL da requisição na mensagem — sem isso, token acaba em arquivo de log.
// Pares chave=valor / "chave":"valor" — mantém o rótulo, apaga o valor
const REDACT_KEYED = [
  /(access_token=)[^&\s"']+/gi,
  /(client_secret=)[^&\s"']+/gi,
  /(refresh_token=)[^&\s"']+/gi,
  /("access_token"\s*:\s*")[^"]*/gi,
  /("refresh_token"\s*:\s*")[^"]*/gi,
  /("client_secret"\s*:\s*")[^"]*/gi
];
// Segredos reconhecíveis pelo próprio formato — apaga por inteiro
const REDACT_BARE = [
  /\bEAA[A-Za-z0-9]{20,}/g,       // page/user token da Meta
  /\bsk-[A-Za-z0-9_-]{20,}/g,     // OpenAI / Anthropic
  /\bGOCSPX-[A-Za-z0-9_-]+/g,     // Google client secret
  /\benc\.v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+/g // valor selado
];

function redact(input) {
  let s = typeof input === 'string' ? input : (() => {
    try { return JSON.stringify(input); } catch { return String(input); }
  })();
  for (const re of REDACT_KEYED) s = s.replace(re, '$1***');
  for (const re of REDACT_BARE) s = s.replace(re, '***');
  return s;
}

module.exports = { seal, open, isSealed, redact };
