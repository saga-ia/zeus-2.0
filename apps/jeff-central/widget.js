// Botão flutuante do ZEUS: tarefas do Agente de Ações, chamados de Suporte e o contexto do assistente da plataforma.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS w_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prio TEXT NOT NULL DEFAULT 'media',
  due TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS w_tickets (
  id TEXT PRIMARY KEY,
  num INTEGER NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'duvida',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'aberto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS w_ticket_msgs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_w_ticket_msgs ON w_ticket_msgs(ticket_id, created_at);
`);

const ME = process.env.PDI_ME || 'Vinícius Nunes';
const PRIOS = ['alta', 'media', 'baixa'];
const CATS = ['duvida', 'problema', 'sugestao', 'financeiro'];
const TPRIOS = ['baixa', 'normal', 'urgente'];
const TSTATUS = ['aberto', 'andamento', 'resolvido'];
const newId = () => crypto.randomBytes(8).toString('base64url');
const txt = (v, n) => (v === undefined || v === null) ? undefined : String(v).trim().slice(0, n);
const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const erro = (res, c, m) => res.status(c).json({ error: m });

// ─── Agente de Ações ─────────────────────────────────────────────────────────
function tasksOut() {
  return db.prepare(`SELECT * FROM w_tasks WHERE done = 0 OR done_at >= ? ORDER BY done, CASE prio WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, COALESCE(due, '9999'), created_at`)
    .all(Date.now() - 2 * 86400000) // feitas somem da lista depois de 2 dias
    .map(t => ({ id: t.id, title: t.title, prio: t.prio, due: t.due, done: !!t.done, doneAt: t.done_at, createdAt: t.created_at }));
}
// ─── Suporte ─────────────────────────────────────────────────────────────────
function ticketOut(t, full) {
  const out = { id: t.id, num: t.num, subject: t.subject, category: t.category, priority: t.priority, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at,
    msgs: db.prepare(`SELECT COUNT(*) AS n FROM w_ticket_msgs WHERE ticket_id = ?`).get(t.id).n };
  if (full) out.messages = db.prepare(`SELECT * FROM w_ticket_msgs WHERE ticket_id = ? ORDER BY created_at`).all(t.id).map(m => ({ id: m.id, author: m.author, text: m.text, createdAt: m.created_at }));
  return out;
}
const tickets = () => db.prepare(`SELECT * FROM w_tickets ORDER BY CASE status WHEN 'resolvido' THEN 1 ELSE 0 END, updated_at DESC`).all().map(t => ticketOut(t, false));

// ─── Contexto do assistente (vai junto das perguntas feitas pelo botão flutuante) ───
function contar(sql, args) { try { return db.prepare(sql).get(...(args || [])).n || 0; } catch { return 0; } }
function assistantPrelude() {
  let empresa = 'a empresa';
  try { const r = db.prepare(`SELECT data FROM config_kv WHERE section = 'empresa'`).get(); if (r) empresa = JSON.parse(r.data).nome || empresa; } catch (_) {}
  const pdis = (() => { try { return db.prepare(`SELECT person, status FROM pdis`).all(); } catch { return []; } })();
  const pessoas = (() => { try { return db.prepare(`SELECT name, role, status FROM org_members`).all(); } catch { return []; } })();
  const pend = tasksOut().filter(t => !t.done);
  const lines = [
    `Você é o ZEUS, assistente da plataforma ZEUS Central de ${empresa}. Nesta conversa você responde pelo botão flutuante: tire dúvidas de onde fica cada coisa e traga dados da empresa. Respostas curtas e diretas, em PT-BR. Quando indicar um lugar, use o caminho do menu (ex.: Agentes > Meus agentes).`,
    '',
    '## Mapa da plataforma',
    '- Início: saudação, chat principal com o ZEUS, atalhos Pesquisar/Executar/Criar/Gestão e "Seu dia" (cartões gerenciáveis em Gerenciar cartões).',
    '- Agentes > Meus agentes: agentes da empresa; Criar agente (com IA ou manual), editar, compartilhar, duplicar, excluir.',
    '- Agentes > Agentes ZEUS: catálogo oficial; adicionar ao workspace e usar.',
    '- Agentes > Equipes de agentes: equipes com orquestrador que divide o pedido entre agentes e consolida.',
    '- Agentes > Habilidades, Conhecimento e Gestão.',
    '- Gestão Inteligente: Motor de Vendas (Gestão Comercial, Execução Comercial, Auditor de Vendas) e Motor de Growth.',
    '- Conversas: histórico de conversas com o ZEUS. Atividades: ações do time.',
    '- OKRs; PDI (Meu PDI, PDIs da equipe, Analisar evolução, Templates de PDI); Organograma.',
    '- Ferramentas: 16 ferramentas com IA (Radar ZEUS, Diagnóstico de IA, Metas de Funil, Playbook...) e Aplicações com guia de implementação.',
    '- Conectores: integrações (HubSpot, Pipedrive, RD Station, Meta Ads, Google, WhatsApp, Asaas...).',
    '- Configurações: dados da empresa, marca, preferências, plano e faturamento, consumo, segurança, usuários, estrutura, liderança, permissões, agentes (aprovação, categorias, avisos sensíveis), motores, produtividade, OKRs e aprovações.',
    '- Botão flutuante: abas ZEUS (esta conversa), Agente de Ações (tarefas do dia) e Suporte (chamados).',
    '',
    '## Dados atuais da empresa',
    `- Pessoas: ${pessoas.length} (${pessoas.filter(p => p.status === 'ativo').length} ativas, ${pessoas.filter(p => p.status === 'convidado').length} convites pendentes)${pessoas.length ? ': ' + pessoas.map(p => p.name).join(', ') : ''}.`,
    `- Agentes próprios: ${contar(`SELECT COUNT(*) AS n FROM agents WHERE kind = 'custom'`)}; no workspace: ${contar(`SELECT COUNT(*) AS n FROM agents WHERE in_workspace = 1`)}; equipes de agentes: ${contar(`SELECT COUNT(*) AS n FROM teams`)}.`,
    `- PDIs: ${pdis.length} (${pdis.filter(p => p.status === 'ativo').length} ativos)${pdis.length ? ': ' + pdis.map(p => `${p.person} (${p.status})`).join(', ') : ''}.`,
    `- Conversas este mês: ${contar(`SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ?`, [new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()])}.`,
    `- Tarefas pendentes no Agente de Ações: ${pend.length}${pend.length ? ': ' + pend.slice(0, 10).map(t => `${t.title} [${t.prio}${t.due ? ', ' + t.due : ''}]`).join('; ') : ''}.`,
    `- Chamados de suporte abertos: ${contar(`SELECT COUNT(*) AS n FROM w_tickets WHERE status != 'resolvido'`)}.`,
    `- Hoje é ${hoje()}.`,
    'Se o usuário pedir algo que a plataforma não faz, diga com clareza e sugira abrir um chamado na aba Suporte.',
  ];
  return lines.join('\n');
}

// ─── Router ──────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/tasks', (_req, res) => res.json({ tasks: tasksOut(), today: hoje() }));
router.post('/tasks', (req, res) => {
  const b = req.body || {};
  const title = txt(b.title, 200);
  if (!title) return erro(res, 400, 'descreva a tarefa');
  db.prepare(`INSERT INTO w_tasks (id, title, prio, due, done, done_at, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?)`)
    .run(newId(), title, PRIOS.includes(b.prio) ? b.prio : 'media', /^\d{4}-\d{2}-\d{2}$/.test(b.due || '') ? b.due : null, Date.now());
  res.json({ tasks: tasksOut(), today: hoje() });
});
router.patch('/tasks/:id', (req, res) => {
  const t = db.prepare(`SELECT * FROM w_tasks WHERE id = ?`).get(req.params.id);
  if (!t) return erro(res, 404, 'tarefa não encontrada');
  const b = req.body || {};
  const o = {};
  if (b.title !== undefined) { o.title = txt(b.title, 200); if (!o.title) return erro(res, 400, 'descreva a tarefa'); }
  if (b.prio !== undefined) o.prio = PRIOS.includes(b.prio) ? b.prio : t.prio;
  if (b.due !== undefined) o.due = /^\d{4}-\d{2}-\d{2}$/.test(b.due || '') ? b.due : null;
  if (b.done !== undefined) { o.done = b.done ? 1 : 0; o.done_at = b.done ? Date.now() : null; }
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE w_tasks SET ${k.map(x => x + ' = @' + x).join(', ')} WHERE id = @id`).run(Object.assign({ id: t.id }, o));
  res.json({ tasks: tasksOut(), today: hoje() });
});
router.delete('/tasks/:id', (req, res) => {
  db.prepare(`DELETE FROM w_tasks WHERE id = ?`).run(req.params.id);
  res.json({ tasks: tasksOut(), today: hoje() });
});

