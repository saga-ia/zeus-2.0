#!/usr/bin/env node
// Cria admin inicial + config default de app IG.
// Uso: node scripts/seed-admin.js <email> <password>
const { db, setConfig, getConfig } = require('../src/db');
const auth = require('../src/auth');

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error('uso: node scripts/seed-admin.js <email> <password>');
  process.exit(1);
}

// Copia credenciais Meta do worker.db
const Database = require('better-sqlite3');
const worker = new Database('/opt/jeff-worker/data/worker.db', { readonly: true });
const get = (k) => worker.prepare('SELECT value FROM app_settings WHERE key=?').get(k)?.value;

const igAppId = get('jeff_meta_app_id_ig');
const igAppSecret = get('jeff_meta_app_secret_ig');
const igVerifyToken = get('jeff_meta_ig_webhook_verify_token');

if (!getConfig('ig_app_id')) setConfig('ig_app_id', igAppId);
if (!getConfig('ig_app_secret')) setConfig('ig_app_secret', igAppSecret);
if (!getConfig('ig_webhook_verify_token') && igVerifyToken) setConfig('ig_webhook_verify_token', igVerifyToken);
if (!getConfig('ig_oauth_redirect_uri')) setConfig('ig_oauth_redirect_uri', 'https://zeuschatig.jefersonhenrike.com/oauth/callback');

// Cria admin
const existing = db.prepare('SELECT id FROM admin_users WHERE email=?').get(email);
if (existing) {
  db.prepare('UPDATE admin_users SET password_hash=? WHERE email=?').run(auth.hash(password), email);
  console.log(`admin ${email} atualizado (senha resetada)`);
} else {
  db.prepare('INSERT INTO admin_users(email, password_hash, role) VALUES(?,?,?)').run(email, auth.hash(password), 'admin');
  console.log(`admin ${email} criado`);
}

console.log('\nConfigs:');
['ig_app_id','ig_app_secret','ig_oauth_redirect_uri','ig_webhook_verify_token'].forEach(k => {
  const v = getConfig(k);
  console.log(`  ${k} = ${v ? v.substring(0,40) + (v.length>40?'...':'') : '(vazio)'}`);
});
