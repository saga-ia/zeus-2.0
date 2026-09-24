// Equipes de agentes: um orquestrador planeja, distribui tarefas entre os agentes da equipe
// (em etapas, paralelas dentro da mesma etapa) e consolida tudo numa entrega final.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const agents = require('./agents');
const claudeSpawn = require('./claude-spawn');
const zeusContext = require('./zeus-context');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const WORKDIR_ROOT = path.join(DATA_DIR, 'team-workdir');
const DB_PATH = path.join(DATA_DIR, 'central.db');
const CLAUDE_BIN = claudeSpawn.CLAUDE_BIN;
const STEP_TIMEOUT_MS = parseInt(process.env.TEAM_STEP_TIMEOUT_MS || String(10 * 60 * 1000), 10);
const MIN_AGENTS = 2;
const MAX_AGENTS = 8;
const MODELS = ['', 'opus', 'sonnet', 'haiku'];
// Quanto de cada entrega segue adiante (pra próxima etapa e pra consolidação)
const HANDOFF_CHARS = 12000;
// Planejador e consolidador só pensam e escrevem: nada de mexer no servidor
const NO_TOOLS = ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent'];

if (!fs.existsSync(WORKDIR_ROOT)) fs.mkdirSync(WORKDIR_ROOT, { recursive: true });

// Mesmo contexto da plataforma que o chat recebe (data/zeus-workdir/CLAUDE.md: telas, agentes, ferramentas do
// servidor, regras). As execuções rodam em team-workdir/<run>/, então o CLAUDE.md entra por link no diretório pai.
function ensurePlatformContext() {
  try {
    zeusContext.ensureContext();
    const link = path.join(WORKDIR_ROOT, 'CLAUDE.md');
    let ok = false;
    try { ok = fs.lstatSync(link).isSymbolicLink() && fs.readlinkSync(link) === zeusContext.CTX_FILE; } catch (_) {}
    if (!ok) { try { fs.rmSync(link, { force: true }); } catch (_) {} fs.symlinkSync(zeusContext.CTX_FILE, link); }
  } catch (e) { console.error('[teams] contexto da plataforma:', e.message); }
}
ensurePlatformContext();

