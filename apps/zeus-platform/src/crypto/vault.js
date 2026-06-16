const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_DIGEST = 'sha512';

let masterKey = null;

function initMasterKey(secret, salt) {
  if (!secret || !salt) throw new Error('VAULT_SECRET e VAULT_SALT são obrigatórios');
  masterKey = crypto.pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LEN, PBKDF2_DIGEST);
}

function ensureKey() {
  if (!masterKey) throw new Error('Módulo de criptografia não inicializado');
}

// Retorna string base64: iv(12) + tag(16) + ciphertext
function encrypt(plaintext) {
  ensureKey();
  if (plaintext === null || plaintext === undefined) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

// Recebe base64, retorna string plaintext
function decrypt(ciphertext) {
  ensureKey();
  if (!ciphertext) return null;
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

module.exports = { initMasterKey, encrypt, decrypt };
