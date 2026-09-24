// Roda dentro do worker. Pega alertas nao enviados e dispara WhatsApp pro gerente
// usando o proprio cliente whatsapp-web.js do tenant.
const db = require('../lib/db');
const log = require('../lib/logger');

const NOTIFIER_INTERVAL = 10000;

const pendentes = db.prepare(`
  SELECT a.id, a.tenant_id, a.tipo, a.severidade, a.titulo, a.payload_json,
         t.gerente_phone,
         (SELECT d.id FROM devices d
           WHERE d.tenant_id=t.id AND d.status='ready'
           ORDER BY d.id ASC LIMIT 1) AS device_id
    FROM alertas a
    JOIN tenants t ON t.id = a.tenant_id
   WHERE a.enviado_em IS NULL AND t.ativo=1
   ORDER BY a.criado_em ASC LIMIT 20
`);
const marcarEnviado = db.prepare(`UPDATE alertas SET enviado_em=datetime('now') WHERE id=?`);

function emojiSev(s) {
  return s === 'critico' ? '🚨' : s === 'warn' ? '⚠️' : 'ℹ️';
}

function montarTexto(a) {
  let extra = '';
  try {
    const p = JSON.parse(a.payload_json || '{}');
    if (p.resumo) extra = `\n\n${p.resumo}`;
  } catch (_) {}
  return `${emojiSev(a.severidade)} Zeus Analytics\n\n${a.titulo}${extra}`;
}

async function poll(activeClients) {
  const rows = pendentes.all();
  for (const a of rows) {
    if (!a.gerente_phone) { marcarEnviado.run(a.id); continue; }
    if (!a.device_id) { continue; } // ainda sem device pronto, deixa pra proxima
    const client = activeClients.get(a.device_id);
    if (!client) continue;
    try {
      const jid = `${String(a.gerente_phone).replace(/\D/g,'')}@c.us`;
      await client.sendMessage(jid, montarTexto(a));
      marcarEnviado.run(a.id);
      log.info('notifier', `alerta ${a.id} enviado pra ${a.gerente_phone}`);
    } catch (e) {
      log.warn('notifier', `falha enviar alerta ${a.id}`, e.message);
    }
  }
}

function start(activeClients) {
  log.info('notifier', 'notifier ativo dentro do worker');
  setInterval(() => { poll(activeClients).catch(()=>{}); }, NOTIFIER_INTERVAL);
}

module.exports = { start };
