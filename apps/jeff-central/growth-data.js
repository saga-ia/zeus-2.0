// Motor de Growth: camada de dados de mídia paga (só leitura).
// Une as duas fontes que já existiam em sites separados:
//   - tokens do worker (app_settings.jeff_meta_user_token / system_token) → contas do ads.propostaebcmkt2026.shop
//   - clientes do metadash (data/clients.json, cada um com token próprio)  → contas do metadash.jefersonhenrike.com
// Tokens nunca saem daqui: as respostas levam só id, nome e números.
const fs = require('fs');
const Database = require('better-sqlite3');

const GRAPH = 'https://graph.facebook.com/v19.0';
const WORKER_DB = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';
const METADASH_CLIENTS = process.env.METADASH_CLIENTS || '/opt/jeff-apps/jeff-meta-dashboard/data/clients.json';
const CACHE_MS = 10 * 60 * 1000;

const num = (v) => Number(v) || 0;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const actId = (id) => String(id || '').replace(/^act_/, '');

// ─── credenciais ─────────────────────────────────────────────────────────────
function workerSettings(keys) {
  try {
    const db = new Database(WORKER_DB, { readonly: true, fileMustExist: true });
    const out = {}; keys.forEach((k) => { const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k); out[k] = r ? r.value : null; });
    db.close(); return out;
  } catch (_) { return {}; }
}
function metadashClients() {
  try { const j = JSON.parse(fs.readFileSync(METADASH_CLIENTS, 'utf8')); return (Array.isArray(j) ? j : j.clients || []).filter((c) => c.meta_account_id && c.meta_access_token); }
  catch (_) { return []; }
}

async function graph(path, params, token) {
  const u = new URL(GRAPH + '/' + path);
  Object.entries(params || {}).forEach(([k, v]) => { if (v != null) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v)); });
  u.searchParams.set('access_token', token);
  const r = await fetch(u, { signal: AbortSignal.timeout(45000) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.message || 'erro da Meta'); e.code = j.error.code; throw e; }
  return j;
}
async function graphAll(path, params, token, maxPages) {
  const out = []; let next = null;
  for (let i = 0; i < (maxPages || 5); i++) {
    const j = next ? await fetch(next, { signal: AbortSignal.timeout(45000) }).then((r) => r.json()) : await graph(path, params, token);
    if (j.error) throw new Error(j.error.message);
    out.push(...(j.data || [])); next = j.paging && j.paging.next; if (!next) break;
  }
  return out;
}

