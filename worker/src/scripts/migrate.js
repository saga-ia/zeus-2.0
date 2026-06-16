const { run } = require('../db/migrations');
const logger = require('../logger');

try {
  run();
  logger.info('Migrations OK');
  process.exit(0);
} catch (err) {
  logger.error({ err }, 'migration failed');
  process.exit(1);
}
