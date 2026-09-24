const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.ANALYTICS_DB
  || path.join(__dirname, '..', 'data', 'analytics.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

module.exports = db;
module.exports.DB_PATH = DB_PATH;
