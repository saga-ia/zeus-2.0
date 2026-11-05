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

const acesso = require('./acesso');
const { notificar } = require('./notificacoes');
const { PERMISSOES, permPadrao, NIVEIS, pode, nivel, alcanca, negar } = acesso;
const OWNER = process.env.PDI_ME || 'Vinícius Nunes'; // nome de reserva quando ainda não há proprietário
const ROLES = ['owner', 'admin', 'gestor', 'membro'];
// pendente = convite feito por quem não é admin, aguardando aprovação (Configurações > Aprovações)
const STATUS = ['ativo', 'convidado', 'pendente', 'inativo'];
const KINDS = ['area', 'equipe', 'cargo'];
const newId = () => crypto.randomBytes(8).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const txt = (v, n) => (v === undefined || v === null) ? undefined : String(v).trim().slice(0, n);

// Ganchos do server.js para a senha (central_users mora no worker.db)
let hooks = { temLogin: () => false, removerLogin: () => {}, trocarEmailLogin: () => {} };
function configurar(h) { hooks = Object.assign(hooks, h || {}); }
const DEFAULTS = {
  empresa: { nome: 'Empresa de Vinícius', identificador: '', logo: '', fuso: 'America/Sao_Paulo', idioma: 'pt-BR',
    razao: '', fantasia: '', cnpj: '', cpfDono: '', funcionarios: '', segmento: '', emailFin: '', whatsFin: '' },
  marca: { primaria: '#17171A', acento: '#673DE6', fundo: '#FFFFFF', fonte: '', tom: '' },
  prefs: { membrosCriamAgentes: true, aprovarAgentesEmpresa: false, membrosConvidam: false, modeloPadrao: '', idiomaIA: 'pt-BR',
    retencaoDias: '365', resumoSemanal: true, canalResumo: 'email' },
  plano: { nome: 'Gratuito', assinatura: false, assentos: 10, ciclo: '', proxima: '', valor: 'Sob consulta' },
  seguranca: { sessaoDias: '30', dominios: '', bloquearExportacao: false, auditoria: true },
  produtividade: { valorHora: '80', minConversa: '12', minExecucaoEquipe: '90', minPdi: '20' },
  okrs: { ciclo: 'trimestral', inicio: '2026-07-01', cadencia: 'semanal', escala: '0-100', lembrete: true, alertaDias: '', iaSugerir: true, validarEncerramento: false, iaCheckin: false },
  // Notificações do sino por grupo de evento (ver notificacoes.js TIPOS) e canais de entrega
  comunicacao: { notifPessoas: true, notifRotinas: true, notifEquipes: true, notifAgentes: true, notifPdi: true, notifOkrs: true, canalEmail: false, canalWhatsapp: false },
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
// Registro de atividades com o autor real (quem estava logado)
function quemE(user) { return user ? (user.name || user.email || 'Administrador') : 'Sistema'; }
function registrar(action, detail, who) {
  if (secao('seguranca').auditoria === false) return;
  stmt.auditIns.run(newId(), Date.now(), who || 'Sistema', action, detail || '');
}
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
  // Pessoas não entram por seed: o Proprietário nasce no primeiro cadastro e os demais chegam por convite
})();