// Trechos da base de conhecimento da empresa relevantes pra tarefa (mesmo RAG do chat). Vazio se não houver resultado.
function knowledgeFor(text) {
  try { return require('./knowledge').retrieve(text, { limit: 6, maxChars: 9000 }); } catch (e) { console.error('[teams] base de conhecimento:', e.message); return ''; }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'privada',
  orchestrator_prompt TEXT,
  agent_ids TEXT NOT NULL DEFAULT '[]',
  icebreakers TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_runs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_runs ON team_runs(team_id, updated_at);
CREATE TABLE IF NOT EXISTS team_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  agent_id TEXT,
  agent_name TEXT,
  stage INTEGER,
  task TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_team_steps ON team_steps(run_id, turn, seq);
`);

const stmt = {
  list: db.prepare(`SELECT t.*,
    (SELECT COUNT(*) FROM team_runs r WHERE r.team_id = t.id) AS run_count,
    (SELECT MAX(updated_at) FROM team_runs r WHERE r.team_id = t.id) AS last_run_at
    FROM teams t ORDER BY t.created_at DESC`),
  get: db.prepare(`SELECT * FROM teams WHERE id = ?`),
  ins: db.prepare(`INSERT INTO teams (id, name, objective, description, visibility, orchestrator_prompt, agent_ids, icebreakers, model, created_at, updated_at)
    VALUES (@id, @name, @objective, @description, @visibility, @orchestrator_prompt, @agent_ids, @icebreakers, @model, @now, @now)`),
  del: db.prepare(`DELETE FROM teams WHERE id = ?`),
  runs: db.prepare(`SELECT * FROM team_runs WHERE team_id = ? ORDER BY updated_at DESC`),
  runGet: db.prepare(`SELECT * FROM team_runs WHERE id = ?`),
  runIns: db.prepare(`INSERT INTO team_runs (id, team_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?)`),
  runStatus: db.prepare(`UPDATE team_runs SET status = ?, updated_at = ? WHERE id = ?`),
  runTitle: db.prepare(`UPDATE team_runs SET title = ? WHERE id = ?`),
  runDel: db.prepare(`DELETE FROM team_runs WHERE id = ?`),
  runIdsOfTeam: db.prepare(`SELECT id FROM team_runs WHERE team_id = ?`),
  steps: db.prepare(`SELECT * FROM team_steps WHERE run_id = ? ORDER BY turn, seq`),
  stepGet: db.prepare(`SELECT * FROM team_steps WHERE id = ?`),
  stepIns: db.prepare(`INSERT INTO team_steps (id, run_id, turn, seq, kind, agent_id, agent_name, stage, task, content, status, created_at)
    VALUES (@id, @run_id, @turn, @seq, @kind, @agent_id, @agent_name, @stage, @task, @content, @status, @now)`),
  stepSet: db.prepare(`UPDATE team_steps SET content = ?, status = ?, finished_at = ? WHERE id = ?`),
  stepStatus: db.prepare(`UPDATE team_steps SET status = ? WHERE id = ?`),
  stepsDel: db.prepare(`DELETE FROM team_steps WHERE run_id = ?`),
  maxTurn: db.prepare(`SELECT COALESCE(MAX(turn), 0) AS t FROM team_steps WHERE run_id = ?`),
};

// Servidor reiniciou no meio de uma execução: nada fica "rodando" pra sempre
db.prepare(`UPDATE team_steps SET status = 'error', content = COALESCE(content, '') || '\n\n[interrompido: o servidor reiniciou durante a execução]', finished_at = ?
  WHERE status IN ('running', 'pending')`).run(Date.now());
db.prepare(`UPDATE team_runs SET status = 'idle' WHERE status = 'running'`).run();

const newId = () => crypto.randomBytes(9).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'equipe';
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '\n[...trecho cortado]' : s; };

function initials(name) {
  const w = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter(x => x && !/^(de|da|do|das|dos|e|para|pra|em|a|o)$/i.test(x));
  return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase();
}

function shape(t) {
  if (!t) return null;
  const ids = parseJSON(t.agent_ids, []);
  return {
    id: t.id,
    name: t.name,
    objective: t.objective || '',
    description: t.description || '',
    visibility: t.visibility === 'empresa' ? 'empresa' : 'privada',
    orchestratorPrompt: t.orchestrator_prompt || '',
    model: t.model || '',
    icebreakers: parseJSON(t.icebreakers, []),
    agentIds: ids,
    agents: ids.map(id => {
      const a = agents.getAgent(id);
      return a ? { id, name: a.name, initials: initials(a.name), category: a.category, kind: a.kind, description: a.description, model: a.model }
        : { id, name: '(agente removido)', initials: '?', missing: true };
    }),
    runCount: t.run_count || 0,
    lastRunAt: t.last_run_at || null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}
function getTeam(id) {
  const t = stmt.get.get(id);
  return t ? shape(t) : null;
}

function cleanInput(b, forCreate) {
  const o = {};
  if (b.name !== undefined) o.name = String(b.name).trim().slice(0, 120);
  if (b.objective !== undefined) o.objective = String(b.objective).trim().slice(0, 1000);
  if (b.description !== undefined) o.description = String(b.description).trim().slice(0, 500);
  if (b.visibility !== undefined) o.visibility = b.visibility === 'empresa' ? 'empresa' : 'privada';
  if (b.orchestratorPrompt !== undefined) o.orchestrator_prompt = String(b.orchestratorPrompt).slice(0, 20000);
  if (b.model !== undefined) o.model = MODELS.includes(b.model) ? b.model : '';
  if (b.icebreakers !== undefined) o.icebreakers = JSON.stringify((Array.isArray(b.icebreakers) ? b.icebreakers : [])
    .map(s => String(s).trim()).filter(Boolean).slice(0, 6));
  if (b.agentIds !== undefined) {
    const ids = [...new Set((Array.isArray(b.agentIds) ? b.agentIds : []).map(String))].filter(id => agents.getAgent(id));
    o.agent_ids = JSON.stringify(ids);
  }
  if (forCreate) {
    o.objective = o.objective || '';
    o.description = o.description || '';
    o.visibility = o.visibility || 'privada';
    o.orchestrator_prompt = o.orchestrator_prompt || '';
    o.model = o.model || '';
    o.icebreakers = o.icebreakers || '[]';
    o.agent_ids = o.agent_ids || '[]';
  }
  return o;
}
function validate(o) {
  if (o.name !== undefined && !o.name) return 'nome obrigatório';
  if (o.agent_ids !== undefined) {
    const n = JSON.parse(o.agent_ids).length;
    if (n < MIN_AGENTS || n > MAX_AGENTS) return `a equipe precisa ter de ${MIN_AGENTS} a ${MAX_AGENTS} agentes (tem ${n})`;
  }
  return null;
}

// ─── Seed: uma equipe de exemplo com Agentes ZEUS de marketing ───────────────
(function seed() {
  if (db.prepare(`SELECT COUNT(*) AS n FROM teams`).get().n) return;
  const ids = ['estrategista-campanhas', 'copywriter-briefings', 'copywriter-crm', 'conteudo-social', 'analista-trafego']
    .filter(id => agents.getAgent(id));
  if (ids.length < MIN_AGENTS) return;
  stmt.ins.run({
    id: 'equipe-marketing', name: 'Equipe de Marketing', now: Date.now(),
    objective: 'Planejar e executar campanhas de aquisição e conteúdo: estratégia, briefing, copy dos canais e plano de mídia.',
    description: 'Estratégia, copy, conteúdo social e tráfego pago trabalhando juntos numa entrega só.',
    visibility: 'empresa', orchestrator_prompt: '', model: '', agent_ids: JSON.stringify(ids),
    icebreakers: JSON.stringify([
      'Monte uma campanha de captação para um evento online gratuito, com estratégia, criativos e régua de WhatsApp',
      'Crie o plano de conteúdo de 2 semanas para o lançamento de um produto novo',
      'Estruture uma campanha de remarketing para quem abandonou o checkout',
      'Planeje uma ação de Black Friday com metas, copy e distribuição por canal',
    ]),
  });
})();

// ─── SSE por execução ────────────────────────────────────────────────────────
const buses = new Map();
function busAdd(rid, res) { if (!buses.has(rid)) buses.set(rid, new Set()); buses.get(rid).add(res); }
function busDel(rid, res) { const b = buses.get(rid); if (b) { b.delete(res); if (!b.size) buses.delete(rid); } }
function emit(rid, ev, data) {
  const b = buses.get(rid);
  if (!b) return;
  const payload = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const r of b) { try { r.write(payload); } catch (_) {} }
}
function stepOut(s) {
  return { id: s.id, turn: s.turn, seq: s.seq, kind: s.kind, agentId: s.agent_id, agentName: s.agent_name,
    stage: s.stage, task: s.task, content: s.content || '', status: s.status, createdAt: s.created_at, finishedAt: s.finished_at };
}
function emitStep(rid, stepId) { const s = stmt.stepGet.get(stepId); if (s) emit(rid, 'step', stepOut(s)); }

// ─── Claude ──────────────────────────────────────────────────────────────────
const active = new Map(); // runId -> { procs:Set, canceled:boolean }

// Roda o claude com o prompt via stdin (entregas longas estouram o limite de argumento) e devolve o texto final.
function runClaude(runId, prompt, opts, onToken) {
  opts = opts || {};
  return new Promise((resolve) => {
    const ctl = active.get(runId);
    if (ctl && ctl.canceled) return resolve({ text: '', canceled: true });
    const workdir = path.join(WORKDIR_ROOT, runId);
    if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });
    const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
    if (opts.system) {
      const spFile = path.join(workdir, `.sistema-${crypto.randomBytes(4).toString('hex')}.md`);
      fs.writeFileSync(spFile, opts.system);
      args.push('--append-system-prompt-file', spFile);
    }
    // Sempre explícito (ver chat.js). Agente da equipe sem modelo marcado usa o padrão dos agentes (Sonnet);
    // planejador e consolidador usam o modelo da equipe ou o do Zeus principal.
    args.push('--model', opts.model || (opts.isAgent ? claudeSpawn.agentDefaultModel() : claudeSpawn.DEFAULT_MODEL));
    args.push(...claudeSpawn.commonArgs()); // esforço explícito, MCPs desligados
    if (opts.noTools) args.push('--disallowedTools', NO_TOOLS.join(' '));
    const proc = spawn(CLAUDE_BIN, args, { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() });
    if (ctl) ctl.procs.add(proc);
    let buf = '', text = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { proc.kill('SIGTERM'); } catch (_) {} }, STEP_TIMEOUT_MS);
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const j = JSON.parse(line);
          if (j.type === 'stream_event' && j.event && j.event.type === 'content_block_delta') {
            const t = j.event.delta && j.event.delta.text;
            if (t) { text += t; if (onToken) onToken(t); }
          } else if (j.type === 'result' && typeof j.result === 'string' && j.result) {
            // O result traz só a última mensagem; se houve uso de ferramenta no meio, ele é a resposta limpa
            text = j.result;
          }
        } catch (_) {}
      }
    });
    proc.stderr.on('data', d => { err += d.toString(); });
    const fim = (code) => {
      clearTimeout(timer);
      if (ctl) ctl.procs.delete(proc);
      const canceled = !!(ctl && ctl.canceled);
      if (timedOut) return resolve({ text, error: `tempo esgotado (${Math.round(STEP_TIMEOUT_MS / 60000)} min)` });
      if (canceled) return resolve({ text, canceled: true });
      if (code !== 0 && !text) return resolve({ text: '', error: (err.slice(-400) || 'exit ' + code) });
      resolve({ text });
    };
    proc.on('close', fim);
    proc.on('error', (e) => { clearTimeout(timer); if (ctl) ctl.procs.delete(proc); resolve({ text: '', error: e.message }); });
    proc.stdin.on('error', () => {});
    proc.stdin.end(prompt);
  });
}

// ─── Prompts ─────────────────────────────────────────────────────────────────
function orchestratorSystem(team) {
  const out = [];
  out.push(`# Orquestrador da equipe "${team.name}"`);
  out.push('Você é o orquestrador de uma equipe de agentes de IA na plataforma ZEUS. Você não executa o trabalho dos especialistas: você entende o pedido, divide em tarefas claras, escolhe quem faz cada uma e depois consolida as entregas num resultado único e pronto para uso.');
  if (team.objective) { out.push(''); out.push('Objetivo da equipe: ' + team.objective); }
  if (team.orchestratorPrompt) { out.push(''); out.push('Instruções específicas do dono da equipe:'); out.push(team.orchestratorPrompt); }
  out.push('');
  out.push('Sempre em PT-BR, direto, tom amigável-profissional.');
  return out.join('\n');
}

