const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const drive = require('./drive');
const captions = require('./captions');
const { publishPost } = require('../publisher');

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://zeus-post.jefersonhenrike.com';
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');

// Processamento do lote: itens em paralelo com retry automático.
const BULK_CONCURRENCY = 3;   // itens simultâneos (containers da Meta processam em paralelo)
const MAX_RETRIES = 2;        // tentativas extras antes de marcar 'failed'
const RETRY_DELAY_SEC = 600;  // 10 min entre tentativas

function isImageMime(m) { return m?.startsWith('image/'); }
function isVideoMime(m) { return m?.startsWith('video/'); }

function parseHM(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

function isSuspended(dt, suspensions) {
  if (!suspensions) return false;
  // dias da semana bloqueados (0=domingo, 6=sábado)
  if (Array.isArray(suspensions.excluded_weekdays) && suspensions.excluded_weekdays.includes(dt.getDay())) {
    return true;
  }
  // intervalos de datas — data LOCAL, não UTC (toISOString virava o dia
  // seguinte pra slots noturnos em BRT e o bloqueio errava a data)
  if (Array.isArray(suspensions.date_ranges)) {
    const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    for (const r of suspensions.date_ranges) {
      if (!r?.from || !r?.to) continue;
      if (ymd >= r.from && ymd <= r.to) return true;
    }
  }
  // janelas de horário bloqueadas (suportam janela que atravessa meia-noite)
  if (Array.isArray(suspensions.time_windows)) {
    const nowMin = dt.getHours() * 60 + dt.getMinutes();
    for (const w of suspensions.time_windows) {
      if (!w?.from || !w?.to) continue;
      const from = parseHM(w.from), to = parseHM(w.to);
      if (from === to) continue;
      const inside = from < to ? (nowMin >= from && nowMin < to) : (nowMin >= from || nowMin < to);
      if (inside) return true;
    }
  }
  return false;
}

async function buildSlots(campaign) {
  const times = JSON.parse(campaign.times || '[]');
  const startDate = new Date(campaign.start_date + 'T00:00:00');
  const jitter = campaign.jitter_minutes || 0;
  const suspensions = JSON.parse(campaign.suspensions || '{}');

  // Stories: cada horário dispara uma sequência de N stories espaçados.
  const storyConfig = JSON.parse(campaign.story_config || '{}');
  const isStory = campaign.post_format === 'story';
  const burst = isStory ? Math.max(1, parseInt(storyConfig.stories_per_burst, 10) || 1) : 1;
  const burstGapMs = (parseInt(storyConfig.burst_interval_minutes, 10) || 3) * 60 * 1000;

  const requestedPerDay = parseInt(campaign.posts_per_day, 10) || 1;
  const maxPerDay = times.length || 1;
  const perDay = Math.max(1, Math.min(requestedPerDay, maxPerDay));
  const perDayReduced = perDay < requestedPerDay;

  const slots = [];
  let slotsBlocked = 0;
  for (let d = 0; d < campaign.total_days; d++) {
    for (let t = 0; t < perDay; t++) {
      const hhmm = times[t];
      const [hh, mm] = hhmm.split(':').map(Number);
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      dt.setHours(hh, mm, 0, 0);
      if (isSuspended(dt, suspensions)) { slotsBlocked++; continue; }
      const jitterMs = jitter ? (Math.random() * 2 - 1) * jitter * 60 * 1000 : 0;
      const base = dt.getTime() + jitterMs;
      for (let b = 0; b < burst; b++) {
        slots.push(Math.floor((base + b * burstGapMs) / 1000));
      }
    }
  }
  return { slots: slots.sort((a, b) => a - b), perDayReduced, slotsBlocked };
}

async function collectDriveItems(campaign) {
  const folderId = campaign.drive_folder_id;
  if (campaign.post_format === 'carousel') {
    const subfolders = drive.naturalSort(await drive.listFolder(folderId, { onlyMimeType: 'folders' }));
    const items = [];
    for (const sf of subfolders) {
      const files = drive.naturalSort(
        (await drive.listFolder(sf.id, { onlyMimeType: 'media' }))
          .filter(f => isImageMime(f.mimeType) || isVideoMime(f.mimeType))
      );
      if (files.length >= 2) {
        items.push({ folderId: sf.id, folderName: sf.name, files });
      }
    }
    return items;
  } else {
    const wantVideo = campaign.post_format === 'video';
    // Stories aceitam imagem E vídeo — não filtra por tipo
    const isStory = campaign.post_format === 'story';
    const files = drive.naturalSort(
      (await drive.listFolder(folderId, { onlyMimeType: 'media' }))
        .filter(f => isStory
          ? (isImageMime(f.mimeType) || isVideoMime(f.mimeType))
          : (wantVideo ? isVideoMime(f.mimeType) : isImageMime(f.mimeType)))
    );
    return files.map(f => ({ file: f }));
  }
}

function collectUploadItems(campaign, uploadedFiles, uploadedCarouselGroups) {
  if (campaign.post_format === 'carousel') {
    if (!Array.isArray(uploadedCarouselGroups) || !uploadedCarouselGroups.length) {
      throw new Error('Envie ao menos 1 carrossel (com 2 a 10 imagens cada)');
    }
    return uploadedCarouselGroups
      .filter(g => Array.isArray(g?.files) && g.files.length >= 2)
      .map((g, i) => ({ carouselGroup: { name: g.name || `Carrossel ${i+1}`, files: g.files } }));
  }
  return uploadedFiles.map(f => ({ upload: f }));
}

async function createCampaign(input) {
  const db = getDb();
  const sourceType = input.source_type === 'upload' ? 'upload' : 'drive';

  let folderId = null;
  if (sourceType === 'drive') {
    folderId = drive.extractFolderId(input.drive_url);
    if (!folderId) throw new Error('URL do Google Drive inválida');
  } else if (input.post_format === 'carousel') {
    if (!Array.isArray(input.uploaded_carousel_groups) || !input.uploaded_carousel_groups.length) {
      throw new Error('Envie ao menos 1 carrossel');
    }
  } else if (!Array.isArray(input.uploaded_files) || !input.uploaded_files.length) {
    throw new Error('Envie pelo menos 1 arquivo antes de criar a campanha');
  }

  const times = Array.isArray(input.times) ? input.times : [];
  if (!times.length) throw new Error('Adicione pelo menos 1 horário');
  if (!input.posts_per_day || !input.total_days) throw new Error('Volume inválido');
  if (!input.account_ids?.length) throw new Error('Selecione ao menos 1 conta');

  // story_config vale para o formato Stories (sequência) e para o espelhamento
  // de campanhas de feed
  const storyConfig = input.story_config || {};
  if (input.post_format === 'story') storyConfig.mirror_to_story = false; // já é story

  // trava de rate limit da plataforma (campanhas bulk publicam no Instagram)
  const { validateCampaignLimits } = require('./limits');
  const violations = validateCampaignLimits({
    posts_per_day: input.posts_per_day, times, jitter_minutes: input.jitter_minutes ?? 5,
    stories_per_burst: storyConfig.stories_per_burst ?? 1,
    burst_interval_minutes: storyConfig.burst_interval_minutes ?? 3,
    mirror_to_story: !!storyConfig.mirror_to_story
  }, input.post_format === 'story' ? 'instagram_story' : 'instagram');
  if (violations.length) throw new Error('Limite de segurança da plataforma: ' + violations.join(' | '));

  // Stories não aceitam legenda na Graph API — não gera nem cobra provedor de IA
  const isStory = input.post_format === 'story';
  const captionMode = isStory ? 'fixed' : input.caption_mode;
  const captionConfig = isStory ? { text: '' } : (input.caption_config || {});
  if (captionMode === 'ai') {
    const provider = captionConfig.provider;
    if (!provider) throw new Error('Selecione o provedor de IA');
    const key = db.prepare('SELECT value FROM settings WHERE key = ?').get(`ai_${provider}_key`)?.value;
    if (!key) throw new Error(`Configure a API Key do ${provider} em Configurações`);
  }

  const saveMode = input.save_mode || 'active'; // 'draft' | 'scheduled' | 'active'
  const initialStatus = saveMode === 'draft' ? 'draft' : saveMode === 'scheduled' ? 'scheduled' : 'active';
  const scheduledStartAt = saveMode === 'scheduled' && input.scheduled_start_at
    ? Math.floor(new Date(input.scheduled_start_at).getTime() / 1000) : null;
  const suspensions = input.suspensions || {};

  // Trial Reel só faz sentido em campanhas de vídeo; ignora nos outros formatos
  const isTrialCampaign = input.is_trial && input.post_format === 'video' ? 1 : 0;

  const info = db.prepare(`INSERT INTO bulk_campaigns
    (name, source_type, drive_folder_id, drive_url, post_format, account_ids, posts_per_day, total_days,
     times, start_date, jitter_minutes, caption_mode, caption_config, status,
     scheduled_start_at, suspensions, story_config, is_trial)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    input.name || `Campanha ${new Date().toISOString().slice(0,10)}`,
    sourceType, folderId, input.drive_url || null, input.post_format,
    JSON.stringify(input.account_ids), input.posts_per_day, input.total_days,
    JSON.stringify(times), input.start_date, input.jitter_minutes ?? 5,
    captionMode, JSON.stringify(captionConfig), initialStatus,
    scheduledStartAt, JSON.stringify(suspensions), JSON.stringify(storyConfig), isTrialCampaign
  );
  const campaignId = info.lastInsertRowid;
  const campaign = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(campaignId);

  const slotInfo = await buildSlots(campaign);
  const slots = slotInfo.slots;
  const items = sourceType === 'drive'
    ? await collectDriveItems(campaign)
    : collectUploadItems(campaign, input.uploaded_files, input.uploaded_carousel_groups);

  const warnings = [];
  if (slotInfo.perDayReduced) {
    warnings.push(`Posts/dia reduzido de ${input.posts_per_day} pra ${slots.length / input.total_days} (máximo de horários: ${times.length})`);
  }
  if (slotInfo.slotsBlocked > 0) {
    warnings.push(`${slotInfo.slotsBlocked} slots pulados por suspensões configuradas`);
  }
  if (items.length < slots.length) {
    throw new Error(`❌ Items insuficientes: ${items.length} arquivos vs ${slots.length} slots. Suba mais ${slots.length - items.length} arquivo(s) ou reduza a duração da campanha.`);
  }
  if (items.length > slots.length) {
    warnings.push(`⚠️ ${items.length - slots.length} arquivo(s) não serão usados (sobram slots: ${slots.length})`);
  }

  const insertItem = db.prepare(`INSERT INTO bulk_campaign_items
    (campaign_id, slot_index, scheduled_at, drive_file_id, drive_folder_id, drive_meta, status)
    VALUES (?,?,?,?,?,?,'pending')`);

  const insertMany = db.transaction(() => {
    const total = slots.length;
    for (let i = 0; i < total; i++) {
      const it = items[i % items.length]; // reuso cíclico se items < slots
      if (it.carouselGroup) {
        insertItem.run(campaignId, i, slots[i], null, null,
          JSON.stringify({ source: 'upload-carousel', groupName: it.carouselGroup.name,
                           files: it.carouselGroup.files }));
      } else if (campaign.post_format === 'carousel') {
        insertItem.run(campaignId, i, slots[i], null, it.folderId,
          JSON.stringify({ source: 'drive', folderName: it.folderName, files: it.files }));
      } else if (it.upload) {
        insertItem.run(campaignId, i, slots[i], null, null,
          JSON.stringify({ source: 'upload', path: it.upload.path, url: it.upload.url,
                          name: it.upload.original_name, mimeType: it.upload.mimetype }));
      } else {
        insertItem.run(campaignId, i, slots[i], it.file.id, null,
          JSON.stringify({ source: 'drive', name: it.file.name, mimeType: it.file.mimeType }));
      }
    }
    return total;
  });
  const inserted = insertMany();
  db.prepare('UPDATE bulk_campaigns SET total_items=? WHERE id=?').run(inserted, campaignId);
  return { campaign_id: campaignId, total_scheduled: inserted, slots_calculated: slots.length, items_available: items.length, warnings };
}

async function downloadToUploads(fileId, name, mimeType) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = drive.extForMime(mimeType, name);
  const filename = `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const destPath = path.join(UPLOAD_DIR, filename);
  await drive.downloadFile(fileId, destPath);
  return { path: destPath, filename, url: `${PUBLIC_BASE}/uploads/${filename}`, mimeType };
}

function resolvePostType(postFormat) {
  if (postFormat === 'story') return 'story';
  if (postFormat === 'video') return 'video';
  return 'image';
}

async function processItem(item, campaign, db) {
  const meta = JSON.parse(item.drive_meta || '{}');
  const captionMode = campaign.caption_mode;
  const captionConfig = JSON.parse(campaign.caption_config || '{}');
  const accountIds = JSON.parse(campaign.account_ids || '[]');

  const caption = await captions.generateCaption(captionMode, captionConfig);
  let mediaPath, postType;
  const filesToCleanup = []; // arquivos locais a apagar após publicação

  if (campaign.post_format === 'carousel') {
    const files = meta.files || [];
    const urls = [];
    if (meta.source === 'upload-carousel') {
      // arquivos já estão no servidor
      for (const f of files.slice(0, 10)) {
        urls.push(f.url);
        if (f.path) filesToCleanup.push(f.path);
      }
    } else {
      // Drive: baixar cada arquivo
      for (const f of files.slice(0, 10)) {
        const d = await downloadToUploads(f.id, f.name, f.mimeType);
        urls.push(d.url);
        filesToCleanup.push(d.path);
      }
    }
    mediaPath = JSON.stringify(urls);
    postType = 'carousel';
  } else if (meta.source === 'upload') {
    mediaPath = meta.url;
    postType = resolvePostType(campaign.post_format);
    if (meta.path) filesToCleanup.push(meta.path);
  } else {
    const d = await downloadToUploads(item.drive_file_id, meta.name, meta.mimeType);
    mediaPath = d.url;
    postType = resolvePostType(campaign.post_format);
    filesToCleanup.push(d.path);
  }

  // Retry reaproveita o post existente do item (evita duplicar linha em posts)
  // Trial Reel só faz sentido em vídeo — ignora silenciosamente em image/carousel/story
  const isTrial = campaign.is_trial && (postType === 'video' || postType === 'reel') ? 1 : 0;

  let postId = item.post_id;
  const existingPost = postId ? db.prepare('SELECT id FROM posts WHERE id = ?').get(postId) : null;
  if (existingPost) {
    db.prepare(`UPDATE posts SET caption=?, media_path=?, media_type=?, post_type=?, is_trial=?, status='scheduled', updated_at=unixepoch() WHERE id=?`)
      .run(caption, mediaPath, meta.mimeType || null, postType, isTrial, postId);
  } else {
    const postInsert = db.prepare(`INSERT INTO posts
      (title, caption, media_path, media_type, post_type, is_trial, platforms, account_ids, scheduled_at, status)
      VALUES (?,?,?,?,?,?,?,?,?, 'scheduled')`).run(
      `Bulk #${campaign.id}/${item.slot_index}`,
      caption, mediaPath, meta.mimeType || null, postType, isTrial,
      JSON.stringify(['instagram']), JSON.stringify(accountIds), item.scheduled_at
    );
    postId = postInsert.lastInsertRowid;
    db.prepare('UPDATE bulk_campaign_items SET post_id=? WHERE id=?').run(postId, item.id);
  }

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  post.platforms = JSON.parse(post.platforms || '[]');
  post.account_ids = JSON.parse(post.account_ids || '[]');
  const results = await publishPost(post, db);
  const anyPublished = results.some(r => r.status === 'published');

  // ==== Espelhamento no Story ====
  // Se ligado, a MESMA mídia que foi pro feed sai também como story, logo em
  // seguida — mesma quantidade de publicações. Só espelha o que publicou.
  const storyCfg = JSON.parse(campaign.story_config || '{}');
  let mirrorResults = null;
  if (storyCfg.mirror_to_story && anyPublished && campaign.post_format !== 'story') {
    try {
      // Story não aceita carrossel: espelha a primeira lâmina
      const storyMedia = campaign.post_format === 'carousel'
        ? (JSON.parse(mediaPath)[0] || null)
        : mediaPath;
      if (storyMedia) {
        const ins = db.prepare(`INSERT INTO posts
          (title, caption, media_path, media_type, post_type, platforms, account_ids, scheduled_at, status)
          VALUES (?,?,?,?, 'story', ?,?,?, 'scheduled')`).run(
          `Bulk #${campaign.id}/${item.slot_index} [story]`,
          '', storyMedia, meta.mimeType || null,
          JSON.stringify(['instagram']), JSON.stringify(accountIds), item.scheduled_at
        );
        const storyPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(ins.lastInsertRowid);
        storyPost.platforms = JSON.parse(storyPost.platforms || '[]');
        storyPost.account_ids = JSON.parse(storyPost.account_ids || '[]');
        mirrorResults = await publishPost(storyPost, db);
        const okStory = mirrorResults.some(r => r.status === 'published');
        console.log(`[bulk] item ${item.id}: espelho no story ${okStory ? 'PUBLICADO' : 'FALHOU'}`);
      }
    } catch (err) {
      // falha no espelho NÃO invalida o post do feed que já saiu
      console.error(`[bulk] item ${item.id}: espelho no story falhou —`, err.response?.data?.error?.message || err.message);
    }
  }

  // limpeza só depois do feed E do espelho — o story usa a mesma mídia
  if (anyPublished) {
    for (const p of filesToCleanup) {
      try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
    }
  }

  return { results, anyPublished, mirrorResults };
}

// Recalcula scheduled_at dos itens ainda 'pending' de uma campanha, usando os
// campos ATUAIS no banco (times, posts_per_day, start_date, suspensions...).
// Chamado após editar campanha e após "Iniciar agora" (retomar do pause).
// GARANTIAS:
//   1. Nenhum slot é atribuído no PASSADO. Se hoje já é 22h e o primeiro
//      horário config é 08:00, o primeiro item vai pra 08:00 de amanhã. Isso
//      impede o scheduler de drenar em rajada tudo que ficou pra trás.
//   2. Estende `total_days` dinamicamente até gerar slots FUTUROS suficientes
//      pra encaixar todos os itens pendentes. Não deixa nenhum item de fora
//      por falta de dia agendado.
//   3. Reserializa `slot_index` na nova ordem, pra bater com o cronograma real.
async function rebuildPendingSlots(campaignId, { resetStart = false } = {}) {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campanha não encontrada');

  if (resetStart) {
    const nowBrt = new Date(Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    db.prepare('UPDATE bulk_campaigns SET start_date=? WHERE id=?').run(nowBrt, campaignId);
    campaign.start_date = nowBrt;
  }

  const pending = db.prepare(`SELECT id FROM bulk_campaign_items
    WHERE campaign_id = ? AND status = 'pending' ORDER BY slot_index ASC`).all(campaignId);
  if (!pending.length) return { updated: 0, pending_count: 0, first_slot: null };

  const times = JSON.parse(campaign.times || '[]');
  if (!times.length) throw new Error('Campanha sem horários definidos — adicione ao menos 1');
  const perDay = Math.max(1, Math.min(parseInt(campaign.posts_per_day, 10) || 1, times.length));
  campaign.posts_per_day = perDay;

  // Só slots FUTUROS. Se buildSlots gerar poucos slots futuros pro total_days
  // atual (ex: rebuild às 22h derruba todos os slots de hoje), estende
  // total_days em loop até ter slots suficientes.
  const nowSec = Math.floor(Date.now() / 1000);
  const MAX_DAYS = 365;
  let daysNeeded = Math.max(campaign.total_days || 1, Math.ceil(pending.length / perDay));
  let futureSlots = [];
  while (daysNeeded <= MAX_DAYS) {
    campaign.total_days = daysNeeded;
    const all = await buildSlots(campaign);
    // margem: joga pra frente qualquer slot que caia antes de agora + 60s
    // (impede que o próximo tick do scheduler capture o slot recém-criado
    // como "atrasado")
    futureSlots = all.filter(s => s >= nowSec + 60);
    if (futureSlots.length >= pending.length) break;
    daysNeeded += 1;
  }
  if (futureSlots.length < pending.length && daysNeeded >= MAX_DAYS) {
    throw new Error(`Precisaria de mais de ${MAX_DAYS} dias pra encaixar ${pending.length} itens com este cronograma`);
  }

  db.prepare('UPDATE bulk_campaigns SET total_days=?, posts_per_day=? WHERE id=?')
    .run(campaign.total_days, perDay, campaignId);

  const upd = db.prepare('UPDATE bulk_campaign_items SET scheduled_at = ?, slot_index = ? WHERE id = ?');
  let updated = 0;
  for (let i = 0; i < pending.length; i++) {
    if (futureSlots[i] === undefined) break;
    upd.run(futureSlots[i], i, pending[i].id);
    updated++;
  }
  db.prepare('UPDATE bulk_campaigns SET updated_at = unixepoch() WHERE id = ?').run(campaignId);
  return {
    updated,
    pending_count: pending.length,
    total_slots: futureSlots.length,
    first_slot: futureSlots[0] || null,
    first_slot_brt: futureSlots[0] ? new Date(futureSlots[0]*1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null,
    last_slot_brt: futureSlots[futureSlots.length - 1] ? new Date(futureSlots[futureSlots.length - 1]*1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null
  };
}

// resiliência: se o worker reiniciou no meio do lote, itens ficam presos em 'processing'.
// Ao boot (chamado 1x em worker.js), volta pra 'pending' pra serem retomados.
function recoverStuckItems() {
  const db = getDb();
  const info = db.prepare(`UPDATE bulk_campaign_items SET status='pending'
    WHERE status='processing'`).run();
  if (info.changes > 0) console.log(`[bulk] recovery: ${info.changes} item(s) preso(s) em 'processing' voltaram pra 'pending'`);
  return info.changes;
}

async function processDueItems(maxItems = 20) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // ativa campanhas programadas cujo horário de início já chegou
  db.prepare(`UPDATE bulk_campaigns SET status='active', updated_at=unixepoch()
    WHERE status='scheduled' AND scheduled_start_at IS NOT NULL AND scheduled_start_at <= ?`).run(now);

  // Fetch em pool maior porque vamos filtrar 1 por campanha logo abaixo.
  const raw = db.prepare(`SELECT bi.* FROM bulk_campaign_items bi
    INNER JOIN bulk_campaigns bc ON bc.id = bi.campaign_id
    WHERE bi.status = 'pending' AND bi.scheduled_at <= ? AND bc.status = 'active'
    ORDER BY bi.scheduled_at ASC LIMIT ?`).all(now, maxItems * 4);

  // TRAVA ANTI-RAJADA: no MESMO tick do scheduler (1 min), publica no máximo
  // 1 item por campanha. Se por algum motivo (rebuild antigo, downtime do
  // worker) várias linhas ficarem vencidas ao mesmo tempo pra mesma campanha,
  // elas saem espaçadas 1/minuto ao invés de tudo de uma vez.
  // O critério do Jeff é rígido: se agendou 5 posts, saem 5 no horário certo.
  const seenCampaigns = new Set();
  const items = [];
  for (const it of raw) {
    if (seenCampaigns.has(it.campaign_id)) continue;
    seenCampaigns.add(it.campaign_id);
    items.push(it);
    if (items.length >= maxItems) break;
  }

  if (!items.length) return { processed: 0 };

  console.log(`[bulk] processando lote de ${items.length} item(s) (concorrência ${BULK_CONCURRENCY})`);
  let processed = 0, ok = 0, ko = 0, retried = 0;

  // Marca falha com retry automático: até MAX_RETRIES tentativas, com o item
  // voltando pra 'pending' +10 min. Só conta em failed_count quando esgota.
  const failOrRetry = (item, campaign, errMsg) => {
    const retryCount = item.retry_count || 0;
    if (retryCount < MAX_RETRIES) {
      db.prepare(`UPDATE bulk_campaign_items SET status='pending', retry_count=?, scheduled_at=?, error_message=? WHERE id=?`)
        .run(retryCount + 1, Math.floor(Date.now() / 1000) + RETRY_DELAY_SEC, errMsg.slice(0, 800), item.id);
      retried++;
      console.warn(`[bulk] item ${item.id}: falhou, retry ${retryCount + 1}/${MAX_RETRIES} em ${RETRY_DELAY_SEC / 60} min — ${errMsg.slice(0, 200)}`);
    } else {
      db.prepare(`UPDATE bulk_campaign_items SET status='failed', error_message=?, processed_at=? WHERE id=?`)
        .run(errMsg.slice(0, 800), Math.floor(Date.now() / 1000), item.id);
      db.prepare(`UPDATE bulk_campaigns SET failed_count=failed_count+1, updated_at=unixepoch() WHERE id=?`).run(campaign.id);
      ko++;
      console.error(`[bulk] item ${item.id}: FALHOU definitivo após ${MAX_RETRIES + 1} tentativas — ${errMsg.slice(0, 300)}`);
    }
  };

  const handleItem = async (item) => {
    const campaign = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(item.campaign_id);

    // safety-net: se agora estamos em janela de suspensão, deixa pendente
    const suspensions = JSON.parse(campaign.suspensions || '{}');
    if (isSuspended(new Date(), suspensions)) return;

    // Cada item é isolado: falha ou timeout dele NÃO aborta os demais.
    db.prepare(`UPDATE bulk_campaign_items SET status='processing' WHERE id=?`).run(item.id);
    const startedAt = Date.now();
    try {
      const { anyPublished, results } = await processItem(item, campaign, db);
      const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (anyPublished) {
        db.prepare(`UPDATE bulk_campaign_items SET status='published', processed_at=?, error_message=NULL WHERE id=?`)
          .run(Math.floor(Date.now() / 1000), item.id);
        db.prepare(`UPDATE bulk_campaigns SET published_count=published_count+1, updated_at=unixepoch() WHERE id=?`).run(campaign.id);
        ok++;
        console.log(`[bulk] item ${item.id} PUBLICADO em ${dur}s`);
      } else {
        const firstErr = results?.find(r => r.error)?.error || 'nenhuma conta publicou';
        failOrRetry(item, campaign, String(firstErr));
      }
    } catch (err) {
      const { redact } = require('./crypto');
      const detail = redact(err.response?.data?.error?.message
        || (err.response?.data ? JSON.stringify(err.response.data) : err.message));
      const errMsg = `${detail} [at ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}]`;
      try {
        failOrRetry(item, campaign, errMsg);
      } catch (dbErr) {
        console.error(`[bulk] falha ao gravar erro do item ${item.id}:`, dbErr.message);
      }
    }
    processed++;
  };

  // Pool de concorrência: itens rodam em paralelo (o gargalo é o processamento
  // de vídeo no lado da Meta — serial deixava o lote horas na fila).
  let cursor = 0;
  const runner = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await handleItem(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, items.length) }, runner));

  console.log(`[bulk] lote concluído: ${ok} publicado(s), ${ko} falha(s) definitiva(s), ${retried} reagendado(s) pra retry`);
  return { processed, published: ok, failed: ko, retried };
}

async function testDriveFolder(url) {
  const folderId = drive.extractFolderId(url);
  if (!folderId) throw new Error('URL do Google Drive inválida');
  if (!drive.isConnected()) throw new Error('Google Drive não conectado');
  const files = await drive.listFolder(folderId);
  const media = files.filter(f => isImageMime(f.mimeType) || isVideoMime(f.mimeType));
  const subfolders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

  let testDownload = null;
  const sample = media[0] || (subfolders[0] ? (await drive.listFolder(subfolders[0].id, { onlyMimeType: 'media' }))[0] : null);
  if (sample) {
    const d = await downloadToUploads(sample.id, sample.name, sample.mimeType);
    const stat = fs.statSync(d.path);
    testDownload = { name: sample.name, url: d.url, size: stat.size, mimeType: sample.mimeType };
  }
  return {
    ok: true, folder_id: folderId,
    total_files: files.length,
    media_files: media.length,
    subfolders: subfolders.length,
    test_download: testDownload
  };
}

module.exports = { createCampaign, processDueItems, testDriveFolder, buildSlots, collectDriveItems, recoverStuckItems, rebuildPendingSlots };
