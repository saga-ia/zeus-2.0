const { config, validate } = require('./config');
const logger = require('./logger');
// Migrations rodam automaticamente ao carregar ./db (ver src/db/index.js).
require('./db');
const { createWAManager } = require('./wa/client');
const { createQueue } = require('./queue/send-queue');
const { createOutbound } = require('./webhooks/outbound');
const { buildApp } = require('./server');

async function main() {
  validate();

  const outbound = createOutbound();

  const wa = createWAManager({
    onMessage: (event, msg, record) => {
      outbound.emit(event, { message: record, raw: summary(msg) });
    },
    onStateChange: (state) => {
      outbound.emit('status.changed', {
        state: state.current,
        since: state.since,
        meNumber: state.meNumber,
        meName: state.meName,
      });
    },
  });

  const queue = createQueue({ wa });
  wa.setQueue(queue);

  const app = buildApp({ wa, queue });
  const server = app.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port, env: config.env }, 'HTTP listening');
    if (process.send) process.send('ready');
  });

  outbound.start();
  queue.start();
  wa.init().catch((err) => logger.error({ err }, 'wa init failed'));

  try {
    require('./agent/mchat_poller').start();
  } catch (err) {
    logger.error({ err: String(err) }, 'mchat poller failed to start');
  }

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn({ signal }, 'shutdown begin');
    const t = setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, 14000);
    t.unref?.();
    try {
      outbound.stop();
      queue.stop();
      await new Promise((resolve) => server.close(resolve));
      await wa.shutdown();
      require('./db').close();
    } catch (err) {
      logger.error({ err }, 'shutdown error');
    } finally {
      clearTimeout(t);
      process.exit(0);
    }
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
  process.on('uncaughtException', (err) => logger.error({ err }, 'uncaughtException'));
}

function summary(msg) {
  return {
    id: msg?.id?._serialized,
    from: msg?.from,
    to: msg?.to,
    type: msg?.type,
    body: typeof msg?.body === 'string' ? msg.body.slice(0, 500) : null,
    fromMe: !!msg?.fromMe,
    hasMedia: !!msg?.hasMedia,
    timestamp: msg?.timestamp ? new Date(msg.timestamp * 1000).toISOString() : null,
  };
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
