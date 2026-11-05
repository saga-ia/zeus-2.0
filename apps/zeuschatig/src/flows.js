// Motor dos fluxos de conversa (construtor em Central > Instagram > Fluxos). Roda dentro do myig-dispatcher, ANTES dos
// agentes de IA: o que um fluxo pega, o agente não responde.
//
// Definição (flows.definition): { nodes: [{ id, type, x, y, data }], edges: [{ de, porta, para }] }
//   gatilho   { tipo: 'palavra' | 'primeira', palavras: [..], modo: 'contem' | 'exata' }   (um por fluxo, porta 'proximo')
//   mensagem  { texto, estilo: 'botoes' | 'rapidas', botoes: [{ id, titulo, tipo: 'proximo' | 'link', url }] }
//             botoes: button template (até 3, link ou seguir) · rapidas: quick replies (até 13, só texto)
//             cada botão 'proximo' tem a porta 'btn:<id>'; sem botões segue pela porta 'proximo'
//   imagem    { url, legenda }            audio { url }            espera { segundos }
//   pergunta  { texto, campo }            espera a pessoa escrever, grava em contacts.attributes[campo], porta 'resposta'
//   agente    { agentId }                 passa a conversa para um agente de IA do myIG e encerra o fluxo
// Texto aceita {{nome}}, {{usuario}} e {{campo}} (atributo gravado por uma pergunta).
//
// Cliques: payload 'ZF:<run>:<nó>:<botão>' (postback ou quick reply). Cliques de outras ferramentas na conta (ManyChat,
// 'ACT::'...) não são tocados. A Meta só deixa responder até 24 h depois da última mensagem da pessoa: execuções paradas
// há mais de 24 h expiram.
const https = require('https');
const { db } = require('./db');

const PREFIXO = 'ZF:';
const IG_GRAPH = 'https://graph.instagram.com/v21.0';
const MAX_PASSOS = 40;          // trava contra laço no desenho
const PAUSA_ENTRE_MSGS = 900;   // ms entre mensagens seguidas, pra chegarem na ordem
const VALIDADE_MS = 24 * 3600000;

let workerDb = null;
let _token = null, _tokenEm = 0;
function token() {
  if (_token && Date.now() - _tokenEm < 60000) return _token;
  const r = workerDb.prepare("SELECT value FROM app_settings WHERE key='jeff_instagram_login_token'").get();
  if (!r || !r.value) throw new Error('token do Instagram (jeff_instagram_login_token) não configurado');
  _token = r.value; _tokenEm = Date.now();
  return _token;
}

// Envio real pela Graph API. Testes trocam por um falso com setEnviar() (nunca mandar DM de teste pra conta real).
function enviarGraph(destino, message) {
  return new Promise((resolve) => {
    const corpo = Buffer.from(JSON.stringify({ recipient: { id: destino }, message }));
    const req = https.request(IG_GRAPH + '/me/messages', { method: 'POST', timeout: 20000,
      headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json', 'content-length': corpo.length } }, r => {
      let t = ''; r.on('data', c => { t += c; });
      r.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (_) {}
        resolve(j.message_id ? { ok: true, id: j.message_id, body: j } : { ok: false, erro: (j.error && j.error.message) || ('HTTP ' + r.statusCode), body: j }); });
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', e => resolve({ ok: false, erro: e.message }));
    req.end(corpo);
  });
}
let enviar = enviarGraph;
function setEnviar(fn) { enviar = fn || enviarGraph; }

const dormir = ms => new Promise(r => setTimeout(r, ms));
const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sqlData = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19); // formato do datetime('now') do SQLite

// ─── Definição ────────────────────────────────────────────────────────────────
function def(flow) {
  const d = json(flow.definition, {});
  return { nodes: Array.isArray(d.nodes) ? d.nodes : [], edges: Array.isArray(d.edges) ? d.edges : [] };
}
const no = (d, id) => d.nodes.find(n => n.id === id) || null;
function proximo(d, de, porta) { const e = d.edges.find(x => x.de === de && (x.porta || 'proximo') === porta); return e ? no(d, e.para) : null; }

