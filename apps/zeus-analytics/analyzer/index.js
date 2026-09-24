require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../lib/db');
const log = require('../lib/logger');
const { processarBatch, fecharInativas } = require('./conversas');
const { triarMensagem } = require('./triagem');
const { gerarScorecard } = require('./scorecard');

const INTERVAL = parseInt(process.env.ANALYZER_INTERVAL_MS || '15000', 10);
const BATCH = parseInt(process.env.ANALYZER_BATCH_SIZE || '10', 10);

const pickJobs = db.prepare(`
  SELECT id, tipo, ref_id, tenant_id FROM analyzer_queue
   WHERE status='pending'
   ORDER BY prioridade ASC, id ASC
   LIMIT ?
`);
const markProcessing = db.prepare(`UPDATE analyzer_queue SET status='processing', tentativas=tentativas+1 WHERE id=?`);
const markDone = db.prepare(`UPDATE analyzer_queue SET status='done', processado_em=datetime('now') WHERE id=?`);
const markFailed = db.prepare(`UPDATE analyzer_queue SET status=?, erro=? WHERE id=?`);

async function runJob(j) {
  try {
    markProcessing.run(j.id);
    let r;
    if (j.tipo === 'triagem_msg')        r = await triarMensagem(j.ref_id);
    else if (j.tipo === 'scorecard_conversa') r = await gerarScorecard(j.ref_id);
    else                                  r = { ok: false, error: 'tipo desconhecido' };

    if (r.ok) markDone.run(j.id);
    else {
      const t = db.prepare('SELECT tentativas FROM analyzer_queue WHERE id=?').get(j.id);
      const status = (t.tentativas >= 3) ? 'failed' : 'pending';
      markFailed.run(status, String(r.error || 'erro'), j.id);
      log.warn('analyzer', `job ${j.id} (${j.tipo} ref=${j.ref_id}) erro=${r.error} status=${status}`);
    }
  } catch (e) {
    markFailed.run('pending', e.message, j.id);
    log.error('analyzer', `excecao job ${j.id}`, e.message);
  }
}

async function tick() {
  try {
    const n = processarBatch();
    if (n) log.info('analyzer', `${n} msg(s) agrupadas em conversa`);
    fecharInativas();

    const jobs = pickJobs.all(BATCH);
    if (jobs.length === 0) return;
    log.info('analyzer', `processando ${jobs.length} job(s)`);
    for (const j of jobs) await runJob(j);
  } catch (e) {
    log.error('analyzer', 'tick erro', e.message);
  }
}

log.info('analyzer', `Zeus Analytics analyzer iniciado. interval=${INTERVAL}ms batch=${BATCH}`);
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try { await tick(); } finally { running = false; }
}, INTERVAL);
tick();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