// ─── Leitura ─────────────────────────────────────────────────────────────────
function memberOut(m, verAcesso) {
  const o = { id: m.id, name: m.name, email: m.email || '', role: m.role, areaId: m.area_id, teamId: m.team_id, cargoId: m.cargo_id,
    leaderId: m.leader_id, status: m.status, createdAt: m.created_at, avatar: m.avatar || null };
  // Situação do acesso (quem administra pessoas enxerga): tem senha, convite em aberto, último acesso
  if (verAcesso) Object.assign(o, { temLogin: !!(m.email && hooks.temLogin(m.email)), conviteExpira: m.invite_expires || null,
    conviteAberto: !!m.invite_hash, convidadoPor: m.invited_by || null, aceitoEm: m.accepted_at || null, ultimoAcesso: m.last_seen || null, whatsapp: m.whatsapp || null });
  return o;
}
// Uso do mês por pessoa (e-mail): conversas, perguntas, execuções de equipe, rotinas e agentes criados
function porPessoa(desde) {
  const q = (sql, args) => { try { return db.prepare(sql).all(...(args || [])); } catch { return []; } };
  const mapa = {};
  const soma = (rows, campo) => rows.forEach(r => { const k = (r.e || '').toLowerCase(); if (!k) return; (mapa[k] = mapa[k] || {})[campo] = r.n; });
  soma(q(`SELECT user_email AS e, COUNT(*) AS n FROM sessions WHERE created_at >= ? GROUP BY user_email`, [desde]), 'conversas');
  soma(q(`SELECT s.user_email AS e, COUNT(*) AS n FROM messages m JOIN sessions s ON s.id = m.session_id WHERE m.role = 'user' AND m.created_at >= ? GROUP BY s.user_email`, [desde]), 'mensagens');
  soma(q(`SELECT r.user_email AS e, COUNT(*) AS n FROM team_steps t JOIN team_runs r ON r.id = t.run_id WHERE t.kind = 'user' AND t.created_at >= ? GROUP BY r.user_email`, [desde]), 'equipes');
  soma(q(`SELECT created_by AS e, COUNT(*) AS n FROM rotinas GROUP BY created_by`), 'rotinas');
  soma(q(`SELECT created_by AS e, COUNT(*) AS n FROM agents WHERE kind = 'custom' GROUP BY created_by`), 'agentes');
  // Agente mais usado no mês por pessoa
  const nomes = Object.fromEntries(q(`SELECT id, name FROM agents`).map(a => [a.id, a.name]));
  q(`SELECT user_email AS e, agent_id AS a, COUNT(*) AS n FROM sessions WHERE created_at >= ? AND agent_id IS NOT NULL GROUP BY user_email, agent_id ORDER BY n DESC`, [desde])
    .forEach(r => { const k = (r.e || '').toLowerCase(); if (!k) return; mapa[k] = mapa[k] || {}; if (!mapa[k].topAgente) mapa[k].topAgente = nomes[r.a] || r.a; });
  return mapa;
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
// O que cada um recebe: admin vê tudo; os demais não recebem registro de atividades, consumo por pessoa,
// dados financeiros (sem "Ver plano") nem a situação de acesso dos colegas (sem "Convidar").
const SECOES_ADMIN = ['seguranca', 'aprovacoes', 'produtividade', 'comunicacao'];
function tudo(user) {
  const admin = !user || user.admin;
  const verAcesso = admin || pode(user, 'convidar') || pode(user, 'desativar');
  const sections = {};
  Object.keys(DEFAULTS).forEach(k => {
    if (!admin && SECOES_ADMIN.includes(k)) return;
    if (k === 'plano' && !pode(user, 'ver-plano', { leitura: true })) return;
    sections[k] = secao(k);
  });
  if (!admin && sections.empresa) sections.empresa = Object.assign({}, sections.empresa, { razao: '', cnpj: '', cpfDono: '', emailFin: '', whatsFin: '' });
  if (!sections.plano) sections.plano = { nome: '', assinatura: false, assentos: 0, oculto: true };
  const usage = uso();
  if (admin) usage.porPessoa = porPessoa(usage.desde);
  return {
    owner: (stmt.members.all().find(m => m.role === 'owner') || {}).name || OWNER, sections, permissoesDef: PERMISSOES.map(([grupo, id, nome]) => ({ grupo, id, nome })),
    members: stmt.members.all().map(m => memberOut(m, verAcesso)),
    units: stmt.units.all().map(u => ({ id: u.id, kind: u.kind, name: u.name, areaId: u.area_id })),
    audit: admin ? stmt.audit.all().map(a => ({ at: a.at, who: a.who, action: a.action, detail: a.detail })) : [],
    usage: admin ? usage : { desde: usage.desde },
    conviteDias: acesso.CONVITE_DIAS,
  };
}

// ─── Router ──────────────────────────────────────────────────────────────────
const router = express.Router();
const erro = (res, c, m) => res.status(c).json({ error: m });

const soAdmin = (res) => erro(res, 403, 'Só administradores da conta podem fazer isso. Peça a um admin.');

router.get('/', (req, res) => res.json(tudo(req.user)));

router.patch('/section/:name', express.json({ limit: '1mb' }), (req, res) => {
  const nome = req.params.name;
  if (!DEFAULTS[nome] || nome === 'plano') return erro(res, 400, 'seção inválida');
  // Matriz de permissões: quem tem "Editar permissões". Demais seções: só Proprietário/Admin.
  if (nome === 'permissoes' && !pode(req.user, 'editar-permissoes')) return negar(res, req.user, 'editar-permissoes');
  if (nome !== 'permissoes' && !req.user.admin) return soAdmin(res);
  const who = quemE(req.user);
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
    registrar('Permissões', b.__reset ? 'Permissões restauradas para o padrão' : 'Matriz de permissões alterada', who);
    return res.json(tudo(req.user));
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
    registrar('Agentes', b.__log || 'Configuração de agentes alterada', who);
    return res.json(tudo(req.user));
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
  if (mudou.length) registrar({ empresa: 'Dados da empresa', marca: 'Marca', prefs: 'Preferências', seguranca: 'Segurança', produtividade: 'Produtividade', okrs: 'OKRs', aprovacoes: 'Aprovações', comunicacao: 'Comunicação' }[nome] || nome, 'Campos alterados: ' + mudou.join(', '), who);
  res.json(tudo(req.user));
});

// Pedidos de upgrade / especialista: ficam no registro de atividades para o time comercial ver
// Perfil do Negócio: respostas do Radar ZEUS. Fica salvo, reabre preenchido e entra no contexto de todos os agentes.
// Gravar é só Proprietário/Admin; ler é livre para quem está logado.
router.get('/negocio', (_req, res) => {
  const r = stmt.kv.get('negocio');
  res.json(r ? parseJSON(r.data, {}) : { campos: {}, atualizado_em: null });
});
router.put('/negocio', (req, res) => {
  if (!req.user.admin) return soAdmin(res);
  const who = quemE(req.user);
  const b = req.body || {}, campos = {};
  Object.entries(b.campos || {}).slice(0, 30).forEach(([k, v]) => { const t = txt(v, 4000); if (/^[\w-]{1,40}$/.test(k) && t) campos[k] = t; });
  if (!Object.keys(campos).length) return res.status(400).json({ error: 'preencha pelo menos um campo' });
  const dado = { campos, atualizado_em: Date.now(), por: (req.user && req.user.email) || OWNER };
  salvar('negocio', dado);
  registrar('Perfil do negócio', 'Atualizado pelo Radar ZEUS (' + Object.keys(campos).length + ' campos)', who);
  res.json(dado);
});

router.post('/solicitacao', (req, res) => {
  const who = quemE(req.user);
  const b = req.body || {};
  const tipo = b.tipo === 'especialista' ? 'Falar com especialista' : 'Solicitar upgrade';
  const plano = txt(b.plano, 40) || '';
  const msg = txt(b.mensagem, 1000) || '';
  const contato = txt(b.contato, 160) || '';
  registrar('Plano', `${tipo}${plano ? ' · plano ' + plano : ''}${contato ? ' · contato ' + contato : ''}${msg ? ' · ' + msg : ''}`, who);
  res.json(tudo(req.user));
});

// Pessoas
const PAPEL = acesso.PAPEL_NOME;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function dominioPermitido(email) {
  const lista = String(secao('seguranca').dominios || '').split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  return !lista.length || lista.includes(String(email).split('@')[1] || '');
}
// WhatsApp guardado só com dígitos, com DDI. DDD + número sem DDI: assume Brasil (+55).
function normWhats(v) {
  let num = String(v || '').replace(/\D/g, '');
  if (num.length === 10 || num.length === 11) num = '55' + num;
  if (num && (num.length < 12 || num.length > 15)) return { err: 'WhatsApp inválido: use DDD + número, ex. (81) 99999-9999' };
  return { num };
}
const cargoValido = id => { const u = id && stmt.unit.get(String(id)); return !!(u && u.kind === 'cargo'); };
function validarMembro(b, atual) {
  const o = {};
  if (b.whatsapp !== undefined) { const w = normWhats(b.whatsapp); if (w.err) return { err: w.err }; o.whatsapp = w.num || null; }
  // Obrigatórios (e-mail, cargo, WhatsApp): na edição, não deixa apagar o que já estava preenchido
  if (atual) {
    if (b.email !== undefined && !String(b.email).trim() && atual.email) return { err: 'o e-mail é obrigatório' };
    if (b.cargoId !== undefined && !b.cargoId && atual.cargo_id) return { err: 'o cargo é obrigatório' };
    if (o.whatsapp === null && atual.whatsapp) return { err: 'o WhatsApp é obrigatório' };
  }
  if (b.name !== undefined) { o.name = txt(b.name, 120); if (!o.name) return { err: 'informe o nome' }; }
  if (b.email !== undefined) { o.email = txt(b.email, 160).toLowerCase(); if (o.email && !EMAIL_RE.test(o.email)) return { err: 'e-mail inválido' }; }
  if (b.role !== undefined) { if (!ROLES.includes(b.role) || b.role === 'owner') return { err: 'papel inválido' }; if (atual && atual.role === 'owner') return { err: 'o papel do proprietário não muda' }; o.role = b.role; }
  if (b.status !== undefined) {
    if (!['ativo', 'inativo'].includes(b.status) && !(atual && b.status === atual.status)) return { err: 'status inválido (para convidar, use o link de convite)' };
    if (atual && atual.role === 'owner' && b.status !== 'ativo') return { err: 'o proprietário não pode ser desativado' };
    o.status = b.status;
  }
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
// Quem mexe em quem: o Proprietário só é editado por ele mesmo; um Administrador só pelo Proprietário
// (outro admin ainda ajusta área, equipe, cargo e líder dele); ninguém muda o próprio papel ou status.
function travaHierarquia(user, alvo, campos) {
  if (alvo.role === 'owner' && user.role !== 'owner') return 'Só o proprietário edita o próprio cadastro.';
  const sensiveis = campos.filter(c => ['role', 'status', 'email'].includes(c));
  if (alvo.role === 'admin' && user.role !== 'owner' && user.memberId !== alvo.id && sensiveis.length) return 'Só o proprietário muda papel, status ou e-mail de um administrador.';
  if (user.memberId === alvo.id && campos.some(c => c === 'role' || c === 'status')) return 'Você não pode mudar o próprio papel nem o próprio status.';
  return null;
}
const respostaCom = (req, extra) => Object.assign(tudo(req.user), extra || {});

router.post('/members', (req, res) => {
  const user = req.user, who = quemE(user);
  if (!pode(user, 'convidar')) return negar(res, user, 'convidar');
  const b = req.body || {};
  const v = validarMembro(Object.assign({ role: 'membro' }, b, { status: undefined }), null);
  if (v.err) return erro(res, 400, v.err);
  if (!user.admin && v.o.role !== 'membro') return erro(res, 403, 'Só administradores convidam gestores ou administradores.');
  if (!v.o.email) return erro(res, 400, 'o e-mail é obrigatório');
  if (!cargoValido(b.cargoId)) return erro(res, 400, 'o cargo é obrigatório');
  if (!v.o.whatsapp) return erro(res, 400, 'o WhatsApp é obrigatório');
  if (!v.o.name) v.o.name = v.o.email.split('@')[0];
  if (v.o.email && db.prepare(`SELECT id FROM org_members WHERE lower(email) = ?`).get(v.o.email)) return erro(res, 400, 'esse e-mail já está na empresa');
  if (v.o.email && !dominioPermitido(v.o.email)) return erro(res, 400, 'domínio de e-mail fora dos permitidos em Configurações > Segurança');
  // Com e-mail vira convite (link); sem e-mail entra só no organograma, sem acesso à central
  const precisaAprovar = !!v.o.email && !user.admin && secao('aprovacoes').convites !== false;
  const status = !v.o.email ? 'ativo' : precisaAprovar ? 'pendente' : 'convidado';
  const id = newId(), now = Date.now();
  db.prepare(`INSERT INTO org_members (id, name, email, role, area_id, team_id, cargo_id, leader_id, status, invited_by, whatsapp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, v.o.name, v.o.email || '', v.o.role || 'membro', v.o.area_id || null, v.o.team_id || null, v.o.cargo_id || null, v.o.leader_id || null, status, who, v.o.whatsapp, now, now);
  if (precisaAprovar) {
    registrar('Usuários', `Convite para ${v.o.name} (${v.o.email}) aguardando aprovação`, who);
    notificar({ para: 'admins', tipo: 'convite-pendente', titulo: `Convite aguardando aprovação: ${v.o.name}`, texto: `${who} convidou ${v.o.email} como ${PAPEL[v.o.role || 'membro']}. Aprove em Usuários.`, link: '/config/usuarios' });
    return res.json(respostaCom(req, { aguardandoAprovacao: true }));
  }
  const convite = acesso.gerarConvite(id, who);
  registrar('Usuários', `Convite para ${v.o.name} (${v.o.email}) como ${PAPEL[v.o.role || 'membro']}`, who);
  res.json(respostaCom(req, { convite: Object.assign(convite, { nome: v.o.name, email: v.o.email }) }));
});

// Gera um novo link (o anterior deixa de valer). Em convite pendente, é a aprovação: só administradores.
router.post('/members/:id/convite', (req, res) => {
  const user = req.user, who = quemE(user);
  const m = stmt.member.get(req.params.id);
  if (!m) return erro(res, 404, 'pessoa não encontrada');
  if (!pode(user, 'convidar')) return negar(res, user, 'convidar');
  if (m.status === 'pendente' && !user.admin) return erro(res, 403, 'Este convite aguarda aprovação de um administrador.');
  if (m.role === 'owner') return erro(res, 400, 'o proprietário já tem acesso');
  if ((m.role === 'admin' || m.role === 'gestor') && !user.admin) return erro(res, 403, 'Só administradores convidam gestores ou administradores.');
  if (m.status === 'inativo') return erro(res, 400, 'reative a pessoa antes de gerar um convite');
  if (!m.email) return erro(res, 400, 'cadastre o e-mail da pessoa antes de gerar o convite');
  if (!dominioPermitido(m.email)) return erro(res, 400, 'domínio de e-mail fora dos permitidos em Configurações > Segurança');
  if (m.status === 'ativo' && hooks.temLogin(m.email)) return erro(res, 400, 'essa pessoa já tem acesso. Se esqueceu a senha, use "Esqueci minha senha" no login.');
  const convite = acesso.gerarConvite(m.id, m.status === 'pendente' ? (m.invited_by || who) : who);
  registrar('Usuários', m.status === 'pendente' ? `Convite de ${m.name} aprovado` : `Novo link de convite para ${m.name}`, who);
  res.json(respostaCom(req, { convite: Object.assign(convite, { nome: m.name, email: m.email }) }));
});

router.patch('/members/:id', (req, res) => {
  const user = req.user, who = quemE(user);
  const m = stmt.member.get(req.params.id);
  if (!m) return erro(res, 404, 'pessoa não encontrada');
  const v = validarMembro(req.body || {}, m);
  if (v.err) return erro(res, 400, v.err);
  // Só o que realmente muda conta para permissão e registro
  const k = Object.keys(v.o).filter(c => (v.o[c] || null) !== (m[c] || null));
  if (!k.length) return res.json(respostaCom(req));
  const trava = travaHierarquia(user, m, k);
  if (trava) return erro(res, 403, trava);
  for (const c of k) {
    if (c === 'role') {
      if (!pode(user, 'editar-permissoes')) return negar(res, user, 'editar-permissoes');
      if ((v.o.role === 'admin' || m.role === 'admin') && !user.admin) return erro(res, 403, 'Só administradores definem quem é administrador.');
    } else if (c === 'status') {
      if (!pode(user, 'desativar')) return negar(res, user, 'desativar');
    } else if (c === 'name' || c === 'email' || c === 'whatsapp') {
      const convitePendente = m.status === 'convidado' || m.status === 'pendente';
      if (!user.admin && !(convitePendente && pode(user, 'convidar'))) return erro(res, 403, 'Só administradores alteram nome e e-mail de quem já está na empresa.');
      if (c === 'email' && v.o.email) {
        if (db.prepare(`SELECT id FROM org_members WHERE lower(email) = ? AND id != ?`).get(v.o.email, m.id)) return erro(res, 400, 'esse e-mail já está na empresa');
        if (!dominioPermitido(v.o.email)) return erro(res, 400, 'domínio de e-mail fora dos permitidos em Configurações > Segurança');
      }
    } else if (c === 'leader_id') {
      if (!alcanca(user, 'definir-lideranca', m.id)) return negar(res, user, 'definir-lideranca');
    } else if (!alcanca(user, 'definir-equipe', m.id)) return negar(res, user, 'definir-equipe');
  }
  const o = Object.fromEntries(k.map(c => [c, v.o[c]]));
  db.prepare(`UPDATE org_members SET ${k.map(x => x + ' = @' + x).join(', ')}, updated_at = @now WHERE id = @id`).run(Object.assign({ id: m.id, now: Date.now() }, o));
  // E-mail é o login: troca a senha de endereço junto e derruba as sessões antigas. Convite em aberto perde a validade.
  if (k.includes('email')) {
    if (m.email) hooks.trocarEmailLogin(m.email, v.o.email);
    if (m.invite_hash) db.prepare(`UPDATE org_members SET invite_hash = NULL, invite_expires = NULL WHERE id = ?`).run(m.id);
  }
  const rotulo = { role: 'papel', status: 'status', name: 'nome', email: 'e-mail', area_id: 'área', team_id: 'equipe', cargo_id: 'cargo', leader_id: 'líder', whatsapp: 'WhatsApp' };
  const detalhe = k.map(c => c === 'role' ? `papel ${PAPEL[m.role]} → ${PAPEL[v.o.role]}` : c === 'status' ? `status ${m.status} → ${v.o.status}` : rotulo[c] + ' alterado').join(', ');
  registrar(k.includes('leader_id') && k.length === 1 ? 'Liderança' : k.includes('role') ? 'Permissões' : 'Usuários', `${m.name}: ${detalhe}`, who);
  if (m.email && (k.includes('role') || k.includes('status'))) {
    const msg = k.includes('role') ? `Seu papel agora é ${PAPEL[v.o.role]}` : (v.o.status === 'inativo' ? 'Seu acesso foi desativado' : 'Seu acesso foi reativado');
    notificar({ para: v.o.email || m.email, tipo: 'acesso-alterado', titulo: msg, texto: `Alterado por ${who}.`, link: '/config/prefs', exceto: user.email });
  }
  res.json(respostaCom(req));
});

router.delete('/members/:id', (req, res) => {
  const user = req.user, who = quemE(user);
  const m = stmt.member.get(req.params.id);
  if (!m) return erro(res, 404, 'pessoa não encontrada');
  if (!pode(user, 'remover')) return negar(res, user, 'remover');
  if (m.role === 'owner') return erro(res, 400, 'o proprietário não pode ser removido');
  if (m.role === 'admin' && user.role !== 'owner') return erro(res, 403, 'Só o proprietário remove um administrador.');
  if (user.memberId === m.id) return erro(res, 400, 'você não pode remover a si mesmo');
  db.prepare(`UPDATE org_members SET leader_id = ? WHERE leader_id = ?`).run(m.leader_id || null, m.id); // liderados sobem um nível
  db.prepare(`DELETE FROM org_members WHERE id = ?`).run(m.id);
  if (m.email) hooks.removerLogin(m.email); // apaga a senha e derruba as sessões
  registrar('Usuários', `${m.name}${m.email ? ' (' + m.email + ')' : ''} removido`, who);
  res.json(respostaCom(req));
});

// Foto de perfil: cada pessoa troca a própria (Preferências > Meu perfil). Imagem pequena em data URL.
const LIMITE_FOTO = 200000;
router.put('/me/avatar', express.json({ limit: '1mb' }), (req, res) => {
  const user = req.user;
  if (!user.memberId) return erro(res, 400, 'Entre com seu e-mail para ter foto de perfil (a senha mestra não tem cadastro).');
  const foto = String((req.body || {}).avatar || '');
  if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(foto)) return erro(res, 400, 'envie uma imagem PNG, JPG ou WebP');
  if (foto.length > LIMITE_FOTO) return erro(res, 400, 'imagem grande demais');
  db.prepare(`UPDATE org_members SET avatar = ?, updated_at = ? WHERE id = ?`).run(foto, Date.now(), user.memberId);
  res.json(respostaCom(req));
});
router.delete('/me/avatar', (req, res) => {
  if (!req.user.memberId) return erro(res, 400, 'sem cadastro');
  db.prepare(`UPDATE org_members SET avatar = NULL, updated_at = ? WHERE id = ?`).run(Date.now(), req.user.memberId);
  res.json(respostaCom(req));
});

// Meu perfil: WhatsApp e cargo (obrigatórios). A pessoa escolhe o próprio cargo só enquanto não tem um;
// depois, quem troca é quem pode "definir equipe" (Usuários > Editar).
router.put('/me/perfil', (req, res) => {
  const user = req.user, who = quemE(user);
  if (!user.memberId) return erro(res, 400, 'Entre com seu e-mail para completar o perfil (a senha mestra não tem cadastro).');
  const m = stmt.member.get(user.memberId);
  if (!m) return erro(res, 404, 'cadastro não encontrado');
  const b = req.body || {};
  const w = normWhats(b.whatsapp);
  if (w.err) return erro(res, 400, w.err);
  if (!w.num) return erro(res, 400, 'o WhatsApp é obrigatório');
  let cargo = m.cargo_id;
  if (b.cargoId !== undefined && (b.cargoId || null) !== (m.cargo_id || null)) {
    if (!cargoValido(b.cargoId)) return erro(res, 400, 'o cargo é obrigatório');
    if (m.cargo_id && !alcanca(user, 'definir-equipe', m.id)) return erro(res, 403, 'Seu cargo já foi definido. Para trocar, fale com um administrador.');
    cargo = String(b.cargoId);
  }
  if (!cargo) return erro(res, 400, 'o cargo é obrigatório');
  const mudou = [w.num !== m.whatsapp && 'WhatsApp', cargo !== m.cargo_id && 'cargo'].filter(Boolean);
  if (!mudou.length) return res.json(respostaCom(req));
  db.prepare(`UPDATE org_members SET whatsapp = ?, cargo_id = ?, updated_at = ? WHERE id = ?`).run(w.num, cargo, Date.now(), m.id);
  registrar('Usuários', `${m.name}: ${mudou.join(' e ')} atualizado no próprio perfil`, who);
  res.json(respostaCom(req));
});

// Estrutura
router.use('/units', (req, res, next) => (req.method === 'GET' || pode(req.user, 'criar-equipes') ? next() : negar(res, req.user, 'criar-equipes')));
router.post('/units', (req, res) => {
  const who = quemE(req.user);
  const b = req.body || {};
  if (!KINDS.includes(b.kind)) return erro(res, 400, 'tipo inválido');
  const name = txt(b.name, 80);
  if (!name) return erro(res, 400, 'informe o nome');
  if (db.prepare(`SELECT id FROM org_units WHERE kind = ? AND lower(name) = lower(?)`).get(b.kind, name)) return erro(res, 400, 'já existe com esse nome');
  const n = contar(`SELECT COUNT(*) AS n FROM org_units WHERE kind = ?`, [b.kind]);
  db.prepare(`INSERT INTO org_units (id, kind, name, area_id, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(newId(), b.kind, name, b.areaId && stmt.unit.get(String(b.areaId)) ? String(b.areaId) : null, n, Date.now());
  registrar('Estrutura', `${{ area: 'Área', equipe: 'Equipe', cargo: 'Cargo' }[b.kind]} criada: ${name}`, who);
  res.json(respostaCom(req));
});
router.patch('/units/:id', (req, res) => {
  const who = quemE(req.user);
  const u = stmt.unit.get(req.params.id);
  if (!u) return erro(res, 404, 'não encontrado');
  const b = req.body || {};
  const name = b.name !== undefined ? txt(b.name, 80) : u.name;
  if (!name) return erro(res, 400, 'informe o nome');
  const area = b.areaId !== undefined ? (b.areaId && stmt.unit.get(String(b.areaId)) ? String(b.areaId) : null) : u.area_id;
  db.prepare(`UPDATE org_units SET name = ?, area_id = ? WHERE id = ?`).run(name, area, u.id);
  if (name !== u.name) registrar('Estrutura', `${u.name} renomeada para ${name}`, who);
  res.json(respostaCom(req));
});
router.delete('/units/:id', (req, res) => {
  const who = quemE(req.user);
  const u = stmt.unit.get(req.params.id);
  if (!u) return erro(res, 404, 'não encontrado');
  const col = { area: 'area_id', equipe: 'team_id', cargo: 'cargo_id' }[u.kind];
  db.prepare(`UPDATE org_members SET ${col} = NULL WHERE ${col} = ?`).run(u.id);
  db.prepare(`UPDATE org_units SET area_id = NULL WHERE area_id = ?`).run(u.id);
  db.prepare(`DELETE FROM org_units WHERE id = ?`).run(u.id);
  registrar('Estrutura', `${u.name} excluída`, who);
  res.json(respostaCom(req));
});

// Nome e logo da empresa (com os padrões aplicados) para o /api/me e a tela de convite
function empresaInfo() { const e = secao('empresa'); return { nome: e.nome || 'ZEUS', logo: e.logo || '' }; }
module.exports = { router, configurar, registrar, empresaInfo, secao };
