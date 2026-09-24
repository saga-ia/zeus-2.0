const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.ZC_DB || '/opt/jeff-apps/zeuschatig/data/zeuschatig.db';
const SCHEMA = path.join(__dirname, 'schema.sql');

const isNew = !fs.existsSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(SCHEMA, 'utf8'));

if (isNew) {
  console.log('[db] schema applied to new DB', DB_PATH);
}

const getConfig = (k) => {
  const r = db.prepare('SELECT value FROM app_config WHERE key=?').get(k);
  return r ? r.value : null;
};
const setConfig = (k, v) => {
  db.prepare(`INSERT INTO app_config(key,value) VALUES(?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`).run(k, v);
};

module.exports = { db, getConfig, setConfig };
