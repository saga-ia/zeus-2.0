// Criar anúncio na Meta pela Central (Growth > Criar anúncio). Só administradores (montado com exigirAdmin).
// Ordem: campanha PAUSADA -> conjunto -> anúncio. Conjunto e anúncio nascem ativos dentro da campanha pausada: nada roda
// até alguém clicar em Ativar (que liga a campanha pelo /api/growth/apply, com registro em growth_actions).
// Se um passo falhar, apaga a campanha criada (leva conjunto e anúncio junto): não sobra campanha órfã na conta.
// "Validar" usa execution_options=validate_only (a Meta confere tudo sem criar nada).
// Objetivos: tráfego para site, mensagens (WhatsApp, Direct do Instagram, Messenger) e alcance. Imagem ou vídeo,
// enviados para a biblioteca da conta (adimages/advideos). Estrutura copiada dos anúncios que já rodam nas contas.
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const data = require('./growth-data');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'), { timeout: 5000 });
const logIns = db.prepare(`INSERT INTO growth_actions (id, account_id, tipo, nivel, obj_id, obj_nome, antes, depois, motivo, user_email, ok, erro, created_at)
  VALUES (?, ?, 'criar', ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`);

const CTAS_SITE = { LEARN_MORE: 'Saiba mais', SIGN_UP: 'Cadastre-se', SHOP_NOW: 'Comprar agora', CONTACT_US: 'Fale conosco', SUBSCRIBE: 'Assinar', GET_OFFER: 'Obter oferta', APPLY_NOW: 'Candidatar-se', BOOK_NOW: 'Reservar', DOWNLOAD: 'Baixar' };
const DESTINOS = {
  whatsapp: { destino: 'WHATSAPP', cta: 'WHATSAPP_MESSAGE', app: 'WHATSAPP', link: 'https://api.whatsapp.com/send' },
  messenger: { destino: 'MESSENGER', cta: 'MESSAGE_PAGE', app: 'MESSENGER', link: 'https://fb.com/messenger_doc/' },
  instagram: { destino: 'INSTAGRAM_DIRECT', cta: 'INSTAGRAM_MESSAGE', app: 'INSTAGRAM_DIRECT', link: 'https://www.instagram.com/' },
};
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// ─── chamadas ─────────────────────────────────────────────────────────────────
async function post(caminho, corpo, token, validar) {
  const b = new URLSearchParams();
  Object.entries(corpo).forEach(([k, v]) => { if (v != null) b.set(k, typeof v === 'string' ? v : JSON.stringify(v)); });
  if (validar) b.set('execution_options', JSON.stringify(['validate_only']));
  b.set('access_token', token);
  const r = await fetch(data.GRAPH + '/' + caminho, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b, signal: AbortSignal.timeout(60000) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error.error_user_msg || j.error.message || 'erro da Meta'); e.meta = j.error; throw e; }
  return j;
}
async function apagar(id, token) {
  try { const r = await fetch(data.GRAPH + '/' + id + '?access_token=' + encodeURIComponent(token), { method: 'DELETE', signal: AbortSignal.timeout(30000) }); return (await r.json()).success === true; } catch (_) { return false; }
}

