#!/usr/bin/env node
// myig dispatcher — lê eventos NOVOS do IG webhook (armazenados em
// /opt/jeff-worker/data/worker.db pelo pipeline oficial jeff-instagram-webhook)
// e responde via agente de IA configurado no zeuschatig.db.
//
// - Fonte de eventos: worker.db.ig_webhook_events (mesma tabela que o
//   dispatcher bash legado, que está pausado no cron)
// - Estado da conversa: zeuschatig.db (agents, threads, messages, runs)
// - Envio de DM: /opt/jeff-worker/scripts/instagram.sh dm-send (IGAA API)
//
// Roda como daemon PM2. Poll 2s. Fail-safe: exit=124 = timeout, marca run;
// erros de rede na IG API retentam evento no próximo tick.

const { spawn, spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { db } = require('./db');

const WORKER_DB_PATH = process.env.WORKER_DB || '/opt/jeff-worker/data/worker.db';
const CLAUDE_BIN = '/root/.nvm/versions/node/v20.20.2/bin/claude';
const IG_SEND_SCRIPT = '/opt/jeff-worker/scripts/instagram.sh';
const POLL_MS = 2000;
const MAX_STDOUT_LEN = 200 * 1024;
const HISTORY_LIMIT = 20;
const BATCH = 3;
// Janela de agregação: se o mesmo sender mandou várias msgs, espera N segundos
// sem novas msgs antes de processar o bloco todo de uma vez. Evita responder
// separado quando o lead digita "oi" e logo depois "quem é vc?".
const AGGREGATE_WINDOW_SEC = parseInt(process.env.AGGREGATE_WINDOW_SEC || '15', 10);

// Abre worker.db em modo leitura+escrita (precisamos marcar processed_at)
const workerDb = new Database(WORKER_DB_PATH);
workerDb.pragma('journal_mode = WAL');

// -------------- base de conhecimento (RAG) --------------
// A Central guarda qual parte da Biblioteca cada agente usa e faz a busca; aqui só pedimos os trechos da mensagem.
// Sem resposta em 6 s (ou Central fora), o agente responde sem a base, como antes.
const http = require('http');
const fs = require('fs');
const RAG_TOKEN_FILE = process.env.CENTRAL_RAG_TOKEN_FILE || '/opt/jeff-apps/jeff-central/data/.ig-rag-token';
function buscarBase(agentId, texto) {
  return new Promise((resolve) => {
    let token = '';
    try { token = fs.readFileSync(RAG_TOKEN_FILE, 'utf8').trim(); } catch (_) { return resolve(''); }
    const corpo = Buffer.from(JSON.stringify({ agent_id: agentId, texto: String(texto || '').slice(0, 2000) }));
    const req = http.request({ host: '127.0.0.1', port: parseInt(process.env.CENTRAL_PORT || '3031', 10), method: 'POST', path: '/api/interno/ig-rag',
      headers: { 'content-type': 'application/json', 'content-length': corpo.length, 'x-rag-token': token }, timeout: 6000 }, (r) => {
      let t = ''; r.on('data', c => { t += c; });
      r.on('end', () => { try { const j = JSON.parse(t); resolve(j && j.ok ? (j.texto || '') : ''); } catch (_) { resolve(''); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(''));
    req.end(corpo);
  });
}

// -------------- helpers --------------

function getTenantForIgUserId(igUserId) {
  // Tenta bater com ig_user_id; senão pega o único tenant ativo (single-tenant Jeff)
  if (igUserId) {
    const t = db.prepare('SELECT * FROM tenants WHERE ig_user_id=?').get(igUserId);
    if (t) return t;
  }
  return db.prepare("SELECT * FROM tenants WHERE status='active' ORDER BY id LIMIT 1").get();
}

function upsertContact(tenantId, senderId) {
  const existing = db.prepare('SELECT id FROM contacts WHERE tenant_id=? AND ig_sender_id=?').get(tenantId, senderId);
  if (existing) {
    db.prepare("UPDATE contacts SET last_seen_at=datetime('now') WHERE id=?").run(existing.id);
    return existing.id;
  }
  const info = db.prepare('INSERT INTO contacts(tenant_id, ig_sender_id) VALUES(?,?)').run(tenantId, senderId);
  return info.lastInsertRowid;
}

function upsertThread(tenantId, contactId) {
  const existing = db.prepare('SELECT id, current_agent_id, paused FROM ig_threads WHERE tenant_id=? AND contact_id=?').get(tenantId, contactId);
  if (existing) return existing;
  const info = db.prepare(`INSERT INTO ig_threads(tenant_id, contact_id, last_message_at)
                           VALUES(?,?,datetime('now'))`).run(tenantId, contactId);
  return { id: info.lastInsertRowid, current_agent_id: null, paused: 0 };
}

function resolveAgent(tenantId, thread, messageText) {
  if (thread.current_agent_id) {
    const stuck = db.prepare('SELECT * FROM agents WHERE id=? AND active=1').get(thread.current_agent_id);
    if (stuck) return stuck;
  }
  const rules = db.prepare(`
    SELECT r.rule_type, r.rule_value, r.priority,
           a.id AS agent_id, a.tenant_id AS a_tenant, a.name, a.avatar_emoji, a.color,
           a.system_prompt, a.model, a.temperature, a.max_turns, a.timeout_seconds, a.active
    FROM agent_routing_rules r
    JOIN agents a ON a.id = r.agent_id AND a.active=1
    WHERE r.tenant_id=? AND r.active=1
    ORDER BY r.priority DESC, r.id ASC
  `).all(tenantId);
  const txt = (messageText || '').toLowerCase();
  let fallback = null;
  for (const r of rules) {
    if (r.rule_type === 'default') { fallback = r; continue; }
    if (r.rule_type === 'keyword' && r.rule_value) {
      const kws = r.rule_value.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      if (kws.some(k => txt.includes(k))) return { ...r, id: r.agent_id };
    }
  }
  if (fallback) return { ...fallback, id: fallback.agent_id };
  return db.prepare('SELECT * FROM agents WHERE tenant_id=? AND active=1 ORDER BY id LIMIT 1').get(tenantId);
}

function getHistory(contactId, limit = HISTORY_LIMIT) {
  const rows = db.prepare('SELECT direction, text FROM messages WHERE contact_id=? ORDER BY id DESC LIMIT ?').all(contactId, limit);
  return rows.reverse();
}

function runClaude(agent, userText, history, threadCtx, base) {
  return new Promise((resolve) => {
    const model = agent.model || 'claude-opus-4-7';
    const systemNotes = [
      `Você está respondendo uma DM do Instagram.`,
      `Usuário: ${threadCtx.username ? '@' + threadCtx.username : 'ID ' + threadCtx.senderId}`,
      `Responda em português direto, curto e adequado ao formato de DM.`,
      `Sem travessão, sem markdown, sem aspas. Retorne APENAS o texto da resposta.`,
    ].join('\n');
    const persona = (agent.system_prompt || '').trim();
    const convo = history.map(m => `[${m.direction === 'in' ? 'usuário' : 'você'}]: ${m.text || ''}`).join('\n');
    const prompt = [
      persona ? persona + '\n\n' : '',
      systemNotes,
      base ? `\n\n${base}\nUse esses trechos como fonte para responder quando forem relevantes. Se a resposta não estiver neles, não invente: diga que vai confirmar a informação.` : '',
      convo ? `\n\nHistórico recente da conversa:\n${convo}` : '',
      `\n\nNova mensagem do usuário: ${userText}`,
      `\n\nSua resposta:`,
    ].join('');

    // Sem ferramenta nenhuma: o texto da DM vem de qualquer pessoa e as permissões globais do servidor liberam Bash/Write/WebFetch
    const args = ['-p', prompt, '--model', model, '--strict-mcp-config', '--tools', '', '--output-format', 'text'];
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn(CLAUDE_BIN, args, {
      env: { ...process.env, ANTHROPIC_LOG: 'silent' },
      cwd: '/tmp',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (b) => {
      if (stdout.length < MAX_STDOUT_LEN) stdout += b.toString();
    });
    proc.stderr.on('data', (b) => { stderr += b.toString(); });

    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill('SIGKILL'); } catch {}
    }, (agent.timeout_seconds || 120) * 1000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: killed ? 124 : code,
        output: stdout.trim(),
        stdout, stderr,
        durationMs: Date.now() - started,
      });
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, output: '', stdout: '', stderr: err.message, durationMs: Date.now() - started });
    });
  });
}

