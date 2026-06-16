'use strict';
// Uso: node scripts/create-user.js <email> <senha> <nome>
// Gera TOTP secret e imprime otpauth URL + QR code ASCII pra escanear no app autenticador.

const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const [, , email, password, name] = process.argv;
if (!email || !password) {
  console.error('Uso: node scripts/create-user.js <email> <senha> [nome]');
  process.exit(1);
}

const dbPath = path.join(__dirname, '..', 'data', 'clientes.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const password_hash = bcrypt.hashSync(password, 10);
const secret = speakeasy.generateSecret({
  length: 20,
  name: `Alpha Clientes (${email})`,
  issuer: 'Alpha Digital',
});

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare(`UPDATE users SET password_hash = ?, totp_secret = ?, totp_enabled = 0, name = COALESCE(?, name) WHERE email = ?`)
    .run(password_hash, secret.base32, name || null, email);
  console.log(`Usuário ${email} atualizado (id ${existing.id}).`);
} else {
  const info = db.prepare(`INSERT INTO users (email, name, password_hash, totp_secret, totp_enabled, role) VALUES (?, ?, ?, ?, 0, 'admin')`)
    .run(email, name || null, password_hash, secret.base32);
  console.log(`Usuário ${email} criado (id ${info.lastInsertRowid}).`);
}

console.log('\n=== TOTP setup ===');
console.log('Secret base32 :', secret.base32);
console.log('otpauth URL   :', secret.otpauth_url);
console.log('\nEscaneie o QR no Google Authenticator / Authy / 1Password:');

qrcode.toString(secret.otpauth_url, { type: 'terminal', small: true }, (err, str) => {
  if (err) console.error(err);
  else console.log(str);
  db.close();
});