// ─── contexto da conta: páginas, Instagram e se o token pode criar ────────────
async function contexto(accountId) {
  const id = data.actId(accountId), token = await data.tokenFor(id);
  const conta = await data.graph('act_' + id, { fields: 'name,currency,account_status,user_tasks,business{id,name}' }, token);
  const tarefas = conta.user_tasks || [];
  // Páginas em três fontes: as já usadas nos anúncios desta conta (primeiro), as do Business Manager e as do perfil
  const CAMPOS = 'id,name,picture{url},instagram_business_account{id,username}';
  const mapa = new Map(), usadas = new Map(); // page_id -> instagram_user_id usado nos anúncios
  const juntar = (lista, origem) => (lista || []).forEach(p => { if (p && p.id && !mapa.has(p.id)) mapa.set(p.id, Object.assign({ origem }, p)); });
  try {
    const crs = await data.graphAll('act_' + id + '/adcreatives', { fields: 'object_story_spec{page_id,instagram_user_id},actor_id,instagram_user_id', limit: 100 }, token, 2);
    crs.forEach(c => { const pg = (c.object_story_spec && c.object_story_spec.page_id) || c.actor_id; if (pg && !usadas.has(pg)) usadas.set(pg, (c.object_story_spec && c.object_story_spec.instagram_user_id) || c.instagram_user_id || null); });
    // uma por vez: página sem permissão de leitura não pode derrubar as outras; entra com o número no lugar do nome
    for (const pg of [...usadas.keys()].slice(0, 12)) {
      const x = await data.graph(pg, { fields: CAMPOS }, token).catch(() => null);
      juntar([x && x.id ? x : { id: pg, name: 'Página ' + pg + ' (sem acesso de leitura pelo token)', semLeitura: true }], 'usada');
    }
  } catch (e) { console.error('[growth-criar] páginas usadas', e.message); }
  if (conta.business) for (const ed of ['owned_pages', 'client_pages']) {
    try { juntar(await data.graphAll(conta.business.id + '/' + ed, { fields: CAMPOS, limit: 100 }, token, 2), 'bm'); } catch (_) {}
  }
  try { juntar(await data.graphAll('me/accounts', { fields: CAMPOS, limit: 100 }, token, 3), 'perfil'); } catch (e) { console.error('[growth-criar] páginas do perfil', e.message); }
  // Instagram: o da página; se não der para ler, o que os anúncios desta conta já usam com ela
  const igNomes = {};
  const igsUsados = [...new Set([...usadas.values()].filter(Boolean))];
  if (igsUsados.length) { const j = await data.graph('', { ids: igsUsados.join(','), fields: 'username' }, token).catch(() => ({})); Object.values(j).forEach(x => { if (x && x.id) igNomes[x.id] = x.username; }); }
  const ordem = { usada: 0, bm: 1, perfil: 2 };
  const paginas = [...mapa.values()].sort((x, y) => ordem[x.origem] - ordem[y.origem]).map(p => {
    const ig = p.instagram_business_account ? { id: p.instagram_business_account.id, usuario: p.instagram_business_account.username }
      : usadas.get(p.id) ? { id: usadas.get(p.id), usuario: igNomes[usadas.get(p.id)] || null } : null;
    return { id: p.id, nome: p.name, foto: p.picture && p.picture.data ? p.picture.data.url : null, instagram: ig, usadaNestaConta: p.origem === 'usada', semLeitura: !!p.semLeitura };
  });
  return {
    conta: { id, nome: conta.name, moeda: conta.currency, ativa: conta.account_status === 1, bm: conta.business ? conta.business.name : null },
    podeCriar: tarefas.includes('ADVERTISE') || tarefas.includes('MANAGE'),
    paginas, ctas: CTAS_SITE,
  };
}
async function buscarLocal(accountId, q) {
  const token = await data.tokenFor(accountId);
  const j = await data.graph('search', { type: 'adgeolocation', q: txt(q, 80), location_types: ['country', 'region', 'city'], limit: 12 }, token);
  return (j.data || []).map(l => ({ key: l.key, tipo: l.type, nome: l.name, regiao: l.region || '', pais: l.country_code || '' }));
}

// ─── mídia ────────────────────────────────────────────────────────────────────
async function subirImagem(accountId, buf) {
  const id = data.actId(accountId), token = await data.tokenFor(id);
  const j = await post('act_' + id + '/adimages', { bytes: buf.toString('base64') }, token);
  const img = Object.values(j.images || {})[0];
  if (!img || !img.hash) throw new Error('a Meta não devolveu a imagem');
  return { tipo: 'imagem', hash: img.hash, url: img.url || null };
}
async function subirVideo(accountId, buf, nome, mime) {
  const id = data.actId(accountId), token = await data.tokenFor(id);
  const fd = new FormData();
  fd.set('access_token', token); fd.set('name', txt(nome, 80) || 'video-central');
  fd.set('source', new Blob([buf], { type: mime || 'video/mp4' }), txt(nome, 80) || 'video.mp4');
  const r = await fetch(data.GRAPH + '/act_' + id + '/advideos', { method: 'POST', body: fd, signal: AbortSignal.timeout(300000) });
  const j = await r.json();
  if (j.error || !j.id) throw new Error((j.error && (j.error.error_user_msg || j.error.message)) || 'a Meta não aceitou o vídeo');
  // capa: a Meta gera as miniaturas depois de processar (pode levar alguns segundos)
  for (let i = 0; i < 20; i++) {
    await new Promise(ok => setTimeout(ok, 3000));
    try { const t = await data.graph(j.id + '/thumbnails', { fields: 'uri,is_preferred' }, token); const l = t.data || []; const pref = l.find(x => x.is_preferred) || l[0]; if (pref) return { tipo: 'video', videoId: j.id, capa: pref.uri }; } catch (_) {}
  }
  return { tipo: 'video', videoId: j.id, capa: null, aviso: 'a Meta ainda está processando o vídeo; tente criar em alguns minutos' };
}

