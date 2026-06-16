const pino = require('pino');
const { config } = require('./config');

const isDev = config.env !== 'production';

const logger = pino({
  level: config.logLevel,
  base: { service: 'whatsapp-worker' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: false, translateTime: 'SYS:HH:MM:ss' },
        },
      }
    : {}),
});

module.exports = logger;