function rosterText(roster) {
  return roster.map(a => `- id: ${a.id} | ${a.name} | ${a.description || 'sem descrição'}`).join('\n');
}

function historyText(runId, turn) {
  const rows = stmt.steps.all(runId).filter(s => s.turn < turn && (s.kind === 'user' || s.kind === 'final'));
  if (!rows.length) return '';
  const lines = ['=== Rodadas anteriores desta execução ==='];
  for (const s of rows) lines.push((s.kind === 'user' ? 'PEDIDO: ' : 'ENTREGA CONSOLIDADA: ') + cut(s.content, 5000));
  lines.push('=== Fim das rodadas anteriores ===', '');
  return lines.join('\n');
}

function plannerPrompt(team, roster, request, history) {
  return [
    history,
    'Agentes disponíveis na equipe:',
    rosterText(roster),
    '',
    '=== Novo pedido ===',
    request,
    '',
    'Monte o plano de execução. Regras:',
    '- Use só os agentes que realmente agregam ao pedido (pode ser 1, pode ser todos). Cada agente aparece no máximo uma vez.',
    '- Cada tarefa tem que ser específica, com o que entregar e em que formato. O agente não vê as outras tarefas, então dê o contexto necessário.',
    '- "etapa" define a ordem: tarefas na mesma etapa rodam em paralelo; a etapa 2 recebe as entregas da etapa 1, e assim por diante. Use etapas só quando uma tarefa depende de outra (ex: estratégia antes da copy). Máximo 4 etapas.',
    '- Se o pedido for vago demais para executar bem, faça até 3 perguntas objetivas (modo "perguntar"). Se der pra avançar com premissas razoáveis, avance.',
    '- Se for só uma pergunta simples sobre a equipe ou um ajuste pequeno numa entrega anterior que você mesmo resolve, use o modo "responder".',
    '',
    'Não use ferramentas. Responda APENAS com um JSON válido, sem texto antes ou depois, num destes formatos:',
    '{"modo":"executar","resumo":"como a equipe vai atacar o pedido, em 1-2 frases","tarefas":[{"agente":"<id>","etapa":1,"tarefa":"..."}]}',
    '{"modo":"perguntar","mensagem":"perguntas para o usuário"}',
    '{"modo":"responder","mensagem":"resposta direta"}',
  ].join('\n');
}

