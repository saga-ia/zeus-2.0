const axios = require('axios');
const { getDb } = require('../db');
const { open } = require('./crypto');

const GRAPH = 'https://graph.facebook.com/v19.0';

// Métricas válidas no Graph API v19+ (Meta mudou nomes em 2025):
//   saved (não "saves"), views (substitui "plays"/"impressions" pra reels).
// Referência: erro (#100) devolvido pela própria API lista os nomes aceitos.
async function fetchIgInsights(mediaId, token, postType = null) {
  // Stories expõem um conjunto próprio de métricas (sem likes/saved) e sempre
  // somem 24h após a publicação.
  const metricsList = postType === 'story' ? [
    'reach,replies,exits,taps_forward,taps_back,views',
    'impressions,reach,replies,exits,taps_forward,taps_back',
    'reach,replies'
  ] : [
    // 1ª tentativa: cobre feed/reels/imagem novos
    'reach,likes,comments,saved,shares,views,total_interactions',
    // 2ª: fallback pra mídias antigas que ainda expõem impressions
    'impressions,reach,likes,comments,saved,shares,total_interactions',
    // 3ª: mínimo garantido
    'reach,likes,comments,saved'
  ];
  let lastErr = null;
  for (const metric of metricsList) {
    try {
      const r = await axios.get(`${GRAPH}/${mediaId}/insights`, {
        params: { metric, access_token: token }
      });
      const data = r.data.data || [];
      const flat = {};
      // parse padrão: data[].values[0].value
      for (const m of data) flat[m.name] = m.values?.[0]?.value || 0;
      return flat;
    } catch (err) {
      lastErr = err;
      const code = err.response?.data?.error?.code;
      const msg = err.response?.data?.error?.message || '';
      // erro 100 = métrica inválida pro tipo de mídia → tenta próxima combinação
      // erro 190 = OAuthException (token) → aborta, próximas não vão adiantar
      if (code === 190 || /permission|OAuthException|does not exist/i.test(msg)) break;
    }
  }
  throw lastErr;
}

async function fetchIgMediaPermalink(mediaId, token) {
  const r = await axios.get(`${GRAPH}/${mediaId}`, {
    params: { fields: 'permalink,media_type,media_product_type,thumbnail_url', access_token: token }
  });
  return r.data;
}

async function collectPostAnalytics({ maxAgeDays = 30, staleHours = 6 } = {}) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const minPublishedAt = now - maxAgeDays * 86400;

  // resultados publicados no IG que ainda não têm analytics ou estão desatualizados.
  // Prioriza o token que foi usado no publish (não quebra se a conta reautorizou depois).
  // Stories morrem 24h após publicar: depois disso a Graph API devolve erro e
  // não adianta seguir tentando — são excluídos da fila de coleta.
  const results = db.prepare(`
    SELECT pr.id AS result_id, pr.post_id, pr.account_id, pr.platform, pr.platform_post_id,
           pr.published_at, p.post_type,
           COALESCE(pr.access_token_used, sa.access_token) AS access_token
    FROM post_results pr
    INNER JOIN social_accounts sa ON sa.id = pr.account_id
    INNER JOIN posts p ON p.id = pr.post_id
    WHERE pr.platform = 'instagram'
      AND pr.status = 'published'
      AND pr.platform_post_id IS NOT NULL
      AND pr.published_at >= ?
      AND (p.post_type != 'story' OR pr.published_at >= ?)
      AND NOT EXISTS (
        SELECT 1 FROM post_analytics pa
        WHERE pa.post_result_id = pr.id
          AND pa.collected_at > ?
      )
    ORDER BY pr.published_at DESC
    LIMIT 100
  `).all(minPublishedAt, now - 24 * 3600, now - staleHours * 3600);

  if (!results.length) return { collected: 0 };

  let collected = 0, failed = 0;
  const errors = [];
  for (const r of results) {
    try {
      const token = open(r.access_token); // tokens ficam criptografados no banco
      const insights = await fetchIgInsights(r.platform_post_id, token, r.post_type);
      const meta = await fetchIgMediaPermalink(r.platform_post_id, token).catch(() => ({}));

      const views = insights.views || insights.plays || insights.impressions || 0;
      const saves = insights.saved ?? insights.saves ?? 0; // Meta v19 renomeou saves→saved
      db.prepare(`INSERT INTO post_analytics
        (post_result_id, account_id, platform, platform_post_id, likes, comments, shares, views, reach, impressions, saves,
         replies, exits, taps_forward, taps_back, collected_at, permalink)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, unixepoch(), ?)`).run(
        r.result_id, r.account_id, r.platform, r.platform_post_id,
        insights.likes || 0, insights.comments || 0, insights.shares || 0,
        views, insights.reach || 0, insights.impressions || 0, saves,
        insights.replies || 0, insights.exits || 0,
        insights.taps_forward || 0, insights.taps_back || 0,
        meta.permalink || null
      );
      collected++;
    } catch (err) {
      failed++;
      const msg = err.response?.data?.error?.message || err.message;
      errors.push({ post_id: r.platform_post_id, error: msg });
      console.error(`[analytics] post ${r.platform_post_id}: ${msg}`);
    }
  }
  return { collected, failed, total: results.length, errors: errors.slice(0, 5) };
}

