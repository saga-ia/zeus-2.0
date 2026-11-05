// Gera (ou troca) a senha do /admin: grava só o hash scrypt em data/config.json e mostra a senha uma vez.
// Uso: node setup.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
const senha = crypto.randomBytes(12).toString('base64url');
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(senha, salt, 64);
fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify({ salt: salt.toString('hex'), hash: hash.toString('hex') }, null, 2), { mode: 0o600 });
console.log('Senha do admin: ' + senha);
