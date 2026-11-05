// Notificações do sino (canto inferior da sidebar): eventos da plataforma viram avisos para pessoas
// específicas (por e-mail), para os administradores ou para quem tem determinado nome no cadastro.
// Quais tipos chegam é definido em Configurações > Comunicação (seção 'comunicacao' do config_kv).
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS notificacoes (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT,
  link TEXT,
  chave TEXT,
  lida INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notificacoes(user_email, lida, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_chave ON notificacoes(chave);
`);

// Tipos de notificação: [id, grupo, rótulo, descrição, chave em Configurações > Comunicação]
const TIPOS = [
  ['convite-aceito', 'PESSOAS', 'Pessoa entrou na central', 'Avisa os administradores quando alguém aceita o convite.', 'notifPessoas'],
  ['convite-pendente', 'PESSOAS', 'Convite aguardando aprovação', 'Avisa os administradores quando um gestor convida alguém.', 'notifPessoas'],
  ['acesso-alterado', 'PESSOAS', 'Meu papel ou acesso mudou', 'Avisa a pessoa quando o papel dela muda ou o acesso é desativado/reativado.', 'notifPessoas'],
  ['rotina-concluida', 'AUTOMAÇÃO', 'Rotina concluída', 'Avisa quem criou a rotina quando ela termina com sucesso.', 'notifRotinas'],
  ['rotina-erro', 'AUTOMAÇÃO', 'Rotina com erro', 'Avisa quem criou a rotina quando a execução falha.', 'notifRotinas'],
  ['linkedin-plano', 'AUTOMAÇÃO', 'Plano da semana do LinkedIn', 'Avisa os administradores quando o ZEUS monta os rascunhos da semana pela estratégia do LinkedIn.', 'notifRotinas'],
  ['equipe-concluida', 'AUTOMAÇÃO', 'Equipe de agentes entregou', 'Avisa quem abriu a execução quando a equipe termina o pedido.', 'notifEquipes'],
  ['agente-compartilhado', 'AGENTES', 'Agente ou equipe compartilhado comigo', 'Avisa as pessoas escolhidas em "Compartilhar com pessoas específicas".', 'notifAgentes'],
  ['pdi-criado', 'PESSOAS', 'PDI criado para mim', 'Avisa a pessoa quando um gestor cria o PDI dela.', 'notifPdi'],
  ['pdi-feedback', 'PESSOAS', 'Pedido de feedback', 'Avisa quem recebe um pedido de feedback em um PDI.', 'notifPdi'],
  ['pdi-evidencia', 'PESSOAS', 'Evidência validada ou recusada', 'Avisa a pessoa do PDI quando uma entrega é avaliada.', 'notifPdi'],
  ['okr-kr-parado', 'OKRS', 'Resultado-chave parado', 'Avisa o responsável quando um KR passa do prazo de check-in (uma vez por semana).', 'notifOkrs'],
  ['okr-checkin', 'OKRS', 'Check-in em objetivo meu', 'Avisa o dono do objetivo quando outra pessoa registra check-in.', 'notifOkrs'],
];
const TIPO = Object.fromEntries(TIPOS.map(t => [t[0], t]));
const newId = () => crypto.randomBytes(8).toString('base64url');
const norm = s => String(s || '').trim().toLowerCase();

function cfg() { try { return require('./config').secao('comunicacao'); } catch (_) { return {}; } }
function ligado(tipo) { const t = TIPO[tipo]; if (!t) return true; const c = cfg(); return c[t[4]] !== false; }

const stmt = {
  membros: db.prepare(`SELECT name, email, role, status FROM org_members WHERE email != '' AND status = 'ativo'`),
  ins: db.prepare(`INSERT INTO notificacoes (id, user_email, tipo, titulo, texto, link, chave, lida, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`),
  jaTem: db.prepare(`SELECT id FROM notificacoes WHERE chave = ? AND user_email = ?`),
  lista: db.prepare(`SELECT id, tipo, titulo, texto, link, lida, created_at FROM notificacoes WHERE user_email = ? ORDER BY created_at DESC LIMIT 50`),
  naoLidas: db.prepare(`SELECT COUNT(*) AS n FROM notificacoes WHERE user_email = ? AND lida = 0`),
  lida: db.prepare(`UPDATE notificacoes SET lida = 1 WHERE id = ? AND user_email = ?`),
  todasLidas: db.prepare(`UPDATE notificacoes SET lida = 1 WHERE user_email = ? AND lida = 0`),
  del: db.prepare(`DELETE FROM notificacoes WHERE id = ? AND user_email = ?`),
  limpar: db.prepare(`DELETE FROM notificacoes WHERE created_at < ?`),
};

// Resolve o destinatário: e-mail, lista de e-mails, 'admins' ou nome de pessoa do cadastro
function destinos(para) {
  if (Array.isArray(para)) return [...new Set(para.flatMap(destinos))];
  const p = String(para || '').trim();
  if (!p) return [];
  const membros = stmt.membros.all();
  if (p === 'admins') return membros.filter(m => m.role === 'owner' || m.role === 'admin').map(m => norm(m.email));
  if (p.includes('@')) return [norm(p)];
  const m = membros.find(x => norm(x.name) === norm(p));
  return m ? [norm(m.email)] : [];
}

// notificar({ para, tipo, titulo, texto, link, chave, exceto }) — exceto: e-mail de quem causou o evento (não avisa a si mesmo)
function notificar(o) {
  try {
    if (!o || !TIPO[o.tipo] || !ligado(o.tipo)) return 0;
    const agora = Date.now();
    let n = 0;
    destinos(o.para).filter(e => e && e !== norm(o.exceto)).forEach(email => {
      if (o.chave && stmt.jaTem.get(o.chave + ':' + email, email)) return;
      stmt.ins.run(newId(), email, o.tipo, String(o.titulo || '').slice(0, 160), String(o.texto || '').slice(0, 500), o.link ? String(o.link).slice(0, 300) : null, o.chave ? o.chave + ':' + email : null, agora);
      n++;
    });
    return n;
  } catch (e) { console.error('[notificacoes]', e.message); return 0; }
}

// KR parado: uma vez por semana por resultado-chave, para o responsável
function varrerOkrs() {
  try {
    if (require('./config').secao('okrs').lembrete === false) return; // Configurações > OKRs > "Avisar o responsável"
    const okrs = require('./okrs');
    const parados = okrs.krsParados ? okrs.krsParados() : [];
    const semana = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    parados.forEach(k => notificar({ para: k.owner, tipo: 'okr-kr-parado', titulo: `KR parado: ${k.title}`, texto: `Sem check-in há ${k.dias} dias · objetivo "${k.objetivo}"`, link: '/okrs', chave: `kr-parado:${k.id}:${semana}` }));
    stmt.limpar.run(Date.now() - 90 * 24 * 3600 * 1000); // notificações com mais de 90 dias saem
  } catch (e) { console.error('[notificacoes] okrs', e.message); }
}
setTimeout(varrerOkrs, 90 * 1000); setInterval(varrerOkrs, 6 * 3600 * 1000);

const router = express.Router();
router.get('/', (req, res) => {
  const email = req.user && req.user.email;
  if (!email) return res.json({ itens: [], naoLidas: 0 });
  res.json({ itens: stmt.lista.all(email), naoLidas: stmt.naoLidas.get(email).n });
});
router.post('/lidas', (req, res) => { if (req.user.email) stmt.todasLidas.run(req.user.email); res.json({ ok: true }); });
router.post('/:id/lida', (req, res) => { if (req.user.email) stmt.lida.run(req.params.id, req.user.email); res.json({ ok: true }); });
router.delete('/:id', (req, res) => { if (req.user.email) stmt.del.run(req.params.id, req.user.email); res.json({ ok: true }); });

module.exports = { router, notificar, TIPOS, varrerOkrs };