router.get('/tickets', (_req, res) => res.json({ tickets: tickets() }));
router.post('/tickets', (req, res) => {
  const b = req.body || {};
  const subject = txt(b.subject, 160), text = txt(b.description, 5000);
  if (!subject) return erro(res, 400, 'informe o assunto');
  if (!text) return erro(res, 400, 'descreva o que está acontecendo');
  const id = newId(), now = Date.now();
  const num = (db.prepare(`SELECT MAX(num) AS m FROM w_tickets`).get().m || 1000) + 1;
  db.prepare(`INSERT INTO w_tickets (id, num, subject, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'aberto', ?, ?)`)
    .run(id, num, subject, CATS.includes(b.category) ? b.category : 'duvida', TPRIOS.includes(b.priority) ? b.priority : 'normal', now, now);
  db.prepare(`INSERT INTO w_ticket_msgs (id, ticket_id, author, text, created_at) VALUES (?, ?, ?, ?, ?)`).run(newId(), id, ME, text, now);
  res.json({ ticket: ticketOut(db.prepare(`SELECT * FROM w_tickets WHERE id = ?`).get(id), true), tickets: tickets() });
});
router.get('/tickets/:id', (req, res) => {
  const t = db.prepare(`SELECT * FROM w_tickets WHERE id = ?`).get(req.params.id);
  if (!t) return erro(res, 404, 'chamado não encontrado');
  res.json({ ticket: ticketOut(t, true) });
});
router.post('/tickets/:id/msgs', (req, res) => {
  const t = db.prepare(`SELECT * FROM w_tickets WHERE id = ?`).get(req.params.id);
  if (!t) return erro(res, 404, 'chamado não encontrado');
  const text = txt((req.body || {}).text, 5000);
  if (!text) return erro(res, 400, 'mensagem vazia');
  const author = (req.body || {}).author === 'suporte' ? 'Suporte ZEUS' : ME;
  const now = Date.now();
  db.prepare(`INSERT INTO w_ticket_msgs (id, ticket_id, author, text, created_at) VALUES (?, ?, ?, ?, ?)`).run(newId(), t.id, author, text, now);
  db.prepare(`UPDATE w_tickets SET updated_at = ?, status = CASE WHEN status = 'resolvido' THEN 'aberto' ELSE status END WHERE id = ?`).run(now, t.id);
  res.json({ ticket: ticketOut(db.prepare(`SELECT * FROM w_tickets WHERE id = ?`).get(t.id), true), tickets: tickets() });
});
router.patch('/tickets/:id', (req, res) => {
  const t = db.prepare(`SELECT * FROM w_tickets WHERE id = ?`).get(req.params.id);
  if (!t) return erro(res, 404, 'chamado não encontrado');
  const st = (req.body || {}).status;
  if (!TSTATUS.includes(st)) return erro(res, 400, 'status inválido');
  db.prepare(`UPDATE w_tickets SET status = ?, updated_at = ? WHERE id = ?`).run(st, Date.now(), t.id);
  res.json({ ticket: ticketOut(db.prepare(`SELECT * FROM w_tickets WHERE id = ?`).get(t.id), true), tickets: tickets() });
});

module.exports = { router, assistantPrelude };
