#!/usr/bin/env node
// Roda UMA vez: gera .env, inicializa banco e cria usuário owner
// Uso: node scripts/setup.js <username> <senha>

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const [,, username, password] = process.argv;
if (!username || !password) {
  console.error('Uso: node scripts/setup.js <username> <senha>');
  process.exit(1);
}

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  console.error('.env já existe. Apague manualmente se quiser recriar.');
  process.exit(1);
}

const vaultSecret = crypto.randomBytes(40).toString('hex');
const vaultSalt   = crypto.randomBytes(40).toString('hex');
const jwtSecret   = crypto.randomBytes(40).toString('hex');

fs.writeFileSync(envPath, `PORT=4000
NODE_ENV=production
VAULT_SECRET=${vaultSecret}
VAULT_SALT=${vaultSalt}
JWT_SECRET=${jwtSecret}
`);
console.log('[setup] .env gerado com segredos aleatórios');

// Inicializa banco + cria usuário
require('dotenv').config({ path: envPath });
const { initMasterKey } = require('../src/crypto/vault');
const { getDb } = require('../src/db/database');

initMasterKey(process.env.VAULT_SECRET, process.env.VAULT_SALT);
const db = getDb();

const hash = bcrypt.hashSync(password, 12);
db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?,?,?)').run(username, hash, 'owner');
console.log(`[setup] usuário '${username}' criado como owner`);
console.log('[setup] Plataforma Zeus pronta. Inicie com: npm start (ou pm2)');