function sendDM(senderId, text) {
  const r = spawnSync('bash', [IG_SEND_SCRIPT, 'dm-send', senderId, text], {
    encoding: 'utf8', timeout: 15000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  let ok = false, messageId = null, body = null;
  try {
    body = JSON.parse(r.stdout || '{}');
    if (body.message_id) { ok = true; messageId = body.message_id; }
  } catch {}
  return { ok, messageId, body, raw: out };
}

// -------------- core --------------

// Marca todos os eventos do bloco com processed_at final + response
function finalizeBatch(events, opts) {
  const ids = events.map(e => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const set = opts.responseText
    ? `processed_at=datetime('now'), response_text=?`
    : `processed_at=datetime('now'), response_error=?`;
  const val = opts.responseText || opts.responseError;
  workerDb.prepare(`UPDATE ig_webhook_events SET ${set} WHERE id IN (${placeholders})`).run(val, ...ids);
}

async function processBatch(events) {
  const first = events[0];
  const senderId = first.sender_id;
  const igUserId = first.ig_user_id;
  const messageBlock = events.map(e => e.message_text).join('\n');

  const tenant = getTenantForIgUserId(igUserId);
  if (!tenant) {
    finalizeBatch(events, { responseError: 'no-active-tenant' });
    return { skipped: 'no-tenant', count: events.length };
  }

  // Ignora echos (própria conta como sender)
  if (senderId === tenant.ig_user_id || senderId === igUserId) {
    finalizeBatch(events, { responseError: 'self-echo' });
    return { skipped: 'echo', count: events.length };
  }

  const contactId = upsertContact(tenant.id, senderId);
  const thread = upsertThread(tenant.id, contactId);

  // Grava cada mensagem individualmente no histórico (preservando ordem real)
  const insertMsg = db.prepare(`INSERT INTO messages(tenant_id, contact_id, direction, text, ig_message_id, raw_json, sent_by)
                                VALUES(?,?,?,?,?,?,?)`);
  for (const ev of events) {
    insertMsg.run(tenant.id, contactId, 'in', ev.message_text, null, ev.raw_json, 'user');
  }
  db.prepare(`UPDATE ig_threads SET last_message_at=datetime('now'), last_direction='in',
              unread_count=unread_count+? WHERE id=?`).run(events.length, thread.id);

  if (thread.paused) {
    finalizeBatch(events, { responseError: 'thread-paused' });
    return { skipped: 'paused', count: events.length };
  }

  const agent = resolveAgent(tenant.id, thread, messageBlock);
  if (!agent) {
    finalizeBatch(events, { responseError: 'no-agent' });
    return { skipped: 'no-agent', count: events.length };
  }

  // Nota: webhook_event_id fica NULL porque os eventos vêm do worker.db
  // (ig_webhook_events) e a FK do agent_runs aponta pro zeuschatig.db (webhook_events).
  const runInfo = db.prepare(`INSERT INTO agent_runs(tenant_id, thread_id, contact_id, agent_id, status, input_text, model)
                              VALUES(?,?,?,?,?,?,?)`).run(
    tenant.id, thread.id, contactId, agent.id, 'running', messageBlock, agent.model
  );
  const runId = runInfo.lastInsertRowid;
  db.prepare('UPDATE ig_threads SET current_agent_id=? WHERE id=?').run(agent.id, thread.id);

  // Histórico exclui as msgs que acabamos de gravar (elas viraram o input)
  const history = getHistory(contactId, HISTORY_LIMIT + events.length).slice(0, -events.length);
  const contact = db.prepare('SELECT ig_username FROM contacts WHERE id=?').get(contactId);

  // RAG: trechos da base de conhecimento do agente para esta mensagem (com as 2 últimas do usuário de contexto)
  const consulta = history.filter(m => m.direction === 'in').slice(-2).map(m => m.text || '').concat(messageBlock).join('\n');
  const base = await buscarBase(agent.id, consulta);
  if (base) console.log(`[dispatcher] agente ${agent.id}: base de conhecimento com ${(base.match(/^--- \[/gm) || []).length} trecho(s)`);
  const result = await runClaude(agent, messageBlock, history, {
    username: contact?.ig_username, senderId,
  }, base);

  const status = result.code === 0 ? 'done' : (result.code === 124 ? 'timeout' : 'error');
  db.prepare(`UPDATE agent_runs SET status=?, output_text=?, stdout=?, stderr=?, duration_ms=?, finished_at=datetime('now') WHERE id=?`)
    .run(status, result.output, result.stdout.slice(0, MAX_STDOUT_LEN), (result.stderr || '').slice(0, 10000), result.durationMs, runId);

  if (status === 'done' && result.output) {
    const send = sendDM(senderId, result.output);
    if (send.ok) {
      db.prepare(`INSERT INTO messages(tenant_id, contact_id, direction, text, ig_message_id, sent_by, raw_json)
                  VALUES(?,?,?,?,?,?,?)`).run(
        tenant.id, contactId, 'out', result.output, send.messageId, 'agent:' + agent.id, JSON.stringify(send.body)
      );
      db.prepare(`UPDATE ig_threads SET last_message_at=datetime('now'), last_direction='out', unread_count=0 WHERE id=?`).run(thread.id);
      finalizeBatch(events, { responseText: result.output });
      return { runId, status: 'done', sent: true, count: events.length };
    }
    db.prepare(`UPDATE agent_runs SET status='error', stderr=COALESCE(stderr,'')||? WHERE id=?`)
      .run(`\n[send failed] ${send.raw.slice(0,500)}`, runId);
    finalizeBatch(events, { responseError: 'send_failed: ' + send.raw.slice(0,300) });
    return { runId, status: 'error', sent: false, count: events.length };
  }

  finalizeBatch(events, { responseError: 'claude_' + status });
  return { runId, status, count: events.length };
}

async function tick() {
  // Agrupa por sender: só processa senders cujo evento MAIS RECENTE
  // já tem >= AGGREGATE_WINDOW_SEC de idade (janela silenciosa fechada).
  const senders = workerDb.prepare(`
    SELECT sender_id, ig_user_id,
           MIN(id) AS first_id, MAX(id) AS last_id,
           MAX(received_at) AS last_at, COUNT(*) AS n
    FROM ig_webhook_events
    WHERE event_type='message'
      AND processed_at IS NULL
      AND sender_id IS NOT NULL
      AND message_text IS NOT NULL
    GROUP BY sender_id, ig_user_id
    HAVING datetime(last_at) <= datetime('now', ?)
    ORDER BY first_id ASC
    LIMIT ?
  `).all(`-${AGGREGATE_WINDOW_SEC} seconds`, BATCH);

  for (const s of senders) {
    // Pega TODOS os eventos pending desse sender (o bloco)
    const events = workerDb.prepare(`
      SELECT id, ig_user_id, sender_id, message_text, raw_json, received_at
      FROM ig_webhook_events
      WHERE event_type='message'
        AND processed_at IS NULL
        AND sender_id=?
        AND (ig_user_id=? OR (? IS NULL AND ig_user_id IS NULL))
        AND message_text IS NOT NULL
      ORDER BY id ASC
    `).all(s.sender_id, s.ig_user_id, s.ig_user_id);
    if (!events.length) continue;

    // Reserva todos de uma vez (race-safe)
    const ids = events.map(e => e.id);
    const placeholders = ids.map(() => '?').join(',');
    const upd = workerDb.prepare(`UPDATE ig_webhook_events SET processed_at='pending'
                                   WHERE id IN (${placeholders}) AND processed_at IS NULL`).run(...ids);
    if (upd.changes === 0) continue;

    try {
      const r = await processBatch(events);
      console.log(`[dispatcher] sender=${s.sender_id.slice(0,10)} block=[${ids.join(',')}] =>`, r);
    } catch (e) {
      console.error(`[dispatcher] erro sender=${s.sender_id}:`, e.message);
      finalizeBatch(events, { responseError: 'exception: ' + e.message });
    }
  }
}

// Fluxos de conversa (src/flows.js) rodam antes dos agentes: o evento que um fluxo pega já sai processado
const flows = require('./flows');
flows.init(workerDb);
// Ecos (o que a conta manda pelo app do Instagram) e mídias recebidas entram no histórico do Direct (src/ecos.js)
const ecos = require('./ecos');
ecos.init(workerDb);

async function loop() {
  console.log(`[dispatcher] started (worker=${WORKER_DB_PATH}, aggregate=${AGGREGATE_WINDOW_SEC}s)`);
  while (true) {
    try { ecos.tick({ getTenantForIgUserId, upsertContact, upsertThread }); } catch (e) { console.error('[dispatcher] ecos error:', e.message); }
    try { await flows.tick({ getTenantForIgUserId, upsertContact, upsertThread }); } catch (e) { console.error('[dispatcher] flows error:', e.message); }
    try { await tick(); } catch (e) { console.error('[dispatcher] tick error:', e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

if (require.main === module) {
  loop();
}

module.exports = { processBatch, tick, resolveAgent, getTenantForIgUserId, upsertContact, upsertThread };
