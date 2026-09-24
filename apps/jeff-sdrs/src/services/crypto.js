'use strict';
// AES-256-GCM helpers. ENCRYPTION_KEY vem do .env (32 bytes em hex = 64 chars).
// Formato do ciphertext: base64(iv):base64(authTag):base64(data)

const crypto = require('crypto');

const RAW = process.env.ENCRYPTION_KEY;
if (!RAW || RAW.length < 32) {
  // FALHA HARD: nao subir servico sem chave de cripto.
  throw new Error('[crypto] ENCRYPTION_KEY ausente ou curta demais no .env (min 32 chars).');
}

// Aceita hex de 64 chars (32 bytes) ou string arbitraria (deriva SHA-256).
let KEY;
if (/^[0-9a-fA-F]{64}$/.test(RAW)) {
  KEY = Buffer.from(RAW, 'hex');
} else {
  KEY = crypto.createHash('sha256').update(RAW).digest();
}

function encrypt(plain) {
  if (plain == null) throw new Error('encrypt: plain vazio');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(payload) {
  if (!payload || typeof payload !== 'string') throw new Error('decrypt: payload invalido');
  const parts = payload.split(':');
  if (parts.length !== 3) throw new Error('decrypt: formato invalido');
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

function last4(str) {
  const s = String(str || '');
  if (s.length <= 4) return s;
  return s.slice(-4);
}

module.exports = { encrypt, decrypt, last4 };