// ─── contas ──────────────────────────────────────────────────────────────────
let _accCache = null, _accAt = 0;
const _tokens = new Map(); // account_id → token (memória do processo)
async function listAccounts(force) {
  if (!force && _accCache && Date.now() - _accAt < CACHE_MS) return _accCache;
  const s = workerSettings(['jeff_meta_user_token', 'jeff_meta_system_token', 'jeff_ads_account_id', 'jeff_meta_user_token_expires_at']);
  const accounts = new Map(); const avisos = [], falhas = [];
  for (const [nome, tok] of [['token de sistema', s.jeff_meta_system_token], ['token do usuário', s.jeff_meta_user_token]]) {
    if (!tok) continue;
    try {
      const rows = await graphAll('me/adaccounts', { fields: 'account_id,name,account_status,currency,timezone_name,business{name}', limit: 200 }, tok, 3);
      rows.forEach((a) => { if (accounts.has(a.account_id)) return; _tokens.set(a.account_id, tok);
        accounts.set(a.account_id, { id: a.account_id, name: a.name, group: (a.business && a.business.name) || 'Pessoal', currency: a.currency || 'BRL', active: a.account_status === 1, source: 'ads' }); });
    } catch (e) { const exp = /expired on \w+, (\d{2})-(\w{3})-(\d{2})/.exec(e.message); falhas.push(exp ? `${nome} expirou em ${exp[1]}/${({ Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' })[exp[2]] || exp[2]}/20${exp[3]}` : `${nome} falhou (${e.message})`); }
  }
  // clientes do metadash têm prioridade: nome do cliente e token dedicado
  metadashClients().forEach((c) => { const id = actId(c.meta_account_id); _tokens.set(id, c.meta_access_token);
    const cur = accounts.get(id) || { id, currency: 'BRL', active: true };
    accounts.set(id, Object.assign(cur, { name: c.name, group: 'Clientes (metadash)', source: 'metadash', logo: c.logo_url || null })); });
  const list = [...accounts.values()].sort((a, b) => (a.source === 'metadash' ? 0 : 1) - (b.source === 'metadash' ? 0 : 1) || Number(b.active) - Number(a.active) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const vencido = s.jeff_meta_user_token_expires_at && new Date(s.jeff_meta_user_token_expires_at) < new Date();
  if (falhas.length || vencido) avisos.push('Tokens da Meta pedem renovação: ' + falhas.concat(vencido ? ['a validade registrada do token do usuário passou em ' + s.jeff_meta_user_token_expires_at.split('-').reverse().join('/') + ' (ele ainda responde, mas pode cair)'] : []).join('; ') + '. Os dados seguem vindo pelos tokens que ainda funcionam.');
  _accCache = { accounts: list, default_id: actId(s.jeff_ads_account_id) || (list[0] && list[0].id) || null, avisos };
  _accAt = Date.now(); return _accCache;
}
async function tokenFor(id) { id = actId(id); if (!_tokens.has(id)) await listAccounts(true); const t = _tokens.get(id); if (!t) throw new Error('Conta ' + id + ' não está acessível por nenhum token.'); return t; }

// ─── período ─────────────────────────────────────────────────────────────────
const PRESETS = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
function resolveRange(q) {
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); hoje.setHours(0, 0, 0, 0);
  let since, until, label;
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.since || '') && /^\d{4}-\d{2}-\d{2}$/.test(q.until || '')) { since = new Date(q.since + 'T00:00'); until = new Date(q.until + 'T00:00'); label = q.since.split('-').reverse().join('/') + ' a ' + q.until.split('-').reverse().join('/'); }
  else if (q.preset === 'mes') { since = new Date(hoje.getFullYear(), hoje.getMonth(), 1); until = hoje; label = 'Este mês'; }
  else if (q.preset === 'mes_passado') { since = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); until = new Date(hoje.getFullYear(), hoje.getMonth(), 0); label = 'Mês passado'; }
  else { const n = PRESETS[q.preset] || 30; until = new Date(hoje); until.setDate(until.getDate() - 1); since = new Date(until); since.setDate(since.getDate() - (n - 1)); label = 'Últimos ' + n + ' dias'; }
  if (until < since) until = since;
  const dias = Math.round((until - since) / 86400000) + 1;
  const pu = new Date(since); pu.setDate(pu.getDate() - 1); const ps = new Date(pu); ps.setDate(ps.getDate() - (dias - 1));
  return { since: ymd(since), until: ymd(until), dias, label, prev: { since: ymd(ps), until: ymd(pu) } };
}

