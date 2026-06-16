const { db } = require('../db');
const logger = require('../logger');

const r = db.prepare(`UPDATE send_queue SET status='error', error='flushed_via_cli' WHERE status='pending'`).run();
logger.info({ updated: r.changes }, 'queue flushed');
