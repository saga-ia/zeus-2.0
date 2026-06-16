const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { config } = require('../config');
const logger = require('../logger');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

logger.info({ dbPath: config.dbPath }, 'SQLite opened (WAL)');

function close() {
  try {
    db.close();
  } catch (e) {
    logger.warn({ err: e }, 'error closing db');
  }
}

module.exports = { db, close };

// Roda migrations aqui (antes de qualquer módulo preparar statements).
// Circular require ok: migrations.js destrutura { db } depois que module.exports já foi atribuído acima.
require('./migrations').run();