// ─── leitura das ações ───────────────────────────────────────────────────────
// `lead` já é o agregado da Meta (formulário + pixel + conversões): somar com os tipos específicos conta em dobro.
const LEAD_PRIORIDADE = ['lead', 'onsite_conversion.lead_grouped', 'leadgen_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen.other'];
const act = (actions, tipos) => { for (const t of tipos) { const a = (actions || []).find((x) => x.action_type === t); if (a && num(a.value) > 0) return num(a.value); } return 0; };
const leads = (a) => act(a, LEAD_PRIORIDADE);
const conversas = (a) => act(a, ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d']);
const compras = (a) => act(a, ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']);
const receita = (av) => act(av, ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']);
const linkClicks = (a) => act(a, ['link_click']);
const lpViews = (a) => act(a, ['landing_page_view']);
const metrics = (d) => { d = d || {}; const spend = num(d.spend), l = leads(d.actions), c = conversas(d.actions), p = compras(d.actions), rev = receita(d.action_values), imp = num(d.impressions), clk = num(d.clicks);
  return { spend, impressions: imp, reach: num(d.reach), clicks: clk, link_clicks: linkClicks(d.actions), lp_views: lpViews(d.actions), leads: l, conversas: c, compras: p, receita: rev,
    ctr: imp ? (clk / imp) * 100 : 0, cpc: clk ? spend / clk : 0, cpm: imp ? (spend / imp) * 1000 : 0, frequency: num(d.frequency), cpl: l ? spend / l : 0, custo_conversa: c ? spend / c : 0, cpa: p ? spend / p : 0, roas: spend ? rev / spend : 0 }; };
const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0);

const OBJ = { OUTCOME_TRAFFIC: 'Tráfego', LINK_CLICKS: 'Tráfego', OUTCOME_AWARENESS: 'Alcance', REACH: 'Alcance', BRAND_AWARENESS: 'Alcance', OUTCOME_ENGAGEMENT: 'Engajamento', POST_ENGAGEMENT: 'Engajamento', PAGE_LIKES: 'Engajamento', VIDEO_VIEWS: 'Engajamento',
  MESSAGES: 'Mensagens', OUTCOME_LEADS: 'Leads', LEAD_GENERATION: 'Leads', OUTCOME_SALES: 'Vendas', CONVERSIONS: 'Vendas', PRODUCT_CATALOG_SALES: 'Vendas', OUTCOME_APP_PROMOTION: 'App', APP_INSTALLS: 'App' };

// ─── dashboard consolidado de uma conta Meta ─────────────────────────────────
const _dash = new Map();
async function metaDashboard(accountId, q, force) {
  const id = actId(accountId), range = resolveRange(q || {}), key = id + '|' + range.since + '|' + range.until;
  const hit = _dash.get(key); if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const token = await tokenFor(id), acc = 'act_' + id;
  const tr = { since: range.since, until: range.until }, F = 'spend,impressions,clicks,reach,frequency,actions,action_values';
  const [sumR, prevR, dayR, ageR, genR, regR, campR, adR, metaR] = await Promise.allSettled([
    graph(acc + '/insights', { fields: F, time_range: tr, level: 'account' }, token),
    graph(acc + '/insights', { fields: F, time_range: range.prev, level: 'account' }, token),
    graphAll(acc + '/insights', { fields: F, time_range: tr, level: 'account', time_increment: 1, limit: 100 }, token, 2),
    graph(acc + '/insights', { fields: 'spend,impressions,clicks,reach,actions', time_range: tr, level: 'account', breakdowns: 'age', limit: 20 }, token),
    graph(acc + '/insights', { fields: 'spend,impressions,clicks,reach,actions', time_range: tr, level: 'account', breakdowns: 'gender', limit: 10 }, token),
    graph(acc + '/insights', { fields: 'spend,impressions,clicks,reach,actions', time_range: tr, level: 'account', breakdowns: 'region', limit: 60 }, token),
    graphAll(acc + '/insights', { fields: 'campaign_id,campaign_name,' + F, time_range: tr, level: 'campaign', limit: 100 }, token, 4),
    graphAll(acc + '/insights', { fields: 'ad_id,ad_name,adset_name,campaign_name,' + F, time_range: tr, level: 'ad', sort: ['spend_descending'], limit: 100 }, token, 2),
    graphAll(acc + '/campaigns', { fields: 'id,objective,effective_status,daily_budget,lifetime_budget', limit: 200 }, token, 3),
  ]);
  if (sumR.status === 'rejected') throw sumR.reason;
  const val = (r, d) => (r.status === 'fulfilled' ? r.value : d);
  const total = metrics((val(sumR, {}).data || [])[0]), anterior = metrics((val(prevR, {}).data || [])[0]);
  const campMeta = Object.fromEntries(val(metaR, []).map((c) => [c.id, c]));

  const campanhas = val(campR, []).map((c) => { const m = campMeta[c.campaign_id] || {}; return Object.assign({ id: c.campaign_id, name: c.campaign_name, objetivo: OBJ[m.objective] || 'Outros', status: m.effective_status || null, orcamento_diario: m.daily_budget ? num(m.daily_budget) / 100 : null }, metrics(c)); }).sort((a, b) => b.spend - a.spend);
  const porObjetivo = Object.values(campanhas.reduce((o, c) => { const g = (o[c.objetivo] = o[c.objetivo] || { objetivo: c.objetivo, spend: 0, leads: 0, conversas: 0, compras: 0, clicks: 0, impressions: 0, campanhas: 0 }); g.spend += c.spend; g.leads += c.leads; g.conversas += c.conversas; g.compras += c.compras; g.clicks += c.clicks; g.impressions += c.impressions; g.campanhas++; return o; }, {})).sort((a, b) => b.spend - a.spend);

  const ads = val(adR, []).map((a) => Object.assign({ id: a.ad_id, name: a.ad_name, adset: a.adset_name, campanha: a.campaign_name }, metrics(a))).sort((a, b) => b.spend - a.spend);
  const top = ads.slice(0, 12);
  if (top.length) { try { const objs = await graphAll(acc + '/ads', { fields: 'id,creative{thumbnail_url,image_url}', filtering: [{ field: 'id', operator: 'IN', value: top.map((a) => a.id) }], limit: 12 }, token, 1); const th = Object.fromEntries(objs.map((o) => [o.id, o.creative && (o.creative.image_url || o.creative.thumbnail_url)])); top.forEach((a) => { a.thumb = th[a.id] || null; }); } catch (_) {} }

  const rot = (v) => (/^unknown$/i.test(v) ? 'Não informado' : String(v || '').replace(/ \(state\)$/i, ''));
  const demo = (rows, k) => (rows || []).map((d) => ({ chave: k === 'gender' ? d[k] : rot(d[k]), spend: num(d.spend), impressions: num(d.impressions), reach: num(d.reach), clicks: num(d.clicks), leads: leads(d.actions) }));
  const delta = Object.fromEntries(['spend', 'impressions', 'reach', 'clicks', 'leads', 'conversas', 'compras', 'receita', 'ctr', 'cpc', 'cpm', 'cpl'].map((k) => [k, pct(total[k], anterior[k])]));

  // saúde da conta e recomendações (mesmas regras dos dois sites, unificadas)
  let score = 100; const motivos = [], recs = [];
  const resultado = total.leads + total.conversas + total.compras;
  // o resultado que a conta realmente busca é o de maior volume: conta de WhatsApp não pode ser julgada por CPL
  const princ = [['leads', 'leads', 'lead'], ['conversas', 'conversas', 'conversa'], ['compras', 'compras', 'compra']].sort((a, b) => total[b[0]] - total[a[0]])[0];
  const qtd = total[princ[0]], custo = qtd ? total.spend / qtd : 0, custoAnt = anterior[princ[0]] ? anterior.spend / anterior[princ[0]] : 0;
  const br = (v, c) => v.toFixed(c == null ? 2 : c).replace('.', ',');
  if (total.frequency > 2.5) { score -= 15; motivos.push('frequência alta (' + br(total.frequency, 1) + ')'); recs.push({ p: 'alta', t: 'Frequência em ' + br(total.frequency, 1) + ': o público está saturando. Renove criativos ou amplie a audiência.' }); }
  if (total.impressions && total.ctr < 1) { score -= 15; motivos.push('CTR de ' + br(total.ctr) + '%'); recs.push({ p: total.ctr < 0.5 ? 'alta' : 'media', t: 'CTR de ' + br(total.ctr) + '%, abaixo de 1%. O criativo não está parando o scroll: teste novos ganchos nos 3 primeiros segundos.' }); }
  if (qtd >= 10 && delta[princ[0]] < -10 && delta.spend > 5) { score -= 20; motivos.push(princ[1] + ' caindo com gasto subindo'); recs.push({ p: 'alta', t: 'As ' + princ[1] + ' caíram ' + Math.abs(delta[princ[0]]).toFixed(0) + '% enquanto o gasto subiu ' + delta.spend.toFixed(0) + '%. Revise criativos e público antes de escalar.' }); }
  if (qtd >= 10 && custoAnt && custo > custoAnt * 1.3) { score -= 10; motivos.push('custo por ' + princ[2] + ' subiu'); recs.push({ p: 'alta', t: 'O custo por ' + princ[2] + ' foi de R$ ' + br(custoAnt) + ' para R$ ' + br(custo) + ' (' + pct(custo, custoAnt).toFixed(0) + '% a mais). Veja quais anúncios puxaram a alta.' }); }
  if (delta.reach < -25) { score -= 10; motivos.push('alcance caindo'); recs.push({ p: 'media', t: 'Alcance caiu ' + Math.abs(delta.reach).toFixed(0) + '% contra o período anterior. Amplie público ou orçamento.' }); }
  if (princ[0] === 'leads' && qtd >= 5 && custo > 50) { score -= 10; motivos.push('CPL de R$ ' + br(custo)); recs.push({ p: 'alta', t: 'CPL em R$ ' + br(custo) + '. Revise segmentação, oferta e a página de destino.' }); }
  if (total.link_clicks > 50 && total.lp_views > 20 && total.conversas < total.lp_views && total.lp_views / total.link_clicks < 0.6) { score -= 10; motivos.push('perda entre clique e página'); recs.push({ p: 'media', t: 'Só ' + ((total.lp_views / total.link_clicks) * 100).toFixed(0) + '% dos cliques chegam a carregar a página. Verifique velocidade e o pixel.' }); }
  const queimando = ads.filter((a) => a.spend > 100 && a.leads + a.conversas + a.compras < 2);
  if (queimando.length) recs.push({ p: 'media', t: queimando.length + ' anúncio(s) gastaram mais de R$ 100 com menos de 2 resultados: ' + queimando.slice(0, 3).map((a) => '"' + a.name + '"').join(', ') + '. Avalie pausar.' });
  if (total.spend > 0 && !resultado) recs.push({ p: 'alta', t: 'Há investimento mas nenhum lead, conversa ou compra registrado. Confira se o evento de conversão está configurado.' });
  if (!recs.length) recs.push({ p: 'ok', t: 'Conta saudável, sem alertas críticos no período.' });

  const conta = (await listAccounts()).accounts.find((a) => a.id === id) || { id, name: id, currency: 'BRL' };
  const data = { plataforma: 'meta', conta, periodo: range, total, anterior, delta, saude: { score: Math.max(0, score), motivos }, recomendacoes: recs,
    // a Meta omite os dias sem entrega: a série sai completa, com zero nesses dias
    serie: (() => { const porDia = Object.fromEntries(val(dayR, []).map((d) => [d.date_start, metrics(d)])); const out = []; const d = new Date(range.since + 'T12:00'), fim = new Date(range.until + 'T12:00');
      while (d <= fim) { const k = ymd(d); out.push(Object.assign({ data: k }, porDia[k] || metrics({}))); d.setDate(d.getDate() + 1); } return out; })(),
    funil: [{ etapa: 'Impressões', valor: total.impressions }, { etapa: 'Alcance', valor: total.reach }, { etapa: 'Cliques', valor: total.clicks }, { etapa: 'Cliques no link', valor: total.link_clicks }, { etapa: 'Visitas à página', valor: total.lp_views > 20 ? total.lp_views : 0 }, { etapa: 'Resultados', valor: resultado }].filter((f, i) => i < 3 || f.valor > 0),
    tipos_resultado: [{ tipo: 'Cadastros (leads)', valor: total.leads }, { tipo: 'Conversas iniciadas', valor: total.conversas }, { tipo: 'Compras', valor: total.compras }].filter((t) => t.valor > 0),
    campanhas, por_objetivo: porObjetivo, idade: demo(val(ageR, {}).data, 'age'), genero: demo(val(genR, {}).data, 'gender'),
    regioes: demo(val(regR, {}).data, 'region').sort((a, b) => b.reach - a.reach).slice(0, 12), top_anuncios: top, anuncios: ads.slice(0, 60), gerado_em: Date.now() };
  _dash.set(key, { at: Date.now(), data }); if (_dash.size > 60) _dash.delete(_dash.keys().next().value);
  return data;
}

// Google Ads: não há credencial no servidor (developer token, customer id e OAuth com escopo adwords).
function googleStatus() {
  const s = workerSettings(['google_ads_developer_token', 'google_ads_customer_id', 'google_ads_refresh_token']);
  const falta = Object.entries({ 'developer token da API do Google Ads': s.google_ads_developer_token, 'ID da conta (customer id)': s.google_ads_customer_id, 'autorização OAuth com escopo adwords': s.google_ads_refresh_token }).filter(([, v]) => !v).map(([k]) => k);
  return { conectado: !falta.length, falta };
}

module.exports = { listAccounts, metaDashboard, googleStatus, resolveRange };
