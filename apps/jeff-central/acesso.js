// Quem é quem na Central: a sessão aponta para uma pessoa em Configurações > Usuários (org_members),
// que é a fonte da verdade de papel, status, equipe e liderança. A senha fica em central_users (worker.db).
// Aqui também moram a matriz de permissões, o escopo "restrito à equipe" e os links de convite.
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL DEFAULT 'membro',
  area_id TEXT, team_id TEXT, cargo_id TEXT, leader_id TEXT, status TEXT NOT NULL DEFAULT 'ativo',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS config_kv (section TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
`);
// Colunas do convite e do uso (idempotente)
const colunas = new Set(db.prepare(`PRAGMA table_info(org_members)`).all().map(c => c.name));
[['invite_hash', 'TEXT'], ['invite_expires', 'INTEGER'], ['invited_by', 'TEXT'], ['accepted_at', 'INTEGER'], ['last_seen', 'INTEGER'], ['avatar', 'TEXT'], ['whatsapp', 'TEXT']]
  .forEach(([c, t]) => { if (!colunas.has(c)) db.exec(`ALTER TABLE org_members ADD COLUMN ${c} ${t}`); });

const CONVITE_DIAS = parseInt(process.env.CENTRAL_CONVITE_DIAS || '7', 10);
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'central.jefersonhenrike.com';
const PAPEL_NOME = { owner: 'Proprietário', admin: 'Administrador', gestor: 'Gestor', membro: 'Membro' };
const NIVEIS = ['total', 'equipe', 'leitura', 'sem'];

// ─── Matriz de permissões ────────────────────────────────────────────────────
// [grupo, id, nome, [admin, gestor, membro]]. O Proprietário tem acesso total e não editável.
const PERMISSOES = [
  ['ORGANIZAÇÃO', 'convidar', 'Convidar usuários', ['total', 'sem', 'sem']],
  ['ORGANIZAÇÃO', 'remover', 'Remover usuários', ['total', 'sem', 'sem']],
  ['ORGANIZAÇÃO', 'desativar', 'Desativar usuários', ['total', 'sem', 'sem']],
  ['ORGANIZAÇÃO', 'editar-permissoes', 'Editar permissões', ['total', 'sem', 'sem']],
  ['ORGANIZAÇÃO', 'criar-equipes', 'Criar equipes', ['total', 'sem', 'sem']],
  ['ORGANIZAÇÃO', 'definir-equipe', 'Definir equipe do usuário', ['total', 'equipe', 'sem']],
  ['ORGANIZAÇÃO', 'definir-lideranca', 'Definir liderança do usuário', ['total', 'equipe', 'sem']],
  ['ORGANIZAÇÃO', 'ver-organograma', 'Visualizar organograma', ['total', 'equipe', 'leitura']],
  ['AGENTES', 'criar-agente', 'Criar agente', ['total', 'sem', 'total']],
  ['AGENTES', 'aprovar-agente', 'Aprovar agente', ['total', 'sem', 'sem']],
  ['AGENTES', 'publicar-agente', 'Publicar agente', ['total', 'sem', 'sem']],
  ['AGENTES', 'compartilhar-agente', 'Compartilhar agente com pessoas', ['total', 'sem', 'total']],
  ['AGENTES', 'add-workspace', 'Adicionar agente ao workspace', ['total', 'sem', 'total']],
  ['AGENTES', 'rm-workspace', 'Remover agente do workspace', ['total', 'sem', 'total']],
  ['AGENTES', 'criar-equipe-agentes', 'Criar equipe de agentes', ['total', 'sem', 'total']],
  ['AGENTES', 'editar-equipe-agentes', 'Editar equipe de agentes', ['total', 'sem', 'total']],
  ['AGENTES', 'excluir-equipe-agentes', 'Excluir equipe de agentes', ['total', 'sem', 'sem']],
  ['AGENTES', 'analytics-agentes', 'Acessar analytics de agentes', ['total', 'sem', 'total']],
  ['AGENTES', 'criar-habilidade', 'Criar habilidade do agente', ['total', 'sem', 'total']],
  ['AGENTES', 'publicar-habilidade', 'Publicar habilidade do agente', ['total', 'sem', 'sem']],
  ['AGENTES', 'melhorar-habilidade', 'Melhorar habilidade com IA', ['total', 'sem', 'total']],
  ['AGENTES', 'aprovar-habilidade', 'Aprovar habilidade do agente', ['total', 'sem', 'sem']],
  ['AGENTES', 'editar-zeus', 'Configurar Agentes ZEUS', ['total', 'sem', 'sem']],
  ['OPERAÇÃO', 'criar-rotina', 'Criar rotinas agendadas', ['total', 'total', 'total']],
  ['OPERAÇÃO', 'editar-conhecimento', 'Editar base de conhecimento da empresa', ['total', 'total', 'sem']],
  ['OPERAÇÃO', 'editar-tarefas', 'Criar e editar tarefas (Ações)', ['total', 'total', 'leitura']],
  ['GESTÃO', 'ver-motores', 'Ver motores e dashboards', ['total', 'equipe', 'sem']],
  ['GESTÃO', 'editar-metas', 'Editar metas do funil', ['total', 'equipe', 'sem']],
  ['GESTÃO', 'editar-okrs', 'Editar OKRs', ['total', 'equipe', 'leitura']],
  ['PESSOAS', 'ver-pdis', 'Ver PDIs da equipe', ['total', 'equipe', 'sem']],
  ['PESSOAS', 'criar-pdi', 'Criar PDI para outra pessoa', ['total', 'equipe', 'sem']],
  ['FINANCEIRO', 'ver-plano', 'Ver plano e faturas', ['total', 'sem', 'sem']],
  ['FINANCEIRO', 'alterar-plano', 'Alterar plano e forma de pagamento', ['sem', 'sem', 'sem']],
];
const PERM_NOME = Object.fromEntries(PERMISSOES.map(([, id, nome]) => [id, nome]));
function permPadrao() {
  const o = {};
  PERMISSOES.forEach(([, id, , v]) => { o[id] = { admin: v[0], gestor: v[1], membro: v[2] }; });
  return o;
}
const kvGet = db.prepare(`SELECT data FROM config_kv WHERE section = ?`);
function kv(nome) { try { const r = kvGet.get(nome); return r ? JSON.parse(r.data) : {}; } catch { return {}; } }
function matriz() {
  const base = permPadrao(), salvo = kv('permissoes');
  Object.keys(salvo).forEach(k => { if (base[k]) Object.assign(base[k], salvo[k]); });
  return base;
}

// ─── Pessoa da sessão ────────────────────────────────────────────────────────
const stmt = {
  porEmail: db.prepare(`SELECT * FROM org_members WHERE lower(email) = ? AND email != ''`),
  porId: db.prepare(`SELECT * FROM org_members WHERE id = ?`),
  todos: db.prepare(`SELECT id, name, email, team_id, leader_id, status FROM org_members`),
  visto: db.prepare(`UPDATE org_members SET last_seen = ? WHERE id = ?`),
};
const norm = s => String(s || '').trim().toLowerCase();
function pessoaPorEmail(email) { return email ? stmt.porEmail.get(norm(email)) || null : null; }

const _visto = new Map(); // id -> último registro (grava no banco no máximo a cada 5 min)
function marcarVisto(id) {
  const agora = Date.now();
  if (agora - (_visto.get(id) || 0) < 5 * 60 * 1000) return;
  _visto.set(id, agora);
  try { stmt.visto.run(agora, id); } catch (_) {}
}

// Monta req.user a partir da sessão. null = sessão não vale mais (pessoa removida, inativa ou sem cadastro).
// Sessão sem e-mail = senha mestra do servidor: vale como Proprietário (acesso de emergência).
function usuario(sessao, opts) {
  if (!sessao) return null;
  if (!sessao.email) return { email: null, name: 'Administrador', memberId: null, role: 'owner', admin: true, teamId: null, areaId: null, mestra: true };
  const m = pessoaPorEmail(sessao.email);
  if (!m || m.status !== 'ativo') return null;
  if (opts && opts.marcar) marcarVisto(m.id);
  return { email: norm(m.email), name: m.name, memberId: m.id, role: m.role, admin: m.role === 'owner' || m.role === 'admin', teamId: m.team_id, areaId: m.area_id, avatar: m.avatar || null, whatsapp: m.whatsapp || null, cargoId: m.cargo_id || null };
}

// Nível de uma permissão para a pessoa: total | equipe | leitura | sem
function nivel(user, id) {
  if (!user) return 'total'; // chamada interna (rotinas, scheduler)
  if (user.role === 'owner') return 'total';
  const linha = matriz()[id];
  const papel = user.role === 'admin' ? 'admin' : user.role === 'gestor' ? 'gestor' : 'membro';
  if (!linha) return user.admin ? 'total' : 'sem';
  let v = NIVEIS.includes(linha[papel]) ? linha[papel] : 'sem';
  // Preferências administrativas valem para o papel Membro por cima da matriz
  if (papel === 'membro') {
    const p = kv('prefs');
    if (id === 'convidar' && p.membrosConvidam === true && v === 'sem') v = 'total';
    if (id === 'criar-agente' && p.membrosCriamAgentes === false) v = 'sem';
  }
  return v;
}
// Pode executar (escrever)? Com { leitura: true }, basta poder ver.
function pode(user, id, opts) {
  const v = nivel(user, id);
  if (v === 'sem') return false;
  if (v === 'leitura') return !!(opts && opts.leitura);
  return true;
}
function permissoesDe(user) { const o = {}; PERMISSOES.forEach(([, id]) => { o[id] = nivel(user, id); }); return o; }

// Escopo "restrito à equipe": a própria pessoa, quem ela lidera (direta ou indiretamente) e quem está na mesma equipe.
function escopo(user) {
  const out = { ids: new Set(), nomes: new Set(), emails: new Set() };
  if (!user || !user.memberId) return out;
  const todos = stmt.todos.all();
  const add = m => { out.ids.add(m.id); out.nomes.add(norm(m.name)); if (m.email) out.emails.add(norm(m.email)); };
  const eu = todos.find(m => m.id === user.memberId);
  if (!eu) return out;
  add(eu);
  const fila = [eu.id];
  while (fila.length) { const id = fila.shift(); todos.filter(m => m.leader_id === id && !out.ids.has(m.id)).forEach(m => { add(m); fila.push(m.id); }); }
  if (eu.team_id) todos.filter(m => m.team_id === eu.team_id).forEach(add);
  return out;
}
// A pessoa (por id, nome ou e-mail) está no alcance de quem tem nível "total" ou "equipe" nessa permissão?
function alcanca(user, perm, alvo) {
  const v = nivel(user, perm);
  if (v === 'total') return true;
  if (v !== 'equipe') return false;
  const e = escopo(user);
  return !!alvo && (e.ids.has(alvo) || e.nomes.has(norm(alvo)) || e.emails.has(norm(alvo)));
}

// ─── Middlewares ─────────────────────────────────────────────────────────────
function negar(res, user, id) {
  const papel = PAPEL_NOME[(user && user.role) || 'membro'] || 'Membro';
  return res.status(403).json({ error: `Seu perfil (${papel}) não tem permissão para: ${PERM_NOME[id] || id}. Peça a um administrador.`, permissao: id });
}
function exigir(id, opts) {
  return (req, res, next) => (pode(req.user, id, opts) ? next() : negar(res, req.user, id));
}
// Regras por rota: [[método, /regex do caminho/, permissão, { leitura }?], ...]. A primeira que casar decide.
// Método '*' vale para qualquer um; 'GET' casa também HEAD.
function regras(lista) {
  return (req, res, next) => {
    const m = req.method === 'HEAD' ? 'GET' : req.method;
    for (const [met, re, id, opts] of lista) {
      if ((met === '*' || met === m) && re.test(req.path)) return pode(req.user, id, opts) ? next() : negar(res, req.user, id);
    }
    next();
  };
}

// ─── Convites ────────────────────────────────────────────────────────────────
const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function linkConvite(token) { return `https://${PUBLIC_HOST}/convite/${token}`; }
// Gera (ou regera) o link: o anterior deixa de valer. Só o hash fica no banco, então o link aparece uma vez.
function gerarConvite(memberId, porQuem) {
  const m = stmt.porId.get(memberId);
  if (!m) throw new Error('pessoa não encontrada');
  if (!m.email) throw new Error('cadastre o e-mail da pessoa antes de gerar o convite');
  const token = crypto.randomBytes(24).toString('base64url');
  const expira = Date.now() + CONVITE_DIAS * 24 * 3600 * 1000;
  db.prepare(`UPDATE org_members SET invite_hash = ?, invite_expires = ?, invited_by = ?, status = CASE WHEN status = 'ativo' AND accepted_at IS NOT NULL THEN status ELSE 'convidado' END, updated_at = ? WHERE id = ?`)
    .run(hashToken(token), expira, porQuem || null, Date.now(), m.id);
  return { memberId: m.id, url: linkConvite(token), expira };
}
function lerConvite(token) {
  if (!token || String(token).length < 20) return { erro: 'invalido' };
  const m = db.prepare(`SELECT * FROM org_members WHERE invite_hash = ?`).get(hashToken(token));
  if (!m) return { erro: 'invalido' };
  if (m.status === 'inativo') return { erro: 'inativo' };
  if (!m.invite_expires || m.invite_expires < Date.now()) return { erro: 'expirado', m };
  return { m };
}
function aceitarConvite(memberId, nome) {
  const agora = Date.now();
  db.prepare(`UPDATE org_members SET status = 'ativo', accepted_at = ?, invite_hash = NULL, invite_expires = NULL, last_seen = ?, name = COALESCE(NULLIF(?, ''), name), updated_at = ? WHERE id = ?`)
    .run(agora, agora, String(nome || '').trim().slice(0, 120), agora, memberId);
  return stmt.porId.get(memberId);
}

module.exports = {
  db, PERMISSOES, PERM_NOME, PAPEL_NOME, NIVEIS, permPadrao, matriz, kv,
  pessoaPorEmail, usuario, nivel, pode, permissoesDe, escopo, alcanca, exigir, regras, negar,
  gerarConvite, lerConvite, aceitarConvite, linkConvite, CONVITE_DIAS,
};