// accountId opcional: restringe todas as contagens à conta específica.
function getAnalyticsSummary(db, accountId = null) {
  const acctFilter = accountId ? ' AND pr.account_id = ?' : '';
  const acctParams = accountId ? [accountId] : [];

  // Publicados: conta por post_result (1 publicação por conta). Sem filtro de
  // conta, DISTINCT no post_id evita contar 2× quando 2 contas publicam o mesmo.
  const totalPosts = accountId
    ? db.prepare(`SELECT COUNT(*) as c FROM post_results WHERE status='published' AND account_id=?`).get(accountId).c
    : db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='published'").get().c;

  // Agendados: soma posts.status='scheduled' + bulk_campaign_items pending.
  // Bulk items só viram linha em `posts` NO momento do publish (via
  // processItem), então contá-los aqui é a única forma de refletir a
  // quantidade real que está na fila.
  let scheduledPosts, bulkPending;
  if (accountId) {
    scheduledPosts = db.prepare(`SELECT COUNT(DISTINCT p.id) as c FROM posts p
      WHERE p.status='scheduled' AND EXISTS (
        SELECT 1 FROM json_each(p.account_ids) je WHERE je.value = ?
      )`).get(String(accountId)).c;
    bulkPending = db.prepare(`SELECT COUNT(*) as c FROM bulk_campaign_items bi
      INNER JOIN bulk_campaigns bc ON bc.id = bi.campaign_id
      WHERE bi.status='pending' AND EXISTS (
        SELECT 1 FROM json_each(bc.account_ids) je WHERE je.value = ?
      )`).get(String(accountId)).c;
  } else {
    scheduledPosts = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='scheduled'").get().c;
    bulkPending = db.prepare("SELECT COUNT(*) as c FROM bulk_campaign_items WHERE status='pending'").get().c;
  }
  const scheduled = scheduledPosts + bulkPending;

  // Falhas: post_results com status='failed' + bulk items com status='failed'.
  let failedResults, bulkFailed;
  if (accountId) {
    failedResults = db.prepare("SELECT COUNT(*) as c FROM post_results WHERE status='failed' AND account_id=?").get(accountId).c;
    bulkFailed = db.prepare(`SELECT COUNT(*) as c FROM bulk_campaign_items bi
      INNER JOIN bulk_campaigns bc ON bc.id = bi.campaign_id
      WHERE bi.status='failed' AND EXISTS (
        SELECT 1 FROM json_each(bc.account_ids) je WHERE je.value = ?
      )`).get(String(accountId)).c;
  } else {
    failedResults = db.prepare("SELECT COUNT(*) as c FROM post_results WHERE status='failed'").get().c;
    bulkFailed = db.prepare("SELECT COUNT(*) as c FROM bulk_campaign_items WHERE status='failed'").get().c;
  }
  const failed = failedResults + bulkFailed;

  const drafts = db.prepare("SELECT COUNT(*) as c FROM posts WHERE status='draft'").get().c;

  const totals = db.prepare(`SELECT
    COALESCE(SUM(p.likes),0) as likes, COALESCE(SUM(p.comments),0) as comments,
    COALESCE(SUM(p.shares),0) as shares, COALESCE(SUM(p.saves),0) as saves,
    COALESCE(SUM(p.views),0) as views, COALESCE(SUM(p.reach),0) as reach,
    COALESCE(SUM(p.impressions),0) as impressions
    FROM (
      SELECT pa.post_result_id, MAX(pa.collected_at) as latest FROM post_analytics pa
      INNER JOIN post_results pr ON pr.id = pa.post_result_id
      WHERE 1=1 ${acctFilter}
      GROUP BY pa.post_result_id
    ) latest
    JOIN post_analytics p ON p.post_result_id = latest.post_result_id AND p.collected_at = latest.latest`)
    .get(...acctParams);

  const byPlatform = db.prepare(`SELECT platform, COUNT(DISTINCT post_result_id) as count,
    COALESCE(SUM(likes),0) as likes, COALESCE(SUM(views),0) as views, COALESCE(SUM(reach),0) as reach
    FROM (
      SELECT p.post_result_id, p.platform, p.likes, p.views, p.reach, p.collected_at, pr.account_id,
        ROW_NUMBER() OVER (PARTITION BY p.post_result_id ORDER BY p.collected_at DESC) rn
      FROM post_analytics p
      INNER JOIN post_results pr ON pr.id = p.post_result_id
    ) WHERE rn = 1 ${accountId ? 'AND account_id = ?' : ''} GROUP BY platform`).all(...acctParams);

  return { totalPosts, scheduled, drafts, failed, totals, byPlatform };
}

