// Configurações da empresa: seções (dados, marca, preferências...), pessoas, estrutura (áreas, equipes, cargos),
// liderança, permissões, consumo e registro de atividades.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS config_kv (
  section TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'membro',
  area_id TEXT,
  team_id TEXT,
  cargo_id TEXT,
  leader_id TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS org_units (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  area_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS config_audit (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  who TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_config_audit ON config_audit(at);
`);

const OWNER = process.env.PDI_ME || 'Vinícius Nunes';
const ROLES = ['owner', 'admin', 'gestor', 'membro'];
const STATUS = ['ativo', 'convidado', 'inativo'];
const KINDS = ['area', 'equipe', 'cargo'];
const NIVEIS = ['total', 'equipe', 'leitura', 'sem'];
const newId = () => crypto.randomBytes(8).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const txt = (v, n) => (v === undefined || v === null) ? undefined : String(v).trim().slice(0, n);

// Permissões padrão por módulo (o Proprietário tem acesso total e não editável)
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
  ['GESTÃO', 'ver-motores', 'Ver motores e dashboards', ['total', 'equipe', 'sem']],
  ['GESTÃO', 'editar-metas', 'Editar metas do funil', ['total', 'equipe', 'sem']],
  ['GESTÃO', 'editar-okrs', 'Editar OKRs', ['total', 'equipe', 'leitura']],
  ['PESSOAS', 'ver-pdis', 'Ver PDIs da equipe', ['total', 'equipe', 'sem']],
  ['PESSOAS', 'criar-pdi', 'Criar PDI para outra pessoa', ['total', 'equipe', 'sem']],
  ['FINANCEIRO', 'ver-plano', 'Ver plano e faturas', ['total', 'sem', 'sem']],
  ['FINANCEIRO', 'alterar-plano', 'Alterar plano e forma de pagamento', ['sem', 'sem', 'sem']],
];
function permPadrao() {
  const o = {};
  PERMISSOES.forEach(([, id, , v]) => { o[id] = { admin: v[0], gestor: v[1], membro: v[2] }; });
  return o;
}
const DEFAULTS = {
  empresa: { nome: 'Empresa de Vinícius', identificador: '', logo: '', fuso: 'America/Sao_Paulo', idioma: 'pt-BR',
    razao: '', fantasia: '', cnpj: '', funcionarios: '', segmento: '', emailFin: '', whatsFin: '' },
  marca: { primaria: '#17171A', acento: '#A8620A', fundo: '#FFFFFF', fonte: '', tom: '' },
  prefs: { membrosCriamAgentes: true, aprovarAgentesEmpresa: false, membrosConvidam: false, modeloPadrao: '', idiomaIA: 'pt-BR',
    retencaoDias: '365', resumoSemanal: true, canalResumo: 'email' },
  plano: { nome: 'Gratuito', assinatura: false, assentos: 10, ciclo: '', proxima: '', valor: 'Sob consulta' },
  seguranca: { sessaoDias: '30', dominios: '', bloquearExportacao: false, auditoria: true },
  produtividade: { valorHora: '80', minConversa: '12', minExecucaoEquipe: '90', minPdi: '20' },
  okrs: { ciclo: 'trimestral', inicio: '2026-07-01', cadencia: 'semanal', escala: '0-100', lembrete: true },
  aprovacoes: { publicarAgente: false, criarEquipe: false, ativarPdi: false, convites: true, alterarPermissoes: true },
  permissoes: {},
  agentes: { categorias: [], avisos: [] },
};
const ACOES_AVISO = ['avisar', 'recusar', 'humano', 'registrar'];
const LIMITES = { empresa: { logo: 400000 } };

const stmt = {
  kv: db.prepare(`SELECT * FROM config_kv WHERE section = ?`),
  kvSet: db.prepare(`INSERT INTO config_kv (section, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(section) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  members: db.prepare(`SELECT * FROM org_members ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'gestor' THEN 2 ELSE 3 END, name COLLATE NOCASE`),
  member: db.prepare(`SELECT * FROM org_members WHERE id = ?`),
  units: db.prepare(`SELECT * FROM org_units ORDER BY kind, sort, name COLLATE NOCASE`),
  unit: db.prepare(`SELECT * FROM org_units WHERE id = ?`),
  audit: db.prepare(`SELECT * FROM config_audit ORDER BY at DESC LIMIT 40`),
  auditIns: db.prepare(`INSERT INTO config_audit (id, at, who, action, detail) VALUES (?, ?, ?, ?, ?)`),
};
function log(action, detail) { stmt.auditIns.run(newId(), Date.now(), OWNER, action, detail || ''); }
function secao(nome) {
  const r = stmt.kv.get(nome);
  const salvo = r ? parseJSON(r.data, {}) : {};
  if (nome === 'permissoes') {
    const base = permPadrao();
    Object.keys(salvo).forEach(k => { if (base[k]) base[k] = Object.assign(base[k], salvo[k]); });
    return base;
  }
  return Object.assign({}, DEFAULTS[nome] || {}, salvo);
}
function salvar(nome, data) { stmt.kvSet.run(nome, JSON.stringify(data), Date.now()); }

// ─── Seed ────────────────────────────────────────────────────────────────────
(function seed() {
  const now = Date.now();
  if (!stmt.kv.get('empresa')) salvar('empresa', { identificador: 'company-' + crypto.randomUUID() });
  if (db.prepare(`SELECT COUNT(*) AS n FROM org_units`).get().n) return;
  const add = (kind, name, i, area) => { const id = newId(); db.prepare(`INSERT INTO org_units (id, kind, name, area_id, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, kind, name, area || null, i, now); return id; };
  const areas = {};
  ['Atendimento', 'Financeiro', 'Gestão', 'Marketing', 'Operações', 'Pós-vendas', 'Produto', 'Tecnologia', 'Vendas'].forEach((n, i) => { areas[n] = add('area', n, i); });
  const cargos = {};
  [['Head Comercial', 'Gestão'], ['SDR', 'Vendas'], ['SDR Sênior', 'Vendas'], ['Closer', 'Vendas'], ['Analista de Marketing', 'Marketing'], ['Customer Success', 'Pós-vendas']]
    .forEach(([n, a], i) => { cargos[n] = add('cargo', n, i, areas[a]); });
  if (db.prepare(`SELECT COUNT(*) AS n FROM org_members`).get().n) return;
  const ins = db.prepare(`INSERT INTO org_members (id, name, email, role, area_id, team_id, cargo_id, leader_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'ativo', ?, ?)`);
  const dono = newId();
  ins.run(dono, OWNER, '', 'owner', areas['Gestão'], cargos['Head Comercial'], null, now, now);
  [['Ana Beatriz Costa', 'Vendas', 'SDR Sênior'], ['Bruno Souza', 'Vendas', 'SDR'], ['Rafael Almeida', 'Marketing', 'Analista de Marketing'], ['Fernanda Lima', 'Pós-vendas', 'Customer Success']]
    .forEach(([n, a, c]) => ins.run(newId(), n, '', 'membro', areas[a], cargos[c], dono, now, now));
})();

// ─── Leitura ─────────────────────────────────────────────────────────────────
function memberOut(m) {
  return { id: m.id, name: m.name, email: m.email || '', role: m.role, areaId: m.area_id, teamId: m.team_id, cargoId: m.cargo_id,
    leaderId: m.leader_id, status: m.status, createdAt: m.created_at };
}
function contar(sql, args) { try { return db.prepare(sql).get(...(args || [])).n || 0; } catch { return 0; } }
function uso() {
  const d = new Date(); const inicioMes = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return {
    desde: inicioMes,
    conversas: contar(`SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ?`, [inicioMes]),
    mensagens: contar(`SELECT COUNT(*) AS n FROM messages WHERE role = 'user' AND created_at >= ?`, [inicioMes]),
    respostas: contar(`SELECT COUNT(*) AS n FROM messages WHERE role != 'user' AND created_at >= ?`, [inicioMes]),
    execucoesEquipe: contar(`SELECT COUNT(*) AS n FROM team_steps WHERE kind = 'user' AND created_at >= ?`, [inicioMes]),
    agentesProprios: contar(`SELECT COUNT(*) AS n FROM agents WHERE kind = 'custom'`),
    agentesWorkspace: contar(`SELECT COUNT(*) AS n FROM agents WHERE in_workspace = 1`),
    equipesAgentes: contar(`SELECT COUNT(*) AS n FROM teams`),
    arquivos: contar(`SELECT COUNT(*) AS n FROM agent_files`),
    pdisAtivos: contar(`SELECT COUNT(*) AS n FROM pdis WHERE status = 'ativo'`),
    checkinsMes: contar(`SELECT COUNT(*) AS n FROM pdi_checkins WHERE created_at >= ?`, [inicioMes]),
  };
}
function tudo() {
  const sections = {};
  Object.keys(DEFAULTS).forEach(k => { sections[k] = secao(k); });
  return {
    owner: OWNER, sections, permissoesDef: PERMISSOES.map(([grupo, id, nome]) => ({ grupo, id, nome })),
    members: stmt.members.all().map(memberOut),
    units: stmt.units.all().map(u => ({ id: u.id, kind: u.kind, name: u.name, areaId: u.area_id })),
    audit: stmt.audit.all().map(a => ({ at: a.at, who: a.who, action: a.action, detail: a.detail })),
    usage: uso(),
  };
}

// ─── Router ──────────────────────────────────────────────────────────────────
const router = express.Router();
const erro = (res, c, m) => res.status(c).json({ error: m });

router.get('/', (_req, res) => res.json(tudo()));

router.patch('/section/:name', express.json({ limit: '1mb' }), (req, res) => {
  const nome = req.params.name;
  if (!DEFAULTS[nome] || nome === 'plano') return erro(res, 400, 'seção inválida');
  const b = (req.body && req.body.data) || {};
  const atual = secao(nome);
  if (nome === 'permissoes') {
    const def = permPadrao();
    const novo = {};
    Object.keys(def).forEach(id => {
      const v = b[id] || {};
      novo[id] = {};
      ['admin', 'gestor', 'membro'].forEach(r => { novo[id][r] = NIVEIS.includes(v[r]) ? v[r] : (atual[id] ? atual[id][r] : def[id][r]); });
    });
    salvar('permissoes', b.__reset ? {} : novo);
    log('Permissões', b.__reset ? 'Permissões restauradas para o padrão' : 'Matriz de permissões alterada');
    return res.json(tudo());
  }
  if (nome === 'agentes') {
    const out = Object.assign({}, atual);
    if (Array.isArray(b.categorias)) {
      const vistos = new Set();
      out.categorias = b.categorias.slice(0, 40).map(c => ({ id: String(c.id || newId()).slice(0, 40), name: String(c.name || '').trim().slice(0, 60) }))
        .filter(c => c.name && !vistos.has(c.name.toLowerCase()) && vistos.add(c.name.toLowerCase()));
    }
    if (Array.isArray(b.avisos)) {
      out.avisos = b.avisos.slice(0, 40).map(a => ({ id: String(a.id || newId()).slice(0, 40), assunto: String(a.assunto || '').trim().slice(0, 140),
        acao: ACOES_AVISO.includes(a.acao) ? a.acao : 'avisar', descricao: String(a.descricao || '').trim().slice(0, 500) })).filter(a => a.assunto);
    }
    salvar('agentes', { categorias: out.categorias, avisos: out.avisos });
    log('Agentes', b.__log || 'Configuração de agentes alterada');
    return res.json(tudo());
  }
  const out = Object.assign({}, atual);
  const mudou = [];
  Object.keys(DEFAULTS[nome]).forEach(k => {
    if (b[k] === undefined || k === 'identificador') return;
    let v = b[k];
    if (typeof DEFAULTS[nome][k] === 'boolean') v = !!v;
    else v = String(v).slice(0, k === 'logo' ? LIMITES.empresa.logo : 2000);
    if (k === 'logo' && v && !/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(v)) return;
    if (/^(primaria|acento|fundo)$/.test(k) && !/^#[0-9a-fA-F]{6}$/.test(v)) return;
    if (out[k] !== v) mudou.push(k);
    out[k] = v;
  });
  if (nome === 'empresa' && !String(out.nome || '').trim()) return erro(res, 400, 'o nome da empresa não pode ficar vazio');
  const salvoAntes = stmt.kv.get(nome); const base = salvoAntes ? parseJSON(salvoAntes.data, {}) : {};
  mudou.forEach(k => { base[k] = out[k]; });
  salvar(nome, base);
  if (mudou.length) log({ empresa: 'Dados da empresa', marca: 'Marca', prefs: 'Preferências', seguranca: 'Segurança', produtividade: 'Produtividade', okrs: 'OKRs', aprovacoes: 'Aprovações' }[nome] || nome, 'Campos alterados: ' + mudou.join(', '));
  res.json(tudo());
});

// Pedidos de upgrade / especialista: ficam no registro de atividades para o time comercial ver
router.post('/solicitacao', (req, res) => {
  const b = req.body || {};
  const tipo = b.tipo === 'especialista' ? 'Falar com especialista' : 'Solicitar upgrade';
  const plano = txt(b.plano, 40) || '';
  const msg = txt(b.mensagem, 1000) || '';
  const contato = txt(b.contato, 160) || '';
  log('Plano', `${tipo}${plano ? ' · plano ' + plano : ''}${contato ? ' · contato ' + contato : ''}${msg ? ' · ' + msg : ''}`);
  res.json(tudo());
});

// Pessoas
function validarMembro(b, atual) {
  const o = {};
  if (b.name !== undefined) { o.name = txt(b.name, 120); if (!o.name) return { err: 'informe o nome' }; }
  if (b.email !== undefined) { o.email = txt(b.email, 160).toLowerCase(); if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return { err: 'e-mail inválido' }; }
  if (b.role !== undefined) { if (!ROLES.includes(b.role) || b.role === 'owner') return { err: 'papel inválido' }; if (atual && atual.role === 'owner') return { err: 'o papel do proprietário não muda' }; o.role = b.role; }
  if (b.status !== undefined) { if (!STATUS.includes(b.status)) return { err: 'status inválido' }; if (atual && atual.role === 'owner' && b.status !== 'ativo') return { err: 'o proprietário não pode ser desativado' }; o.status = b.status; }
  ['areaId:area_id', 'teamId:team_id', 'cargoId:cargo_id'].forEach(par => {
    const [k, col] = par.split(':');
    if (b[k] !== undefined) o[col] = b[k] && stmt.unit.get(String(b[k])) ? String(b[k]) : null;
  });
  if (b.leaderId !== undefined) {
    const lid = b.leaderId ? String(b.leaderId) : null;
    if (lid && !stmt.member.get(lid)) return { err: 'líder não encontrado' };
    if (atual && lid === atual.id) return { err: 'a pessoa não pode liderar a si mesma' };
    // Evita ciclo: o novo líder não pode estar abaixo da pessoa
    if (atual && lid) { let cur = stmt.member.get(lid), passos = 0; while (cur && passos < 50) { if (cur.leader_id === atual.id) return { err: 'isso criaria um ciclo na liderança' }; cur = cur.leader_id ? stmt.member.get(cur.leader_id) : null; passos++; } }
    o.leader_id = lid;
  }
  return { o };
}
router.post('/members', (req, res) => {
  const b = req.body || {};
  const v = validarMembro(Object.assign({ role: 'membro' }, b), null);
  if (v.err) return erro(res, 400, v.err);
  if (!v.o.name) v.o.name = v.o.email ? v.o.email.split('@')[0] : '';
  if (!v.o.name) return erro(res, 400, 'informe nome ou e-mail');
  if (v.o.email && db.prepare(`SELECT id FROM org_members WHERE email = ?`).get(v.o.email)) return erro(res, 400, 'esse e-mail já está na empresa');
  const id = newId(), now = Date.now();
  db.prepare(`INSERT INTO org_members (id, name, email, role, area_id, team_id, cargo_id, leader_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, v.o.name, v.o.email || '', v.o.role || 'membro', v.o.area_id || null, v.o.team_id || null, v.o.cargo_id || null, v.o.leader_id || null, b.status === 'ativo' ? 'ativo' : 'convidado', now, now);
  log('Usuários', `Convite para ${v.o.name}${v.o.email ? ' (' + v.o.email + ')' : ''}`);
  res.json(tudo());
});
router.patch('/members/:id', (req, res) => {
  const m = stmt.member.get(req.params.id);
  if (!m) return erro(res, 404, 'pessoa não encontrada');
  const v = validarMembro(req.body || {}, m);
  if (v.err) return erro(res, 400, v.err);
  const k = Object.keys(v.o);
  if (k.length) db.prepare(`UPDATE org_members SET ${k.map(x => x + ' = @' + x).join(', ')}, updated_at = @now WHERE id = @id`).run(Object.assign({ id: m.id, now: Date.now() }, v.o));
  if (k.length) log(k.includes('leader_id') ? 'Liderança' : 'Usuários', `${m.name}: ${k.map(x => x.replace('_id', '')).join(', ')} alterado`);
  res.json(tudo());
});
router.delete('/members/:id', (req, res) => {
  const m = stmt.member.get(req.params.id);
  if (!m) return erro(res, 404, 'pessoa não encontrada');
  if (m.role === 'owner') return erro(res, 400, 'o proprietário não pode ser removido');
  db.prepare(`UPDATE org_members SET leader_id = ? WHERE leader_id = ?`).run(m.leader_id || null, m.id); // liderados sobem um nível
  db.prepare(`DELETE FROM org_members WHERE id = ?`).run(m.id);
  log('Usuários', `${m.name} removido`);
  res.json(tudo());
});

// Estrutura
router.post('/units', (req, res) => {
  const b = req.body || {};
  if (!KINDS.includes(b.kind)) return erro(res, 400, 'tipo inválido');
  const name = txt(b.name, 80);
  if (!name) return erro(res, 400, 'informe o nome');
  if (db.prepare(`SELECT id FROM org_units WHERE kind = ? AND lower(name) = lower(?)`).get(b.kind, name)) return erro(res, 400, 'já existe com esse nome');
  const n = contar(`SELECT COUNT(*) AS n FROM org_units WHERE kind = ?`, [b.kind]);
  db.prepare(`INSERT INTO org_units (id, kind, name, area_id, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), b.kind, name, b.areaId && stmt.unit.get(String(b.areaId)) ? String(b.areaId) : null, n, Date.now());
  log('Estrutura', `${{ area: 'Área', equipe: 'Equipe', cargo: 'Cargo' }[b.kind]} criada: ${name}`);
  res.json(tudo());
});
router.patch('/units/:id', (req, res) => {
  const u = stmt.unit.get(req.params.id);
  if (!u) return erro(res, 404, 'não encontrado');
  const b = req.body || {};
  const name = b.name !== undefined ? txt(b.name, 80) : u.name;
  if (!name) return erro(res, 400, 'informe o nome');
  const area = b.areaId !== undefined ? (b.areaId && stmt.unit.get(String(b.areaId)) ? String(b.areaId) : null) : u.area_id;
  db.prepare(`UPDATE org_units SET name = ?, area_id = ? WHERE id = ?`).run(name, area, u.id);
  if (name !== u.name) log('Estrutura', `${u.name} renomeada para ${name}`);
  res.json(tudo());
});
router.delete('/units/:id', (req, res) => {
  const u = stmt.unit.get(req.params.id);
  if (!u) return erro(res, 404, 'não encontrado');
  const col = { area: 'area_id', equipe: 'team_id', cargo: 'cargo_id' }[u.kind];
  db.prepare(`UPDATE org_members SET ${col} = NULL WHERE ${col} = ?`).run(u.id);
  db.prepare(`UPDATE org_units SET area_id = NULL WHERE area_id = ?`).run(u.id);
  db.prepare(`DELETE FROM org_units WHERE id = ?`).run(u.id);
  log('Estrutura', `${u.name} excluída`);
  res.json(tudo());
});

module.exports = { router };
