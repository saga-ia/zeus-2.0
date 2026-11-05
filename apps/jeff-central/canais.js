// Canais dos agentes: liga um agente da Central para responder no WhatsApp (números de SDR do jeff-sdrs) e no
// Instagram (DMs pelo myIG). A Central é a fonte da verdade: agent_channels guarda qual agente está em qual canal, e o
// prompt do agente (agents.buildChannelPrompt) é empurrado para o motor do canal. Editar o agente reenvia o prompt.
//   WhatsApp: um agente por número. Ligar grava as instruções do número (rota /instructions, até 20 mil caracteres; a
//             rota /config corta em 8 mil) e liga a IA no modo escolhido. O que o número tinha antes fica em `antes`
//             e volta quando o agente é desligado.
//   Instagram: um agente por vez. Ligar cria/atualiza um agente espelho no myIG com regra padrão e desativa os outros
//              agentes de lá (guardados em `antes`, voltam ao desligar). Desligar só desativa o espelho: o histórico fica.
// Só administradores (montado com exigirAdmin no server.js).
const express = require('express');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const agents = require('./agents');
const ig = require('./instagram-myig');
const wa = require('./whatsapp-sdrs');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const MYIG_HOST = process.env.MYIG_HOST || '127.0.0.1';
const MYIG_PORT = parseInt(process.env.MYIG_PORT || '3060', 10);
const LIMITE_WA = 20000;
const LIMITE_IG = 40000;
const MODOS_WA = ['receptivo', 'ativo'];

const db = new Database(path.join(DATA_DIR, 'central.db'), { timeout: 5000 });
db.exec(`
CREATE TABLE IF NOT EXISTS agent_channels (
  canal TEXT NOT NULL,
  alvo TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  opcoes TEXT NOT NULL DEFAULT '{}',
  antes TEXT,
  sync_at INTEGER,
  erro TEXT,
  por TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (canal, alvo)
);
CREATE INDEX IF NOT EXISTS idx_agent_channels_agent ON agent_channels(agent_id);
CREATE TABLE IF NOT EXISTS agent_myig (agent_id TEXT PRIMARY KEY, myig_id INTEGER NOT NULL);
`);
const st = {
  todos: db.prepare('SELECT * FROM agent_channels ORDER BY canal, alvo'),
  get: db.prepare('SELECT * FROM agent_channels WHERE canal = ? AND alvo = ?'),
  doAgente: db.prepare('SELECT * FROM agent_channels WHERE agent_id = ?'),
  up: db.prepare(`INSERT INTO agent_channels (canal, alvo, agent_id, opcoes, antes, sync_at, erro, por, updated_at)
    VALUES (@canal, @alvo, @agent_id, @opcoes, @antes, @sync_at, NULL, @por, @now)
    ON CONFLICT(canal, alvo) DO UPDATE SET agent_id = excluded.agent_id, opcoes = excluded.opcoes, antes = excluded.antes,
      sync_at = excluded.sync_at, erro = NULL, por = excluded.por, updated_at = excluded.updated_at`),
  sync: db.prepare('UPDATE agent_channels SET sync_at = ?, erro = ? WHERE canal = ? AND alvo = ?'),
  del: db.prepare('DELETE FROM agent_channels WHERE canal = ? AND alvo = ?'),
  espelho: db.prepare('SELECT myig_id FROM agent_myig WHERE agent_id = ?'),
  espelhoUp: db.prepare('INSERT INTO agent_myig (agent_id, myig_id) VALUES (?, ?) ON CONFLICT(agent_id) DO UPDATE SET myig_id = excluded.myig_id'),
  espelhos: db.prepare('SELECT * FROM agent_myig'),
};
const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };

// Uma operação por vez: ligar/desligar mexe em mais de um registro dos motores
let _fila = Promise.resolve();
function emFila(fn) { const p = _fila.then(fn, fn); _fila = p.catch(() => {}); return p; }