function parsePlan(txt, roster) {
  const s = String(txt || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const j = parseJSON(s.slice(a, b + 1), null);
  if (!j || typeof j !== 'object') return null;
  const modo = String(j.modo || j.mode || '').toLowerCase();
  if ((modo === 'perguntar' || modo === 'responder') && j.mensagem) return { modo, mensagem: String(j.mensagem) };
  const ids = new Set(roster.map(x => x.id));
  const vistos = new Set();
  const tarefas = (Array.isArray(j.tarefas) ? j.tarefas : [])
    .map(t => ({ agente: String(t.agente || t.agent || ''), etapa: Math.max(1, Math.min(4, parseInt(t.etapa || t.stage || 1, 10) || 1)), tarefa: String(t.tarefa || t.task || '').trim() }))
    .filter(t => ids.has(t.agente) && t.tarefa && !vistos.has(t.agente) && vistos.add(t.agente))
    .slice(0, MAX_AGENTS);
  if (!tarefas.length) return null;
  // Renumera as etapas em sequência (1, 3 → 1, 2)
  const ordem = [...new Set(tarefas.map(t => t.etapa))].sort((x, y) => x - y);
  tarefas.forEach(t => { t.etapa = ordem.indexOf(t.etapa) + 1; });
  return { modo: 'executar', resumo: String(j.resumo || ''), tarefas };
}

function agentTaskPrompt(team, request, history, plan, task, prior) {
  const out = [];
  const kb = knowledgeFor(request + '\n' + task);
  if (kb) out.push(kb, '');
  if (history) out.push(history);
  out.push(`Você faz parte da equipe "${team.name}", coordenada por um orquestrador.`);
  if (team.objective) out.push('Objetivo da equipe: ' + team.objective);
  out.push('', '=== Pedido original do usuário ===', request);
  if (plan.resumo) out.push('', 'Plano do orquestrador: ' + plan.resumo);
  if (prior.length) {
    out.push('', '=== Entregas das etapas anteriores (use como insumo) ===');
    prior.forEach(p => out.push('', `--- ${p.name} ---`, cut(p.text, HANDOFF_CHARS)));
    out.push('=== Fim das entregas anteriores ===');
  }
  out.push('', '=== SUA TAREFA ===', task);
  out.push('', 'Entregue só a sua parte, completa e pronta para uso. Não faça perguntas ao usuário nesta etapa: se faltar informação, assuma premissas razoáveis e deixe-as explícitas no início.');
  out.push('Trabalhe como o agente que você é: aplique as suas habilidades ativas (inclusive invocando as skills instaladas quando indicado) e priorize a sua base de conhecimento e os trechos da base da empresa acima sobre conhecimento genérico, citando o documento quando usar.');
  return out.join('\n');
}

function consolidatePrompt(request, history, plan, results) {
  const out = [];
  if (history) out.push(history);
  out.push('=== Pedido do usuário ===', request, '');
  if (plan.resumo) out.push('Plano executado: ' + plan.resumo, '');
  out.push('=== Entregas dos agentes ===');
  results.forEach(r => {
    out.push('', `--- ${r.name}${r.error ? ' (FALHOU)' : ''} ---`, 'Tarefa: ' + r.task, '');
    out.push(r.error ? '[sem entrega: ' + r.error + ']' : cut(r.text, HANDOFF_CHARS));
  });
  out.push('', '=== Fim das entregas ===', '');
  out.push('Consolide tudo numa entrega final única, organizada e pronta para o usuário usar:');
  out.push('- Comece com um resumo executivo curto (3 a 5 linhas).');
  out.push('- Depois a entrega integrada, por seções. Elimine repetições e resolva contradições entre os agentes (quando decidir entre versões, diga qual escolheu e por quê em uma linha).');
  out.push('- Preserve o conteúdo pronto (copies, roteiros, tabelas) dos agentes, não resuma o que é entregável.');
  out.push('- Se algum agente falhou, diga o que ficou faltando.');
  out.push('- Feche com "Próximos passos" práticos.');
  out.push('Não use ferramentas. Responda direto com o texto final em markdown.');
  return out.join('\n');
}

// ─── Execução ────────────────────────────────────────────────────────────────
function addStep(runId, turn, seq, kind, extra) {
  const id = newId();
  stmt.stepIns.run(Object.assign({ id, run_id: runId, turn, seq, kind, agent_id: null, agent_name: null, stage: null, task: null,
    content: '', status: 'pending', now: Date.now() }, extra || {}));
  emitStep(runId, id);
  return id;
}
function finishStep(runId, id, content, status) {
  stmt.stepSet.run(content, status, Date.now(), id);
  emitStep(runId, id);
}
// Tokens chegam aos montes: agrega e manda no máximo a cada 120ms por passo
function tokenPump(runId, stepId) {
  let pend = '', timer = null;
  const flush = () => { timer = null; if (pend) { emit(runId, 'token', { id: stepId, text: pend }); pend = ''; } };
  return {
    push(t) { pend += t; if (!timer) timer = setTimeout(flush, 120); },
    end() { if (timer) clearTimeout(timer); flush(); },
  };
}

async function orchestrate(runId, request) {
  const run = stmt.runGet.get(runId);
  const team = getTeam(run.team_id);
  const ctl = { procs: new Set(), canceled: false };
  active.set(runId, ctl);
  const turn = stmt.maxTurn.get(runId).t + 1;
  let seq = 0;
  const setRun = (st) => { stmt.runStatus.run(st, Date.now(), runId); emit(runId, 'run', { id: runId, status: st }); };

  try {
    setRun('running');
    ensurePlatformContext(); // CLAUDE.md da plataforma atualizado (agentes, habilidades, conhecimento, ferramentas)
    addStep(runId, turn, seq++, 'user', { content: request, status: 'done' });
    if (!run.title || run.title === 'Nova execução') {
      stmt.runTitle.run(request.trim().replace(/\s+/g, ' ').slice(0, 60), runId);
    }

    const roster = team.agents.filter(a => !a.missing);
    if (!roster.length) throw new Error('A equipe não tem agentes válidos. Edite a equipe e adicione agentes.');
    const history = historyText(runId, turn);
    const system = orchestratorSystem(team);
    const model = team.model || '';

    // 1. Plano
    const planId = addStep(runId, turn, seq++, 'plan', { agent_name: 'Orquestrador', status: 'running' });
    const pr = await runClaude(runId, plannerPrompt(team, roster, request, history), { system, model, noTools: true });
    if (pr.canceled) { finishStep(runId, planId, '', 'canceled'); return setRun('idle'); }
    if (pr.error && !pr.text) throw new Error('O orquestrador falhou ao planejar: ' + pr.error);
    let plan = parsePlan(pr.text, roster);
    if (!plan) {
      // Plano ilegível: todo mundo trabalha no pedido em paralelo, e o consolidador junta
      plan = { modo: 'executar', resumo: 'Cada agente contribui com a sua especialidade, em paralelo.',
        tarefas: roster.map(a => ({ agente: a.id, etapa: 1, tarefa: `Contribua com a sua especialidade (${a.name}) para este pedido: ${request}` })) };
    }
    finishStep(runId, planId, JSON.stringify(plan), 'done');

    if (plan.modo !== 'executar') {
      addStep(runId, turn, seq++, 'final', { agent_name: 'Orquestrador', content: plan.mensagem, status: 'done', task: plan.modo });
      return setRun('idle');
    }

    // 2. Agentes, etapa por etapa (paralelo dentro da etapa)
    const byId = new Map(roster.map(a => [a.id, a]));
    const tasks = plan.tarefas.map(t => ({
      t, agent: byId.get(t.agente),
      stepId: addStep(runId, turn, seq++, 'agent', { agent_id: t.agente, agent_name: byId.get(t.agente).name, stage: t.etapa, task: t.tarefa }),
    }));
    const results = [];
    const etapas = [...new Set(tasks.map(x => x.t.etapa))].sort((a, b) => a - b);
    for (const etapa of etapas) {
      if (ctl.canceled) break;
      const prior = results.filter(r => !r.error).map(r => ({ name: r.name, text: r.text }));
      const daEtapa = tasks.filter(x => x.t.etapa === etapa);
      const feitos = await Promise.all(daEtapa.map(async (x) => {
        stmt.stepStatus.run('running', x.stepId);
        emitStep(runId, x.stepId);
        const ctx = agents.buildAgentSystemPrompt(x.agent.id);
        const pump = tokenPump(runId, x.stepId);
        const r = await runClaude(runId, agentTaskPrompt(team, request, history, plan, x.t.tarefa, prior),
          { system: ctx && ctx.text, model: ctx && ctx.model, isAgent: true }, t => pump.push(t));
        pump.end();
        if (r.canceled) { finishStep(runId, x.stepId, r.text || '', 'canceled'); return null; }
        if (r.error && !r.text) { finishStep(runId, x.stepId, '[falhou] ' + r.error, 'error'); return { name: x.agent.name, task: x.t.tarefa, error: r.error }; }
        finishStep(runId, x.stepId, r.text, 'done');
        return { name: x.agent.name, task: x.t.tarefa, text: r.text };
      }));
      feitos.filter(Boolean).forEach(r => results.push(r));
    }
    if (ctl.canceled) {
      tasks.forEach(x => { const s = stmt.stepGet.get(x.stepId); if (s && s.status === 'pending') finishStep(runId, x.stepId, '', 'canceled'); });
      return setRun('idle');
    }
    if (!results.some(r => !r.error)) throw new Error('Nenhum agente conseguiu entregar. Veja os erros acima e tente de novo.');

    // 3. Consolidação
    const finalId = addStep(runId, turn, seq++, 'final', { agent_name: 'Orquestrador', status: 'running' });
    const pump = tokenPump(runId, finalId);
    const fr = await runClaude(runId, consolidatePrompt(request, history, plan, results), { system, model, noTools: true }, t => pump.push(t));
    pump.end();
    if (fr.canceled) { finishStep(runId, finalId, fr.text || '', 'canceled'); return setRun('idle'); }
    if (fr.error && !fr.text) finishStep(runId, finalId, '[a consolidação falhou: ' + fr.error + ']\n\nAs entregas individuais dos agentes estão acima.', 'error');
    else finishStep(runId, finalId, fr.text, 'done');
    setRun('idle');
  } catch (e) {
    addStep(runId, turn, seq++, 'error', { agent_name: 'Orquestrador', content: e.message, status: 'error' });
    setRun('idle');
  } finally {
    active.delete(runId);
    emit(runId, 'end', { id: runId });
  }
}

function deleteRun(rid) {
  const ctl = active.get(rid);
  if (ctl) { ctl.canceled = true; ctl.procs.forEach(p => { try { p.kill('SIGTERM'); } catch (_) {} }); }
  stmt.stepsDel.run(rid);
  stmt.runDel.run(rid);
  const dir = path.join(WORKDIR_ROOT, rid);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Router ──────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ teams: stmt.list.all().map(shape), limits: { min: MIN_AGENTS, max: MAX_AGENTS } });
});