// Validação usada pelo servidor ao salvar/ativar. Devolve lista de problemas (vazia = ok).
function validar(definition, paraAtivar) {
  const d = { nodes: (definition && definition.nodes) || [], edges: (definition && definition.edges) || [] };
  const p = [];
  const gat = d.nodes.filter(n => n.type === 'gatilho');
  if (gat.length !== 1) p.push('O fluxo precisa de exatamente um gatilho.');
  for (const n of d.nodes) {
    const x = n.data || {};
    if (n.type === 'gatilho' && x.tipo === 'palavra' && !(x.palavras || []).some(w => String(w).trim())) p.push('Gatilho: informe pelo menos uma palavra-chave.');
    if (n.type === 'mensagem') {
      if (!String(x.texto || '').trim()) p.push('Há uma mensagem sem texto.');
      if (String(x.texto || '').length > 640 && (x.botoes || []).length && x.estilo !== 'rapidas') p.push('Mensagem com botões aceita até 640 caracteres.');
      if (String(x.texto || '').length > 1000) p.push('Mensagem acima de 1000 caracteres.');
      const bs = x.botoes || [];
      if (x.estilo === 'rapidas' && bs.length > 13) p.push('Respostas rápidas: no máximo 13.');
      if (x.estilo !== 'rapidas' && bs.length > 3) p.push('Botões: no máximo 3 por mensagem (use respostas rápidas para mais).');
      for (const b of bs) {
        if (!String(b.titulo || '').trim()) p.push('Há um botão sem título.');
        if (String(b.titulo || '').length > 20) p.push(`Botão "${b.titulo}": no máximo 20 caracteres.`);
        if (b.tipo === 'link' && !/^https:\/\//.test(b.url || '')) p.push(`Botão "${b.titulo}": o link precisa começar com https://.`);
        if (b.tipo === 'link' && x.estilo === 'rapidas') p.push('Respostas rápidas não aceitam link: use o estilo botões.');
      }
    }
    if ((n.type === 'imagem' || n.type === 'audio') && !/^https:\/\//.test(x.url || '')) p.push(`Bloco de ${n.type === 'audio' ? 'áudio' : 'imagem'} sem arquivo.`);
    if (n.type === 'pergunta' && !String(x.texto || '').trim()) p.push('Há uma pergunta sem texto.');
    if (n.type === 'agente' && paraAtivar) {
      const a = x.agentId && db.prepare('SELECT active FROM agents WHERE id=?').get(x.agentId);
      if (!a) p.push('Bloco de agente de IA sem agente escolhido.');
      else if (!a.active) p.push('O agente de IA escolhido está desligado: ligue-o em Agentes antes.');
    }
  }
  if (paraAtivar && gat[0] && !proximo(d, gat[0].id, 'proximo')) p.push('Ligue o gatilho ao primeiro bloco.');
  return [...new Set(p)];
}

// ─── Texto com variáveis ──────────────────────────────────────────────────────
function preencher(texto, contato) {
  const attrs = json(contato.attributes, {});
  const nome = String(contato.ig_name || '').split(/\s+/)[0] || '';
  return String(texto || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k) => {
    if (k === 'nome') return nome;
    if (k === 'usuario') return contato.ig_username ? '@' + contato.ig_username : '';
    return attrs[k] != null ? String(attrs[k]) : '';
  }).replace(/[ \t]{2,}/g, ' ').trim();
}

// ─── Execução ─────────────────────────────────────────────────────────────────
function gravarSaida(run, n, texto, media, envio) {
  db.prepare(`INSERT INTO messages(tenant_id, contact_id, direction, text, media_url, ig_message_id, raw_json, sent_by, flow_id, node_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(run.tenant_id, run.contact_id, 'out', texto, media || null, envio.id || null,
    JSON.stringify(envio.body || {}).slice(0, 4000), 'flow', run.flow_id, n.id);
  db.prepare(`UPDATE ig_threads SET last_message_at=datetime('now'), last_direction='out', unread_count=0 WHERE tenant_id=? AND contact_id=?`).run(run.tenant_id, run.contact_id);
}
function payload(run, n, b) { return `${PREFIXO}${run.id}:${n.id}:${b.id}`; }
function mensagemDe(run, n, contato) {
  const x = n.data || {}, texto = preencher(x.texto, contato), bs = x.botoes || [];
  if (!bs.length) return { text: texto };
  if (x.estilo === 'rapidas') return { text: texto, quick_replies: bs.slice(0, 13).map(b => ({ content_type: 'text', title: String(b.titulo).slice(0, 20), payload: payload(run, n, b) })) };
  return { attachment: { type: 'template', payload: { template_type: 'button', text: texto.slice(0, 640),
    buttons: bs.slice(0, 3).map(b => b.tipo === 'link' ? { type: 'web_url', url: b.url, title: String(b.titulo).slice(0, 20) } : { type: 'postback', title: String(b.titulo).slice(0, 20), payload: payload(run, n, b) }) } } };
}
async function mandar(run, n, contato, message, textoLog, media) {
  const r = await enviar(contato.ig_sender_id, message);
  if (!r.ok) throw new Error('envio recusado pelo Instagram: ' + r.erro);
  gravarSaida(run, n, textoLog, media, r);
}
function setRun(id, campos) {
  const ks = Object.keys(campos);
  db.prepare(`UPDATE flow_runs SET ${ks.map(k => k + '=@' + k).join(', ')}, updated_at=datetime('now') WHERE id=@id`).run(Object.assign({ id }, campos));
}

// Executa a partir do nó `atual` (inclusive) até parar numa espera ou acabar
async function executar(runId, atualId) {
  let run = db.prepare('SELECT * FROM flow_runs WHERE id=?').get(runId);
  const flow = db.prepare('SELECT * FROM flows WHERE id=?').get(run.flow_id);
  if (!flow) return setRun(runId, { status: 'error', error: 'fluxo excluído' });
  const d = def(flow);
  let n = no(d, atualId);
  setRun(runId, { status: 'running' });
  try {
    for (let passo = 0; n && passo < MAX_PASSOS; passo++) {
      const contato = db.prepare('SELECT * FROM contacts WHERE id=?').get(run.contact_id);
      const x = n.data || {};
      if (passo > 0 && ['mensagem', 'imagem', 'audio', 'pergunta'].includes(n.type)) await dormir(PAUSA_ENTRE_MSGS);
      if (n.type === 'gatilho') { n = proximo(d, n.id, 'proximo'); continue; }
      if (n.type === 'mensagem') {
        await mandar(run, n, contato, mensagemDe(run, n, contato), preencher(x.texto, contato) + ((x.botoes || []).length ? '\n[' + x.botoes.map(b => b.titulo).join(' | ') + ']' : ''));
        if ((x.botoes || []).some(b => b.tipo !== 'link')) {
          return setRun(runId, { status: 'waiting_reply', current_node: n.id, state: JSON.stringify({ esperando: 'botao' }), next_run_at: null });
        }
        n = proximo(d, n.id, 'proximo'); continue;
      }
      if (n.type === 'imagem') {
        await mandar(run, n, contato, { attachment: { type: 'image', payload: { url: x.url } } }, '[imagem]', x.url);
        if (String(x.legenda || '').trim()) { await dormir(PAUSA_ENTRE_MSGS); await mandar(run, n, contato, { text: preencher(x.legenda, contato) }, preencher(x.legenda, contato)); }
        n = proximo(d, n.id, 'proximo'); continue;
      }
      if (n.type === 'audio') {
        await mandar(run, n, contato, { attachment: { type: 'audio', payload: { url: x.url } } }, '[áudio]', x.url);
        n = proximo(d, n.id, 'proximo'); continue;
      }
      if (n.type === 'espera') {
        const seg = Math.max(1, Math.min(23 * 3600, parseInt(x.segundos, 10) || 5));
        const seguinte = proximo(d, n.id, 'proximo');
        if (!seguinte) break;
        return setRun(runId, { status: 'pending', current_node: seguinte.id, next_run_at: new Date(Date.now() + seg * 1000).toISOString(), state: '{}' });
      }
      if (n.type === 'pergunta') {
        await mandar(run, n, contato, { text: preencher(x.texto, contato) }, preencher(x.texto, contato));
        return setRun(runId, { status: 'waiting_reply', current_node: n.id, state: JSON.stringify({ esperando: 'resposta', campo: x.campo || '' }), next_run_at: null });
      }
      if (n.type === 'agente') {
        const a = db.prepare('SELECT id FROM agents WHERE id=? AND active=1').get(x.agentId);
        if (a) db.prepare('UPDATE ig_threads SET current_agent_id=? WHERE tenant_id=? AND contact_id=?').run(a.id, run.tenant_id, run.contact_id);
        break;
      }
      n = proximo(d, n.id, 'proximo'); // tipo desconhecido: segue
    }
    setRun(runId, { status: 'done', current_node: null, next_run_at: null });
  } catch (e) {
    console.error(`[flows] run ${runId} nó ${n && n.id}:`, e.message);
    setRun(runId, { status: 'error', error: String(e.message).slice(0, 500), current_node: n ? n.id : null });
  }
}

function iniciar(flow, tenantId, contactId) {
  // Um fluxo por vez por contato: o novo cancela o que estava em andamento
  db.prepare(`UPDATE flow_runs SET status='canceled', updated_at=datetime('now') WHERE contact_id=? AND status IN ('pending','waiting_reply','running')`).run(contactId);
  const gat = def(flow).nodes.find(n => n.type === 'gatilho');
  const info = db.prepare(`INSERT INTO flow_runs(tenant_id, contact_id, flow_id, current_node, status) VALUES(?,?,?,?, 'running')`).run(tenantId, contactId, flow.id, gat.id);
  db.prepare('UPDATE contacts SET last_flow_id=? WHERE id=?').run(flow.id, contactId);
  return executar(info.lastInsertRowid, gat.id);
}

// ─── Entrada: eventos do webhook ──────────────────────────────────────────────
function gatilhoQueBate(tenantId, texto, primeira) {
  const t = norm(texto);
  const flows = db.prepare('SELECT * FROM flows WHERE tenant_id=? AND active=1 ORDER BY updated_at DESC').all(tenantId);
  for (const f of flows) {
    const g = def(f).nodes.find(n => n.type === 'gatilho'); if (!g) continue;
    const x = g.data || {};
    if (x.tipo === 'primeira' && primeira) return f;
    if (x.tipo === 'palavra' && t) {
      const ok = (x.palavras || []).map(norm).filter(Boolean).some(w => x.modo === 'exata' ? t === w
        : new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(t));
      if (ok) return f;
    }
  }
  return null;
}
function reservar(ev) { return workerDb.prepare(`UPDATE ig_webhook_events SET processed_at='pending' WHERE id=? AND processed_at IS NULL`).run(ev.id).changes === 1; }
function concluir(ev, texto) { workerDb.prepare(`UPDATE ig_webhook_events SET processed_at=datetime('now'), response_text=? WHERE id=?`).run(texto, ev.id); }
function gravarEntrada(tenantId, contactId, ev, texto) {
  db.prepare(`INSERT INTO messages(tenant_id, contact_id, direction, text, raw_json, sent_by) VALUES(?,?,?,?,?,?)`).run(tenantId, contactId, 'in', texto, ev.raw_json, 'user');
  db.prepare(`UPDATE ig_threads SET last_message_at=datetime('now'), last_direction='in', unread_count=unread_count+1 WHERE tenant_id=? AND contact_id=?`).run(tenantId, contactId);
}

// Chamado a cada volta do dispatcher, antes dos agentes. deps: { getTenantForIgUserId, upsertContact, upsertThread }
async function tick(deps) {
  // 1) execuções com espera vencida
  for (const r of db.prepare(`SELECT id, current_node FROM flow_runs WHERE status='pending' AND next_run_at IS NOT NULL AND next_run_at <= ? LIMIT 10`).all(new Date().toISOString())) {
    await executar(r.id, r.current_node);
  }
  // 2) expira o que passou da janela de 24 h da Meta
  db.prepare(`UPDATE flow_runs SET status='expired', updated_at=datetime('now') WHERE status IN ('pending','waiting_reply') AND updated_at < ?`).run(sqlData(Date.now() - VALIDADE_MS));

  // 3) eventos novos (sem a janela de 15 s dos agentes: fluxo responde na hora). Cursor só avança: cliques de outras
  // ferramentas ficam sem processed_at pra sempre e não podem travar a fila. Ao subir, olha só os últimos 2 min.
  if (_cursor == null) _cursor = (workerDb.prepare(`SELECT MAX(id) m FROM ig_webhook_events WHERE received_at < ?`).get(sqlData(Date.now() - 120000)) || {}).m || 0;
  const evs = workerDb.prepare(`SELECT id, ig_user_id, sender_id, message_text, raw_json FROM ig_webhook_events
    WHERE id > ? AND event_type='message' AND processed_at IS NULL AND sender_id IS NOT NULL ORDER BY id ASC LIMIT 50`).all(_cursor);
  for (const ev of evs) {
    _cursor = Math.max(_cursor, ev.id);
    const raw = json(ev.raw_json, {});
    if (raw.message && raw.message.is_echo) continue;
    const tenant = deps.getTenantForIgUserId(ev.ig_user_id);
    if (!tenant || ev.sender_id === tenant.ig_user_id || ev.sender_id === ev.ig_user_id) continue;
    const pl = (raw.postback && raw.postback.payload) || (raw.message && raw.message.quick_reply && raw.message.quick_reply.payload) || '';

    // Clique num botão nosso
    if (pl.startsWith(PREFIXO)) {
      if (!reservar(ev)) continue;
      const [runId, noId, btnId] = pl.slice(PREFIXO.length).split(':');
      const run = db.prepare('SELECT * FROM flow_runs WHERE id=?').get(parseInt(runId, 10));
      const titulo = (raw.postback && raw.postback.title) || ev.message_text || '';
      if (run) gravarEntrada(run.tenant_id, run.contact_id, ev, titulo);
      const flow = run && db.prepare('SELECT * FROM flows WHERE id=? AND active=1').get(run.flow_id);
      // Clique em mensagem antiga também vale (ManyChat faz igual), desde que o fluxo continue ativo
      const seguinte = flow && proximo(def(flow), noId, 'btn:' + btnId);
      if (run && seguinte && run.status !== 'canceled') {
        db.prepare(`UPDATE flow_runs SET status='canceled', updated_at=datetime('now') WHERE contact_id=? AND id<>? AND status IN ('pending','waiting_reply')`).run(run.contact_id, run.id);
        setRun(run.id, { state: '{}', next_run_at: null });
        await executar(run.id, seguinte.id);
        concluir(ev, `flow ${run.flow_id}: botão ${btnId}`);
      } else concluir(ev, 'flow: clique sem continuação');
      continue;
    }
    if (raw.postback) continue;              // clique de outra ferramenta (ManyChat etc.): não é nosso
    const texto = ev.message_text;
    if (!texto) continue;

    const contactId = deps.upsertContact(tenant.id, ev.sender_id);
    deps.upsertThread(tenant.id, contactId);
    const aguardando = db.prepare(`SELECT * FROM flow_runs WHERE contact_id=? AND status='waiting_reply' ORDER BY id DESC LIMIT 1`).get(contactId);
    if (aguardando) {
      const st = json(aguardando.state, {});
      const flow = db.prepare('SELECT * FROM flows WHERE id=? AND active=1').get(aguardando.flow_id);
      const d = flow && def(flow), n = d && no(d, aguardando.current_node);
      if (n && st.esperando === 'resposta') {
        if (!reservar(ev)) continue;
        gravarEntrada(tenant.id, contactId, ev, texto);
        if (st.campo) {
          const c = db.prepare('SELECT attributes FROM contacts WHERE id=?').get(contactId);
          const attrs = json(c && c.attributes, {}); attrs[st.campo] = String(texto).slice(0, 500);
          db.prepare('UPDATE contacts SET attributes=? WHERE id=?').run(JSON.stringify(attrs), contactId);
        }
        const seguinte = proximo(d, n.id, 'resposta');
        if (seguinte) await executar(aguardando.id, seguinte.id); else setRun(aguardando.id, { status: 'done', current_node: null });
        concluir(ev, `flow ${flow.id}: resposta`);
        continue;
      }
      if (n && st.esperando === 'botao') {
        // A pessoa digitou o texto do botão em vez de clicar
        const b = ((n.data || {}).botoes || []).find(x => x.tipo !== 'link' && norm(x.titulo) === norm(texto));
        const seguinte = b && proximo(d, n.id, 'btn:' + b.id);
        if (seguinte) {
          if (!reservar(ev)) continue;
          gravarEntrada(tenant.id, contactId, ev, texto);
          await executar(aguardando.id, seguinte.id);
          concluir(ev, `flow ${flow.id}: botão digitado`);
          continue;
        }
      }
    }
    const primeira = !workerDb.prepare(`SELECT 1 FROM ig_webhook_events WHERE sender_id=? AND id<? LIMIT 1`).get(ev.sender_id, ev.id);
    const flow = gatilhoQueBate(tenant.id, texto, primeira);
    if (!flow) continue;                     // fica pros agentes de IA
    if (!reservar(ev)) continue;
    gravarEntrada(tenant.id, contactId, ev, texto);
    console.log(`[flows] fluxo ${flow.id} "${flow.name}" iniciado para ${ev.sender_id.slice(0, 10)}`);
    await iniciar(flow, tenant.id, contactId);
    concluir(ev, `flow ${flow.id}: iniciado`);
  }
}

let _cursor = null;
function init(wdb) { workerDb = wdb; }

module.exports = { init, tick, validar, setEnviar, gatilhoQueBate, iniciar, executar, PREFIXO };
