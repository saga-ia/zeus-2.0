// Visão unificada da agenda.
//
// Por que existe: os itens de campanha em massa só viram linha na tabela
// `posts` no instante em que o worker publica (lib/bulk.js → processItem).
// Antes disso eles existem apenas em `bulk_campaign_items`. Resultado: uma
// campanha com 300 publicações programadas não aparecia no calendário nem nos
// contadores — o dado simplesmente não existia ainda.
//
// Este módulo lê as DUAS origens e devolve uma agenda única. É só leitura:
// nada aqui altera o fluxo de publicação.
const { getDb } = require('../db');

const STATUS_ITEM_TO_POST = {
  pending: 'scheduled',
  processing: 'publishing',
  published: 'published',
  failed: 'failed'
};

// Normaliza post_type → tipo exibido na interface
function tipoDePost(postType, postFormat) {
  const v = postType || postFormat;
  if (v === 'story') return 'story';
  if (v === 'carousel') return 'carousel';
  if (v === 'video' || v === 'reel') return 'reel';
  return 'feed';
}

/**
 * Agenda unificada.
 * @param {object} f  { account_id, from, to, status, type, limit }
 *   from/to em epoch segundos. account_id filtra por conta do Instagram.
 */
function getSchedule(f = {}) {
  const db = getDb();
  const from = f.from ? Number(f.from) : null;
  const to = f.to ? Number(f.to) : null;
  const accountId = f.account_id ? Number(f.account_id) : null;
  const limit = Math.min(Number(f.limit) || 2000, 5000);

  // ===== 1. posts avulsos e já materializados =====
  const cond = ["p.status != 'deleted'"];
  const params = [];
  if (from) { cond.push('COALESCE(p.scheduled_at, p.published_at, p.created_at) >= ?'); params.push(from); }
  if (to)   { cond.push('COALESCE(p.scheduled_at, p.published_at, p.created_at) <= ?'); params.push(to); }

  const posts = db.prepare(`
    SELECT p.id, p.title, p.caption, p.media_path, p.media_type, p.post_type,
           p.account_ids, p.scheduled_at, p.published_at, p.created_at, p.status
    FROM posts p
    WHERE ${cond.join(' AND ')}
    ORDER BY COALESCE(p.scheduled_at, p.created_at) ASC
    LIMIT ?`).all(...params, limit);

  const eventos = [];
  for (const p of posts) {
    let ids = [];
    try { ids = JSON.parse(p.account_ids || '[]'); } catch {}
    if (accountId && !ids.includes(accountId)) continue;
    eventos.push({
      origem: 'post',
      id: p.id,
      post_id: p.id,
      campaign_id: null,
      titulo: p.title || null,
      caption: p.caption || '',
      quando: p.scheduled_at || p.published_at || p.created_at,
      status: p.status,
      tipo: tipoDePost(p.post_type),
      account_ids: ids,
      media_url: p.media_path && String(p.media_path).startsWith('/uploads/') ? p.media_path : null,
      editavel: p.status === 'draft' || p.status === 'scheduled'
    });
  }

  // ===== 2. itens de campanha ainda não materializados =====
  // (os que já têm post_id aparecem acima; evita duplicar o mesmo agendamento)
  const cond2 = ['bi.post_id IS NULL'];
  const params2 = [];
  if (from) { cond2.push('bi.scheduled_at >= ?'); params2.push(from); }
  if (to)   { cond2.push('bi.scheduled_at <= ?'); params2.push(to); }

  const itens = db.prepare(`
    SELECT bi.id, bi.campaign_id, bi.scheduled_at, bi.status, bi.drive_meta, bi.error_message,
           bc.name AS campaign_name, bc.post_format, bc.account_ids, bc.status AS campaign_status
    FROM bulk_campaign_items bi
    INNER JOIN bulk_campaigns bc ON bc.id = bi.campaign_id
    WHERE ${cond2.join(' AND ')}
    ORDER BY bi.scheduled_at ASC
    LIMIT ?`).all(...params2, limit);

  for (const it of itens) {
    let ids = [];
    try { ids = JSON.parse(it.account_ids || '[]'); } catch {}
    if (accountId && !ids.includes(accountId)) continue;

    let meta = {};
    try { meta = JSON.parse(it.drive_meta || '{}'); } catch {}
    const files = Array.isArray(meta.files) ? meta.files : [];

    // campanha pausada/rascunho: o item não vai sair no horário previsto
    const paradaPorCampanha = it.campaign_status !== 'active' && it.status === 'pending';

    eventos.push({
      origem: 'campanha',
      id: `c${it.campaign_id}i${it.id}`,
      item_id: it.id,
      post_id: null,
      campaign_id: it.campaign_id,
      titulo: it.campaign_name,
      caption: '',
      quando: it.scheduled_at,
      status: paradaPorCampanha ? 'paused' : (STATUS_ITEM_TO_POST[it.status] || it.status),
      tipo: tipoDePost(null, it.post_format),
      account_ids: ids,
      media_name: meta.name || meta.groupName || meta.folderName || files[0]?.name || null,
      media_url: meta.url || files[0]?.url || null,
      error_message: it.error_message || null,
      editavel: false
    });
  }

  // ===== 3. filtros comuns e ordenação =====
  let out = eventos;
  if (f.status) {
    const alvos = String(f.status).split(',').map(s => s.trim()).filter(Boolean);
    out = out.filter(e => alvos.includes(e.status));
  }
  if (f.type) {
    const alvos = String(f.type).split(',').map(s => s.trim()).filter(Boolean);
    out = out.filter(e => alvos.includes(e.tipo));
  }
  out.sort((a, b) => (a.quando || 0) - (b.quando || 0));
  return out;
}