// Execuções (antes de /:id pra "runs" não virar id de equipe)
router.get('/runs/:rid', (req, res) => {
  const run = stmt.runGet.get(req.params.rid);
  if (!run) return res.status(404).json({ error: 'execução não encontrada' });
  res.json({ run: Object.assign({}, run, { status: active.has(run.id) ? 'running' : run.status }), steps: stmt.steps.all(run.id).map(stepOut) });
});

router.get('/runs/:rid/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(': hello\n\n');
  busAdd(req.params.rid, res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
  req.on('close', () => { clearInterval(ping); busDel(req.params.rid, res); });
});

router.post('/runs/:rid/send', (req, res) => {
  const run = stmt.runGet.get(req.params.rid);
  if (!run) return res.status(404).json({ error: 'execução não encontrada' });
  if (!stmt.get.get(run.team_id)) return res.status(404).json({ error: 'equipe não encontrada' });
  if (active.has(run.id)) return res.status(409).json({ error: 'a equipe ainda está trabalhando no pedido anterior' });
  const text = String((req.body && req.body.text) || '').trim().slice(0, 20000);
  if (!text) return res.status(400).json({ error: 'mensagem vazia' });
  orchestrate(run.id, text);
  res.json({ ok: true });
});

router.post('/runs/:rid/cancel', (req, res) => {
  const ctl = active.get(req.params.rid);
  if (!ctl) return res.json({ ok: true, idle: true });
  ctl.canceled = true;
  ctl.procs.forEach(p => { try { p.kill('SIGTERM'); } catch (_) {} });
  res.json({ ok: true });
});

