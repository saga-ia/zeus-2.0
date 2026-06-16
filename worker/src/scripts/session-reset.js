// Drops LocalAuth data so next start requires QR pairing again.
const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');
const logger = require('../logger');

const target = path.join(config.authPath);
if (!fs.existsSync(target)) {
  logger.info({ target }, 'nothing to do');
  process.exit(0);
}
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
logger.info({ target }, 'session reset — next start will ask for QR');
