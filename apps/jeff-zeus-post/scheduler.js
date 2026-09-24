// Scheduler compartilhado entre worker.js (processo dedicado) e server.js
// (fallback embutido). Correção da falha "agendamento só dispara no Debug":
// o processamento dependia exclusivamente do processo worker — se ele não
// estivesse rodando (deploy só com `npm start`, crash, PM2 sem o segundo app),
// NADA era publicado. Agora:
//   - o worker grava um heartbeat no banco a cada tick;
//   - o server roda o MESMO tick embutido, mas só assume quando o heartbeat
//     está velho (>150s), ou seja, quando o worker dedicado não existe/morreu.
// Resultado: os agendamentos disparam sozinhos em qualquer cenário de deploy,
// sem processamento duplicado quando os dois processos estão de pé.
const cron = require('node-cron');
const { getDb } = require('./db');
const { publishPost } = require('./publisher');
const bulkProcessor = require('./lib/bulk');
const analytics = require('./lib/analytics');
const { refreshExpiringMetaTokens } = require('./lib/tokens');

const HEARTBEAT_KEY = 'worker_heartbeat';
const HEARTBEAT_STALE_SEC = 150; // 2 ticks e meia de tolerância

function writeHeartbeat() {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(HEARTBEAT_KEY, String(Math.floor(Date.now() / 1000)));
}

function heartbeatAgeSec() {
  const v = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(HEARTBEAT_KEY)?.value;
  if (!v) return Infinity;
  return Math.floor(Date.now() / 1000) - parseInt(v, 10);
}

function dedicatedWorkerAlive() {
  return heartbeatAgeSec() < HEARTBEAT_STALE_SEC;
}

// Um tick do scheduler: posts agendados vencidos + itens de campanha bulk.
async function runTick() {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // catch-up: qualquer post scheduled com scheduled_at <= now é elegível
  const duePosts = db.prepare(`SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 50`)
    .all(now);

  if (duePosts.length > 0) {
    console.log(`[scheduler] ${duePosts.length} post(s) agendado(s) pra publicar`);
    for (const post of duePosts) {
      post.platforms = JSON.parse(post.platforms || '[]');
      post.account_ids = JSON.parse(post.account_ids || '[]');
      try {
        const results = await publishPost(post, db);
        console.log(`[scheduler] post ${post.id} processado:`, results.map(r => `${r.platform}:${r.status}`).join(', '));
      } catch (err) {
        console.error(`[scheduler] erro no post ${post.id}:`, err.message);
      }
    }
  }

  try {
    const bulkResult = await bulkProcessor.processDueItems(20);
    if (bulkResult.processed > 0) {
      console.log(`[scheduler] bulk: ${bulkResult.processed} item(s) processado(s)`);
    }
  } catch (err) {
    console.error('[scheduler] erro no bulk processor:', err.message);
  }
}

async function runAnalytics() {
  try {
    const r = await analytics.collectPostAnalytics({});
    if (r.collected > 0) console.log(`[scheduler] analytics coletado: ${r.collected}/${r.total} (falhas: ${r.failed})`);
  } catch (err) {
    console.error('[scheduler] erro na coleta de analytics:', err.message);
  }
}

// role: 'worker' (processo dedicado, sempre executa) ou
//       'server' (embutido, só executa se o worker dedicado estiver morto)
function start(role = 'worker') {
  const isWorker = role === 'worker';

  if (isWorker) {
    // recovery no boot: itens presos em 'processing' voltam pra 'pending'
    try { bulkProcessor.recoverStuckItems(); } catch (e) { console.error('[scheduler] recovery falhou:', e.message); }
    writeHeartbeat();
  }

  let busy = false;
  let warnedTakeover = false;

  // tick principal: a cada minuto
  cron.schedule('* * * * *', async () => {
    if (isWorker) writeHeartbeat();
    else if (dedicatedWorkerAlive()) { warnedTakeover = false; return; }

    if (!isWorker && !warnedTakeover) {
      console.warn('[scheduler] worker dedicado inativo — scheduler embutido no server assumiu o processamento');
      warnedTakeover = true;
    }
    if (busy) return;
    busy = true;
    try {
      await runTick();
    } catch (err) {
      console.error('[scheduler] tick falhou:', err.message);
    } finally {
      busy = false;
    }
  });

  // analytics: a cada 30 min
  cron.schedule('*/30 * * * *', async () => {
    if (!isWorker && dedicatedWorkerAlive()) return;
    await runAnalytics();
  });

  // renovação de tokens Meta perto de expirar: diária, 03:15
  cron.schedule('15 3 * * *', async () => {
    if (!isWorker && dedicatedWorkerAlive()) return;
    try {
      const r = await refreshExpiringMetaTokens();
      if (r.refreshed || r.expiring) console.log(`[scheduler] tokens Meta: ${r.refreshed} renovado(s), ${r.expiring} exigem reautorização`);
    } catch (err) {
      console.error('[scheduler] refresh de tokens falhou:', err.message);
    }
  });

  console.log(`[scheduler] ativo (modo ${isWorker ? 'worker dedicado' : 'embutido no server, com guarda de heartbeat'})`);
}

module.exports = { start, runTick, runAnalytics, heartbeatAgeSec, dedicatedWorkerAlive, HEARTBEAT_STALE_SEC };