function getBestHoursHeatmap(db) {
  // heatmap 7 dias × 24 horas: média de reach por hora e dia da semana
  const rows = db.prepare(`SELECT
      pr.published_at,
      pa.reach, pa.views, pa.likes
    FROM post_results pr
    INNER JOIN (
      SELECT post_result_id, MAX(collected_at) as latest FROM post_analytics GROUP BY post_result_id
    ) l ON l.post_result_id = pr.id
    INNER JOIN post_analytics pa ON pa.post_result_id = pr.id AND pa.collected_at = l.latest
    WHERE pr.status = 'published' AND pr.platform = 'instagram' AND pr.published_at IS NOT NULL`).all();

  // matriz 7x24
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(null).map(() => ({ reach: 0, count: 0 })));
  for (const r of rows) {
    const d = new Date(r.published_at * 1000);
    const dow = d.getDay();
    const hour = d.getHours();
    const val = r.reach || r.views || 0;
    matrix[dow][hour].reach += val;
    matrix[dow][hour].count += 1;
  }

  const heat = matrix.map(row => row.map(cell => cell.count ? Math.round(cell.reach / cell.count) : 0));

  // top 5 melhores horários
  const flat = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    if (heat[d][h] > 0) flat.push({ dow: d, hour: h, avg_reach: heat[d][h], samples: matrix[d][h].count });
  }
  flat.sort((a, b) => b.avg_reach - a.avg_reach);
  const topHours = flat.slice(0, 5);

  return { heatmap: heat, top_hours: topHours, total_samples: rows.length };
}

function getRecentPostsWithMetrics(db, limit = 20, accountId = null) {
  const acctFilter = accountId ? ' AND pr.account_id = ?' : '';
  const params = accountId ? [accountId, limit] : [limit];
  return db.prepare(`SELECT
      p.id as post_id, p.title, p.caption, p.media_path, p.media_type, p.post_type, p.published_at,
      pr.id as result_id, pr.platform, pr.platform_post_id, pr.status as pub_status,
      pa.likes, pa.comments, pa.shares, pa.views, pa.reach, pa.impressions, pa.saves, pa.permalink,
      sa.platform_username, sa.id as account_id
    FROM posts p
    INNER JOIN post_results pr ON pr.post_id = p.id
    LEFT JOIN social_accounts sa ON sa.id = pr.account_id
    LEFT JOIN (
      SELECT post_result_id, MAX(collected_at) as latest FROM post_analytics GROUP BY post_result_id
    ) l ON l.post_result_id = pr.id
    LEFT JOIN post_analytics pa ON pa.post_result_id = pr.id AND pa.collected_at = l.latest
    WHERE pr.status = 'published' ${acctFilter}
    ORDER BY pr.published_at DESC LIMIT ?`).all(...params);
}

function getPostDetails(db, postId) {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return null;
  // colunas explícitas: pr.* traria access_token_used pra resposta da API
  const results = db.prepare(`SELECT pr.id, pr.post_id, pr.account_id, pr.platform, pr.platform_post_id,
      pr.status, pr.error_message, pr.published_at, sa.platform_username, sa.platform_name
    FROM post_results pr LEFT JOIN social_accounts sa ON sa.id = pr.account_id
    WHERE pr.post_id = ?`).all(postId);
  for (const r of results) {
    const latest = db.prepare(`SELECT * FROM post_analytics WHERE post_result_id = ?
      ORDER BY collected_at DESC LIMIT 1`).get(r.id);
    r.analytics = latest || null;
  }
  post.platforms = JSON.parse(post.platforms || '[]');
  post.account_ids = JSON.parse(post.account_ids || '[]');
  post.results = results;
  return post;
}

module.exports = {
  collectPostAnalytics, getAnalyticsSummary, getBestHoursHeatmap, getRecentPostsWithMetrics, getPostDetails
};