// ─── montagem das três camadas a partir do plano da tela ──────────────────────
function checar(p, ctx) {
  const erros = [];
  if (!['trafego', 'mensagens', 'alcance'].includes(p.objetivo)) erros.push('escolha o objetivo');
  if (p.objetivo === 'mensagens' && !DESTINOS[p.destino]) erros.push('escolha onde as mensagens chegam');
  if (!txt(p.nome, 100)) erros.push('dê um nome à campanha');
  const pag = ctx.paginas.find(x => x.id === String(p.pageId));
  if (!pag) erros.push('escolha a página do Facebook que assina o anúncio');
  if (p.objetivo === 'mensagens' && p.destino === 'instagram' && !(pag && pag.instagram && p.usarInstagram !== false)) erros.push('Direct do Instagram precisa do Instagram da página ligado no anúncio');
  const orc = Number(p.orcamentoDiario);
  if (!(orc >= 1 && orc <= 50000)) erros.push('orçamento diário inválido');
  const pub = p.publico || {};
  if (!(pub.locais || []).length) erros.push('escolha pelo menos um local');
  // A Meta recusa local dentro de outro já escolhido (ex.: Brasil + Goiânia)
  const paises = new Set((pub.locais || []).filter(l => l.tipo === 'country').map(l => l.key));
  const dentro = (pub.locais || []).filter(l => l.tipo !== 'country' && paises.has(l.pais));
  if (dentro.length) erros.push(`${dentro.map(l => l.nome).join(', ')} já ${dentro.length > 1 ? 'estão' : 'está'} dentro do país escolhido: deixe só o país ou só ${dentro.length > 1 ? 'as cidades/estados' : 'a cidade/estado'}`);
  const imin = parseInt(pub.idadeMin, 10) || 18, imax = parseInt(pub.idadeMax, 10) || 65;
  if (imin < 18 || imax > 65 || imin > imax) erros.push('faixa de idade inválida (18 a 65)');
  const c = p.criativo || {};
  if (!(c.midia && (c.midia.hash || c.midia.videoId))) erros.push('envie a imagem ou o vídeo do anúncio');
  if (c.midia && c.midia.videoId && !c.midia.capa) erros.push('o vídeo ainda está sem capa (a Meta está processando): tente de novo em alguns minutos');
  if (!txt(c.texto, 2200)) erros.push('escreva o texto do anúncio');
  if (p.objetivo === 'trafego' && !/^https:\/\/\S+\.\S+/.test(c.link || '')) erros.push('o link do site precisa começar com https://');
  if (p.objetivo === 'trafego' && !CTAS_SITE[c.cta]) erros.push('escolha o botão do anúncio');
  if (p.inicio && isNaN(Date.parse(p.inicio))) erros.push('data de início inválida');
  if (p.fim && (isNaN(Date.parse(p.fim)) || (p.inicio && Date.parse(p.fim) <= Date.parse(p.inicio)))) erros.push('a data de fim precisa ser depois do início');
  return { erros, pag };
}
function montar(p, pag) {
  const pub = p.publico || {};
  const geo = { location_types: ['home', 'recent'] };
  for (const l of pub.locais || []) {
    if (l.tipo === 'country') (geo.countries = geo.countries || []).push(l.key);
    else if (l.tipo === 'region') (geo.regions = geo.regions || []).push({ key: String(l.key) });
    else if (l.tipo === 'city') (geo.cities = geo.cities || []).push({ key: String(l.key), radius: Math.max(17, Math.min(80, parseInt(l.raio, 10) || 25)), distance_unit: 'kilometer' });
  }
  const advantage = pub.advantage !== false;
  const targeting = { geo_locations: geo, age_min: parseInt(pub.idadeMin, 10) || 18, age_max: parseInt(pub.idadeMax, 10) || 65, targeting_automation: { advantage_audience: advantage ? 1 : 0 } };
  if (pub.genero === 'homens') targeting.genders = [1]; else if (pub.genero === 'mulheres') targeting.genders = [2];
  // Advantage+ público: a Meta usa a idade como sugestão e exige o máximo em 65
  if (advantage) targeting.age_max = 65;

  const objetivo = { trafego: 'OUTCOME_TRAFFIC', mensagens: 'OUTCOME_ENGAGEMENT', alcance: 'OUTCOME_AWARENESS' }[p.objetivo];
  const campanha = { name: txt(p.nome, 100), objective: objetivo, status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false, buying_type: 'AUCTION' };
  const conjunto = { name: txt(p.nome, 90) + ' · conjunto', status: 'ACTIVE', daily_budget: Math.round(Number(p.orcamentoDiario) * 100), billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting, start_time: p.inicio ? new Date(p.inicio).toISOString() : undefined, end_time: p.fim ? new Date(p.fim).toISOString() : undefined };
  if (p.objetivo === 'trafego') conjunto.optimization_goal = 'LINK_CLICKS';
  if (p.objetivo === 'alcance') conjunto.optimization_goal = 'REACH';
  if (p.objetivo === 'mensagens') { const d = DESTINOS[p.destino]; conjunto.optimization_goal = 'CONVERSATIONS'; conjunto.destination_type = d.destino; conjunto.promoted_object = { page_id: pag.id }; }

  const c = p.criativo, midia = c.midia, texto = txt(c.texto, 2200), titulo = txt(c.titulo, 255), desc = txt(c.descricao, 255);
  let cta = null, link = null;
  if (p.objetivo === 'trafego') { link = c.link; cta = { type: c.cta, value: { link } }; }
  if (p.objetivo === 'mensagens') { const d = DESTINOS[p.destino]; link = d.link; cta = { type: d.cta, value: { app_destination: d.app, link: d.link } }; }
  if (p.objetivo === 'alcance') { link = /^https:\/\//.test(c.link || '') ? c.link : 'https://www.facebook.com/' + pag.id; if (CTAS_SITE[c.cta]) cta = { type: c.cta, value: { link } }; }
  const historia = { page_id: pag.id };
  // Instagram é opcional: algumas contas de anúncio não têm acesso ao Instagram da página (a Meta recusa)
  if (pag.instagram && p.usarInstagram !== false) historia.instagram_user_id = pag.instagram.id;
  if (midia.videoId) historia.video_data = Object.assign({ video_id: midia.videoId, image_url: midia.capa, message: texto }, titulo ? { title: titulo } : {}, desc ? { link_description: desc } : {}, cta ? { call_to_action: cta } : {});
  else historia.link_data = Object.assign({ link, message: texto, image_hash: midia.hash }, titulo ? { name: titulo } : {}, desc ? { description: desc } : {}, cta ? { call_to_action: cta } : {});
  const anuncio = { name: txt(p.nome, 90) + ' · anúncio', status: 'ACTIVE', creative: { object_story_spec: historia } };
  return { campanha, conjunto, anuncio };
}

async function validar(accountId, p) {
  const id = data.actId(accountId), token = await data.tokenFor(id), ctx = await contexto(id);
  if (!ctx.podeCriar) throw new Error('o token não tem permissão de anunciar nesta conta (só leitura)');
  const { erros, pag } = checar(p, ctx);
  if (erros.length) return { ok: false, erros };
  const m = montar(p, pag);
  try { await post('act_' + id + '/campaigns', m.campanha, token, true); }
  catch (e) { return { ok: false, erros: ['Campanha: ' + e.message] }; }
  return { ok: true, avisos: ['Campanha validada pela Meta. Conjunto e anúncio são conferidos na criação: se algo falhar, nada fica na conta.'] };
}

async function criar(accountId, p, user) {
  const id = data.actId(accountId), token = await data.tokenFor(id), ctx = await contexto(id);
  if (!ctx.podeCriar) throw new Error('o token não tem permissão de anunciar nesta conta (só leitura)');
  const { erros, pag } = checar(p, ctx);
  if (erros.length) throw Object.assign(new Error(erros.join(' · ')), { erros });
  const m = montar(p, pag);
  let campId = null, etapa = 'campanha';
  const log = (ok, erro, nivel, objId) => logIns.run(crypto.randomBytes(6).toString('hex'), id, nivel, String(objId || ''), m.campanha.name, ok ? 'PAUSED' : '', `orçamento ${p.orcamentoDiario}/dia · ${p.objetivo}${p.destino ? ' (' + p.destino + ')' : ''}`, (user && user.email) || null, ok ? 1 : 0, erro || null, Date.now());
  try {
    campId = (await post('act_' + id + '/campaigns', m.campanha, token)).id;
    etapa = 'conjunto';
    const conjId = (await post('act_' + id + '/adsets', Object.assign({ campaign_id: campId }, m.conjunto), token)).id;
    etapa = 'anúncio';
    const adId = (await post('act_' + id + '/ads', Object.assign({ adset_id: conjId }, m.anuncio), token)).id;
    log(true, null, 'campaign', campId);
    console.log('[growth-criar] criado (pausado)', id, campId, conjId, adId, (user && user.email) || '');
    return { ok: true, campanhaId: campId, conjuntoId: conjId, anuncioId: adId, nome: m.campanha.name,
      gerenciador: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id}&selected_campaign_ids=${campId}` };
  } catch (e) {
    const desfeito = campId ? await apagar(campId, token) : true;
    log(false, `${etapa}: ${e.message}${campId ? (desfeito ? ' (campanha apagada)' : ' (NÃO consegui apagar a campanha ' + campId + ')') : ''}`, 'campaign', campId);
    throw new Error(`Não criei (${etapa}): ${e.message}${campId && !desfeito ? ` · ATENÇÃO: a campanha ${campId} ficou pausada na conta, apague no Gerenciador` : ''}`);
  }
}

// ─── rotas (/api/growth/criar) ────────────────────────────────────────────────
const router = express.Router();
const conta = req => String((req.query && req.query.account_id) || (req.body && req.body.account_id) || '');
const ok = fn => async (req, res) => { if (!/^(act_)?\d{5,20}$/.test(conta(req))) return res.status(400).json({ error: 'conta inválida' }); try { res.json(await fn(req)); } catch (e) { console.error('[growth-criar]', e.message); res.status(400).json({ error: e.message, erros: e.erros }); } };
router.get('/contexto', ok(req => contexto(conta(req))));
router.get('/local', ok(req => buscarLocal(conta(req), req.query.q).then(l => ({ locais: l }))));
// mídia: corpo bruto (até 200 MB para vídeo), tipo pelo content-type
router.post('/midia', express.raw({ type: () => true, limit: '200mb' }), ok(async req => {
  const mime = String(req.headers['content-type'] || '').split(';')[0];
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('arquivo vazio');
  if (/^image\/(png|jpeg)$/.test(mime)) { if (req.body.length > 30 * 1024 * 1024) throw new Error('imagem acima de 30 MB'); return subirImagem(conta(req), req.body); }
  if (/^video\/(mp4|quicktime)$/.test(mime)) return subirVideo(conta(req), req.body, req.query.nome, mime);
  throw new Error('use imagem JPG ou PNG, ou vídeo MP4 ou MOV');
}));
router.post('/validar', express.json({ limit: '256kb' }), ok(req => validar(conta(req), req.body.plano || {})));
router.post('/', express.json({ limit: '256kb' }), ok(req => criar(conta(req), req.body.plano || {}, req.user)));

module.exports = { router, contexto, montar, checar, validar, criar, buscarLocal, post };
