require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../lib/db');
const log = require('../lib/logger');
const { createClient } = require('./wa-client');
const notifier = require('./notifier');

const POLL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '3000', 10);

const activeClients = new Map(); // device_id -> client

const listDevices = db.prepare(`
  SELECT d.*, t.id as tenant_id FROM devices d
   JOIN tenants t ON t.id = d.tenant_id
   WHERE t.ativo = 1
     AND d.status IN ('initializing','qr','authenticated','ready')
`);

const markInitializing = db.prepare(`
  UPDATE devices SET status='initializing' WHERE id=? AND status='disconnected'
`);

function tick() {
  let rows;
  try { rows = listDevices.all(); }
  catch (e) { log.error('worker', 'listDevices falhou', e.message); return; }

  const seenIds = new Set();
  for (const d of rows) {
    seenIds.add(d.id);
    if (!activeClients.has(d.id)) {
      log.info('worker', `iniciando cliente device=${d.id} (${d.apelido}) tenant=${d.tenant_id}`);
      const client = createClient(d);
      activeClients.set(d.id, client);
    }
  }

  // remove clientes de devices que sumiram da lista (deletados ou desativados)
  for (const id of activeClients.keys()) {
    if (!seenIds.has(id)) {
      const c = activeClients.get(id);
      try { c.destroy(); } catch (_) {}
      activeClients.delete(id);
      log.info('worker', `cliente removido device=${id}`);
    }
  }
}

log.info('worker', `Zeus Analytics worker iniciado. DB=${db.DB_PATH} poll=${POLL_MS}ms`);
tick();
setInterval(tick, POLL_MS);
notifier.start(activeClients);

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
async function shutdown() {
  log.info('worker', 'shutdown — destruindo clientes');
  for (const c of activeClients.values()) {
    try { await c.destroy(); } catch (_) {}
  }
  process.exit(0);
}