/**
 * Números do Dashboard, com os mesmos filtros da agenda.
 * Conta agendamentos de campanha que ainda não viraram post — que era a
 * origem dos contadores errados.
 */
function getSummary(f = {}) {
  const db = getDb();
  const agenda = getSchedule({ ...f, limit: 5000 });
  const agora = Math.floor(Date.now() / 1000);

  const contar = (s) => agenda.filter(e => e.status === s).length;

  const proximas = agenda
    .filter(e => (e.status === 'scheduled') && e.quando >= agora)
    .slice(0, 8);

  const falhasRecentes = agenda
    .filter(e => e.status === 'failed')
    .sort((a, b) => (b.quando || 0) - (a.quando || 0))
    .slice(0, 5);

  const ultimas = agenda
    .filter(e => e.status === 'published')
    .sort((a, b) => (b.quando || 0) - (a.quando || 0))
    .slice(0, 8);

  // contas: total, com token perto de vencer e as que precisam reconectar
  const contas = db.prepare(`SELECT id, platform, platform_username, platform_name, profile_picture,
    followers, status, token_expires_at FROM social_accounts`).all();
  const precisamReconectar = contas.filter(c =>
    c.status === 'expiring' || (c.token_expires_at && c.token_expires_at < agora + 7 * 86400));

  const campanhas = db.prepare(`SELECT status, COUNT(*) c FROM bulk_campaigns GROUP BY status`).all();
  const porStatus = Object.fromEntries(campanhas.map(r => [r.status, r.c]));

  // heartbeat do scheduler: mostra se algo está de fato processando a fila
  const hb = db.prepare("SELECT value FROM settings WHERE key = 'worker_heartbeat'").get()?.value;
  const hbIdade = hb ? agora - parseInt(hb, 10) : null;

  return {
    agendadas: contar('scheduled'),
    publicadas: contar('published'),
    falhas: contar('failed'),
    rascunhos: contar('draft'),
    pausadas: contar('paused'),
    campanhas_ativas: porStatus.active || 0,
    campanhas_total: campanhas.reduce((s, r) => s + r.c, 0),
    contas_total: contas.length,
    contas_reconectar: precisamReconectar.map(c => ({
      id: c.id, username: c.platform_username, motivo: c.status === 'expiring' ? 'token expirando' : 'token vence em menos de 7 dias'
    })),
    proximas, ultimas, falhas_recentes: falhasRecentes,
    scheduler: {
      ativo: hbIdade !== null && hbIdade < 150,
      segundos_desde_ultimo_tick: hbIdade
    },
    atualizado_em: agora
  };
}

module.exports = { getSchedule, getSummary };
