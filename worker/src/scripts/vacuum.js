const { db } = require('../db');
const logger = require('../logger');

const t0 = Date.now();
db.exec('VACUUM');
db.exec('ANALYZE');
logger.info({ ms: Date.now() - t0 }, 'SQLite VACUUM + ANALYZE OK');