router.delete('/runs/:rid', (req, res) => {
  if (!stmt.runGet.get(req.params.rid)) return res.status(404).json({ error: 'execução não encontrada' });
  deleteRun(req.params.rid);
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const t = getTeam(req.params.id);
  if (!t) return res.status(404).json({ error: 'equipe não encontrada' });
  res.json({ team: t });
});

router.post('/', (req, res) => {
  const o = cleanInput(req.body || {}, true);
  const err = validate(o);
  if (err) return res.status(400).json({ error: err });
  const id = slug(o.name) + '-' + crypto.randomBytes(3).toString('hex');
  stmt.ins.run(Object.assign({ id, now: Date.now() }, o));
  res.json({ team: getTeam(id) });
});

router.patch('/:id', (req, res) => {
  const cur = stmt.get.get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'equipe não encontrada' });
  const o = cleanInput(req.body || {}, false);
  const err = validate(o);
  if (err) return res.status(400).json({ error: err });
  const keys = Object.keys(o);
  if (keys.length) {
    db.prepare(`UPDATE teams SET ${keys.map(k => k + ' = @' + k).join(', ')}, updated_at = @now WHERE id = @id`)
      .run(Object.assign({ id: cur.id, now: Date.now() }, o));
  }
  res.json({ team: getTeam(cur.id) });
});