// ─── Chamadas aos motores ─────────────────────────────────────────────────────
function pedir(host, port, method, caminho, corpo, headers) {
  return new Promise((resolve, reject) => {
    const dados = corpo == null ? null : Buffer.from(JSON.stringify(corpo));
    const h = Object.assign({ accept: 'application/json' }, headers);
    if (dados) { h['content-type'] = 'application/json'; h['content-length'] = dados.length; }
    const req = http.request({ host, port, method, path: caminho, headers: h, timeout: 20000 }, r => {
      const partes = []; r.on('data', c => partes.push(c));
      r.on('end', () => { const t = Buffer.concat(partes).toString('utf8'); resolve({ status: r.statusCode, json: json(t, null) }); });
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', reject);
    req.end(dados || undefined);
  });
}
async function sdrs(method, caminho, corpo) {
  try { return await pedir(wa.SDRS_HOST, wa.SDRS_PORT, method, '/api' + caminho, corpo, { cookie: wa.cookieSessao(), 'x-central-user': 'central-canais' }); }
  catch (e) { throw new Error('o sistema de SDRs não respondeu (' + e.message + ')'); }
}
async function myig(method, caminho, corpo) {
  try {
    let r = await pedir(MYIG_HOST, MYIG_PORT, method, '/api' + caminho, corpo, { 'x-session-token': ig.sessao() });
    if (r.status === 401) r = await pedir(MYIG_HOST, MYIG_PORT, method, '/api' + caminho, corpo, { 'x-session-token': ig.sessao(true) });
    return r;
  } catch (e) { throw new Error('o myIG não respondeu (' + e.message + ')'); }
}
function ok(r, oque) {
  if (r.status >= 200 && r.status < 300) return r.json || {};
  const d = r.json || {};
  throw new Error(`${oque} (${d.msg || d.error || 'HTTP ' + r.status})`);
}

// ─── WhatsApp (números de SDR) ────────────────────────────────────────────────
const AVISO_WA = 'Neste número você atua como o agente descrito abaixo. Se o nome ou a função citados antes forem diferentes, vale o que está aqui.\n\n';

async function configSdr(slot) { return ok(await sdrs('GET', `/sdrs/${slot}/config`), 'não consegui ler o número ' + slot); }
// PUT /config regrava todos os campos: manda o que já existe e muda só a IA. Sem `instructions` (lá corta em 8 mil).
async function gravarIaSdr(slot, sdr, aiActive, modo) {
  const corpo = Object.assign({}, sdr, { ai_active: aiActive ? 1 : 0, sdr_mode: modo });
  delete corpo.instructions;
  ok(await sdrs('PUT', `/sdrs/${slot}/config`, corpo), 'não consegui ligar a IA do número ' + slot);
}
async function enviarPromptWa(slot, agentId) {
  const p = agents.buildChannelPrompt(agentId, LIMITE_WA - AVISO_WA.length);
  if (!p) throw new Error('agente não encontrado');
  ok(await sdrs('PUT', `/sdrs/${slot}/instructions`, { instructions: AVISO_WA + p.text }), 'não consegui gravar as instruções do número ' + slot);
  return p;
}

async function ligarWhatsapp(agentId, slot, modo, por) {
  slot = parseInt(slot, 10);
  if (!slot) throw new Error('escolha o número');
  modo = MODOS_WA.includes(modo) ? modo : 'receptivo';
  const { sdr } = await configSdr(slot);
  if (!sdr) throw new Error('número não encontrado');
  if (!sdr.ai_key_id) throw new Error('Esse número não tem chave de IA configurada. Configure em WhatsApp, na IA do número.');
  const atual = st.get.get('whatsapp', String(slot));
  // `antes` é o estado do número antes da Central assumir: se outro agente já estava nele, mantém o original
  const antes = atual ? atual.antes : JSON.stringify({ instructions: sdr.instructions == null ? null : sdr.instructions, ai_active: sdr.ai_active ? 1 : 0, sdr_mode: sdr.sdr_mode || 'receptivo' });
  const p = await enviarPromptWa(slot, agentId);
  await gravarIaSdr(slot, sdr, true, modo);
  st.up.run({ canal: 'whatsapp', alvo: String(slot), agent_id: agentId, opcoes: JSON.stringify({ modo, truncado: p.truncado }), antes, sync_at: Date.now(), por: por || null, now: Date.now() });
  console.log(`[canais] ${agentId} ligado no WhatsApp número ${slot} (${modo}) por ${por || '?'}`);
}

async function desligarWhatsapp(slot, por) {
  slot = String(parseInt(slot, 10));
  const atual = st.get.get('whatsapp', slot);
  if (!atual) return;
  const antes = json(atual.antes, {});
  ok(await sdrs('PUT', `/sdrs/${slot}/instructions`, { instructions: antes.instructions == null ? null : antes.instructions }), 'não consegui devolver as instruções do número ' + slot);
  const { sdr } = await configSdr(slot);
  await gravarIaSdr(slot, sdr, !!antes.ai_active, MODOS_WA.includes(antes.sdr_mode) ? antes.sdr_mode : 'receptivo');
  st.del.run('whatsapp', slot);
  console.log(`[canais] ${atual.agent_id} desligado do WhatsApp número ${slot} por ${por || '?'}`);
}

// ─── Instagram (myIG) ─────────────────────────────────────────────────────────
// '' = padrão do myIG; os apelidos opus/sonnet/haiku o claude -p aceita direto
const modeloIg = m => (['opus', 'sonnet', 'haiku'].includes(m) ? m : undefined);

async function agentesMyig() { return ok(await myig('GET', '/agents'), 'não consegui ler os agentes do Instagram'); }
async function enviarPromptIg(agentId, myigId) {
  const p = agents.buildChannelPrompt(agentId, LIMITE_IG);
  if (!p) throw new Error('agente não encontrado');
  ok(await myig('PUT', `/agents/${myigId}`, { name: p.name, system_prompt: p.text, model: modeloIg(p.model) }), 'não consegui atualizar o agente no Instagram');
  return p;
}

async function ligarInstagram(agentId, por) {
  const { agents: lista } = await agentesMyig();
  const esp = st.espelho.get(agentId);
  let mid = esp && (lista || []).some(x => x.id === esp.myig_id) ? esp.myig_id : null;
  if (!mid) {
    const p0 = agents.buildChannelPrompt(agentId, LIMITE_IG);
    if (!p0) throw new Error('agente não encontrado');
    const r = ok(await myig('POST', '/agents', { name: p0.name, system_prompt: p0.text, model: modeloIg(p0.model), active: false }), 'não consegui criar o agente no Instagram');
    mid = r.agent.id;
    st.espelhoUp.run(agentId, mid);
  }
  const p = await enviarPromptIg(agentId, mid);
  const { rules } = ok(await myig('GET', `/agents/${mid}/rules`), 'não consegui ler as regras do Instagram');
  if (!(rules || []).some(r => r.rule_type === 'default' && r.active)) ok(await myig('POST', `/agents/${mid}/rules`, { rule_type: 'default', priority: 0 }), 'não consegui criar a regra padrão');
  // Um por vez: desativa os outros. `antes` guarda os que estavam ligados antes da Central assumir.
  const atual = st.get.get('instagram', 'ig');
  const nossos = new Set(st.espelhos.all().map(x => x.myig_id));
  const antes = atual ? atual.antes : JSON.stringify({ ativos: (lista || []).filter(x => x.active && !nossos.has(x.id) && x.id !== mid).map(x => x.id) });
  for (const x of lista || []) if (x.id !== mid && x.active) ok(await myig('PUT', `/agents/${x.id}`, { active: false }), 'não consegui desligar o agente "' + x.name + '" do Instagram');
  ok(await myig('PUT', `/agents/${mid}`, { active: true }), 'não consegui ligar o agente no Instagram');
  st.up.run({ canal: 'instagram', alvo: 'ig', agent_id: agentId, opcoes: JSON.stringify({ myigId: mid, truncado: p.truncado }), antes, sync_at: Date.now(), por: por || null, now: Date.now() });
  console.log(`[canais] ${agentId} ligado no Instagram (myIG ${mid}) por ${por || '?'}`);
}

async function desligarInstagram(por) {
  const atual = st.get.get('instagram', 'ig');
  if (!atual) return;
  const esp = st.espelho.get(atual.agent_id);
  const { agents: lista } = await agentesMyig();
  const existe = id => (lista || []).some(x => x.id === id);
  if (esp && existe(esp.myig_id)) ok(await myig('PUT', `/agents/${esp.myig_id}`, { active: false }), 'não consegui desligar o agente do Instagram');
  for (const id of json(atual.antes, {}).ativos || []) if (existe(id)) await myig('PUT', `/agents/${id}`, { active: true }).catch(() => {});
  st.del.run('instagram', 'ig');
  console.log(`[canais] ${atual.agent_id} desligado do Instagram por ${por || '?'}`);
}

// ─── Chamados pelo agents.js ──────────────────────────────────────────────────
function resumo(agentId) {
  return st.doAgente.all(agentId).map(r => ({ canal: r.canal, alvo: r.alvo, erro: r.erro || null }));
}
// Agente editado (nome, prompt, modelo, arquivos): reenvia o prompt para cada canal ligado
function agenteMudou(agentId) {
  return emFila(async () => {
    for (const r of st.doAgente.all(agentId)) {
      try {
        if (r.canal === 'whatsapp') await enviarPromptWa(r.alvo, agentId);
        else if (r.canal === 'instagram') { const o = json(r.opcoes, {}); if (o.myigId) await enviarPromptIg(agentId, o.myigId); }
        st.sync.run(Date.now(), null, r.canal, r.alvo);
      } catch (e) {
        st.sync.run(r.sync_at, String(e.message).slice(0, 300), r.canal, r.alvo);
        console.error('[canais] reenvio', agentId, r.canal, r.alvo, e.message);
      }
    }
  });
}
function agenteRemovido(agentId) {
  return emFila(async () => {
    for (const r of st.doAgente.all(agentId)) {
      try { if (r.canal === 'whatsapp') await desligarWhatsapp(r.alvo, 'agente excluído'); else await desligarInstagram('agente excluído'); }
      catch (e) { console.error('[canais] desligar ao excluir', agentId, r.canal, r.alvo, e.message); }
    }
  });
}

// ─── API ──────────────────────────────────────────────────────────────────────
const router = express.Router();
router.use(express.json({ limit: '32kb' }));

function nomeAgente(id) { const a = agents.getAgent(id); return a ? a.name : id; }

// Tudo o que o modal de canais precisa: números de SDR, conta do Instagram e quem está ligado em cada um
router.get('/', async (_req, res) => {
  const ligados = st.todos.all();
  const porAlvo = {}; ligados.forEach(r => { porAlvo[r.canal + ':' + r.alvo] = r; });
  const info = r => r ? { agentId: r.agent_id, agentName: nomeAgente(r.agent_id), opcoes: json(r.opcoes, {}), syncAt: r.sync_at, erro: r.erro } : null;
  const out = { whatsapp: { numeros: [], erro: null }, instagram: { conta: null, ligado: info(porAlvo['instagram:ig']), outros: [], erro: null } };
  try {
    const { sdrs: lista } = ok(await sdrs('GET', '/sdrs'), 'não consegui listar os números');
    out.whatsapp.numeros = (lista || [])
      .filter(s => s.name || s.phone || s.status !== 'idle' || porAlvo['whatsapp:' + s.slot])
      .map(s => ({ slot: s.slot, nome: s.name || '', funcao: s.role_label || '', fone: s.phone || '', status: s.status, iaAtiva: !!s.ai_active,
        modo: s.sdr_mode || 'receptivo', temChave: !!s.ai_key_id, ligado: info(porAlvo['whatsapp:' + s.slot]) }));
  } catch (e) { out.whatsapp.erro = e.message; }
  try {
    const r = await agentesMyig();
    out.instagram.conta = r.tenant ? (r.tenant.ig_username ? '@' + r.tenant.ig_username : r.tenant.name) : null;
    const nossos = new Set(st.espelhos.all().map(x => x.myig_id));
    out.instagram.outros = (r.agents || []).filter(x => x.active && !nossos.has(x.id)).map(x => x.name);
  } catch (e) { out.instagram.erro = e.message; }
  res.json(out);
});

const falha = (res, e) => { console.error('[canais]', e.message); res.status(400).json({ error: e.message }); };
function agenteValido(req, res) {
  const id = String((req.body && req.body.agentId) || '');
  if (!agents.getAgent(id)) { res.status(404).json({ error: 'agente não encontrado' }); return null; }
  return id;
}

router.post('/whatsapp', async (req, res) => {
  const id = agenteValido(req, res); if (!id) return;
  try { await emFila(() => ligarWhatsapp(id, req.body.slot, req.body.modo, req.user && req.user.email)); res.json({ ok: true }); }
  catch (e) { falha(res, e); }
});
router.delete('/whatsapp/:slot', async (req, res) => {
  try { await emFila(() => desligarWhatsapp(req.params.slot, req.user && req.user.email)); res.json({ ok: true }); }
  catch (e) { falha(res, e); }
});
router.post('/instagram', async (req, res) => {
  const id = agenteValido(req, res); if (!id) return;
  try { await emFila(() => ligarInstagram(id, req.user && req.user.email)); res.json({ ok: true }); }
  catch (e) { falha(res, e); }
});
router.delete('/instagram', async (req, res) => {
  try { await emFila(() => desligarInstagram(req.user && req.user.email)); res.json({ ok: true }); }
  catch (e) { falha(res, e); }
});

module.exports = { router, resumo, agenteMudou, agenteRemovido };