router.post('/:id/duplicate', (req, res) => {
  const t = stmt.get.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'equipe não encontrada' });
  const name = (t.name + ' (cópia)').slice(0, 120);
  const id = slug(name) + '-' + crypto.randomBytes(3).toString('hex');
  stmt.ins.run({ id, name, objective: t.objective, description: t.description, visibility: 'privada', orchestrator_prompt: t.orchestrator_prompt,
    agent_ids: t.agent_ids, icebreakers: t.icebreakers, model: t.model, now: Date.now() });
  res.json({ team: getTeam(id) });
});

router.delete('/:id', (req, res) => {
  const t = stmt.get.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'equipe não encontrada' });
  stmt.runIdsOfTeam.all(t.id).forEach(r => deleteRun(r.id));
  stmt.del.run(t.id);
  res.json({ ok: true });
});

router.get('/:id/runs', (req, res) => {
  if (!stmt.get.get(req.params.id)) return res.status(404).json({ error: 'equipe não encontrada' });
  res.json({ runs: stmt.runs.all(req.params.id).map(r => Object.assign({}, r, { status: active.has(r.id) ? 'running' : r.status })) });
});

router.post('/:id/runs', (req, res) => {
  if (!stmt.get.get(req.params.id)) return res.status(404).json({ error: 'equipe não encontrada' });
  const id = newId(), now = Date.now();
  stmt.runIns.run(id, req.params.id, 'Nova execução', now, now);
  res.json({ run: stmt.runGet.get(id) });
});

module.exports = { router };
