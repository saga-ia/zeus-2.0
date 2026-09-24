const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../db');
const drive = require('../lib/drive');
const bulk = require('../lib/bulk');
const settingsLib = require('../lib/settings');
const { open, redact } = require('../lib/crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const bulkUploadStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const bulkUpload = multer({ storage: bulkUploadStorage, limits: { fileSize: 500 * 1024 * 1024 } });

module.exports = function(auth) {
  const router = express.Router();

  router.post('/bulk/upload-batch', auth, bulkUpload.array('files', 500), (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const files = req.files.map(f => ({
      filename: f.filename,
      original_name: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      path: f.path,
      url: `/uploads/${f.filename}`
    }));
    res.json({ ok: true, count: files.length, files });
  });

  router.get('/drive/status', auth, (req, res) => {
    res.json({ connected: drive.isConnected() });
  });

  router.post('/drive/test', auth, async (req, res) => {
    try {
      const { drive_url } = req.body;
      const result = await bulk.testDriveFolder(drive_url);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.response?.data?.error?.message || err.message });
    }
  });

  router.post('/bulk/preview', auth, async (req, res) => {
    try {
      const { drive_url, post_format, posts_per_day, total_days, times, suspensions } = req.body;
      const pd = parseInt(posts_per_day, 10) || 0;
      const td = parseInt(total_days, 10) || 0;
      const timesArr = Array.isArray(times) ? times : [];
      const perDayReduced = pd > timesArr.length;
      const effectivePerDay = Math.max(1, Math.min(pd, timesArr.length || 1));
      const total_slots = effectivePerDay * td;

      let drive_items = null;
      if (drive_url) {
        const folderId = drive.extractFolderId(drive_url);
        if (folderId) {
          const items = await bulk.collectDriveItems({
            drive_folder_id: folderId, post_format: post_format || 'image'
          });
          drive_items = items.length;
        }
      }

      const warnings = [];
      if (perDayReduced) {
        warnings.push(`Posts/dia será reduzido de ${pd} pra ${effectivePerDay} (máximo de horários: ${timesArr.length})`);
      }

      res.json({
        total_slots,
        drive_items,
        effective_per_day: effectivePerDay,
        per_day_reduced: perDayReduced,
        sufficient: drive_items === null || drive_items >= total_slots,
        warnings
      });
    } catch (err) {
      res.status(400).json({ error: err.response?.data?.error?.message || err.message });
    }
  });

  router.post('/bulk/campaigns', auth, async (req, res) => {
    try {
      const result = await bulk.createCampaign(req.body);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[bulk create]', redact(err.response?.data || err.message));
      res.status(400).json({ error: err.response?.data?.error?.message || err.message });
    }
  });

  router.get('/bulk/campaigns', auth, (req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM bulk_campaigns ORDER BY created_at DESC').all();
    rows.forEach(r => {
      r.account_ids = JSON.parse(r.account_ids || '[]');
      r.times = JSON.parse(r.times || '[]');
      r.caption_config = JSON.parse(r.caption_config || '{}');
      r.story_config = JSON.parse(r.story_config || '{}');
    });
    res.json(rows);
  });

  router.get('/bulk/campaigns/:id', auth, (req, res) => {
    const db = getDb();
    const c = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });
    c.account_ids = JSON.parse(c.account_ids || '[]');
    c.times = JSON.parse(c.times || '[]');
    c.caption_config = JSON.parse(c.caption_config || '{}');
    c.story_config = JSON.parse(c.story_config || '{}');
    const items = db.prepare(`SELECT id, slot_index, scheduled_at, drive_file_id, drive_folder_id,
      status, error_message, processed_at, post_id FROM bulk_campaign_items
      WHERE campaign_id = ? ORDER BY slot_index ASC`).all(req.params.id);
    res.json({ campaign: c, items });
  });

  // Mídias de uma campanha (pra preview no modal "Ver Mídias").
  // Normaliza upload vs drive vs carousel em um shape único por item.
  router.get('/bulk/campaigns/:id/media', auth, (req, res) => {
    const db = getDb();
    const c = db.prepare('SELECT id, name FROM bulk_campaigns WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });
    const rows = db.prepare(`SELECT id, slot_index, scheduled_at, drive_file_id, drive_meta,
      status, error_message FROM bulk_campaign_items
      WHERE campaign_id = ? ORDER BY scheduled_at ASC`).all(req.params.id);
    const items = rows.map(r => {
      let meta = {};
      try { meta = JSON.parse(r.drive_meta || '{}'); } catch {}
      const media = [];
      const push = (m, id, name) => {
        const isImage = (m || '').startsWith('image/');
        const isVideo = (m || '').startsWith('video/');
        media.push({ name, mimeType: m || '', kind: isVideo ? 'video' : isImage ? 'image' : 'other',
          url: id ? `/media/drive/${id}` : null });
      };
      if (meta.source === 'upload-carousel' && Array.isArray(meta.files)) {
        meta.files.forEach(f => media.push({
          name: f.original_name || f.name || 'lâmina',
          mimeType: f.mimetype || f.mimeType || '',
          kind: (f.mimetype || f.mimeType || '').startsWith('video/') ? 'video' : 'image',
          url: f.url && f.url.startsWith('http') ? f.url : (f.url || null)
        }));
      } else if (meta.source === 'upload') {
        media.push({
          name: meta.original_name || meta.name || 'arquivo',
          mimeType: meta.mimetype || meta.mimeType || '',
          kind: (meta.mimetype || meta.mimeType || '').startsWith('video/') ? 'video' : 'image',
          url: meta.url && meta.url.startsWith('http') ? meta.url : (meta.url || null)
        });
      } else if (Array.isArray(meta.files) && meta.files.length) {
        // Carrossel do Drive
        meta.files.forEach(f => push(f.mimeType, f.id, f.name));
      } else if (r.drive_file_id) {
        push(meta.mimeType, r.drive_file_id, meta.name);
      }
      return {
        id: r.id, slot_index: r.slot_index, scheduled_at: r.scheduled_at,
        status: r.status, error_message: r.error_message, media
      };
    });
    res.json({ campaign: c, items });
  });

  // Remove um item PENDENTE da campanha (usado no botão "Tirar da programação").
  // Só pending pode ser removido — publicado/falhou/processing ficam pra
  // histórico. Ajusta total_items pra o pct do progresso ficar correto.
  router.delete('/bulk/campaigns/:id/items/:itemId', auth, (req, res) => {
    const db = getDb();
    const item = db.prepare('SELECT id, campaign_id, status FROM bulk_campaign_items WHERE id = ? AND campaign_id = ?')
      .get(req.params.itemId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (item.status !== 'pending') {
      return res.status(400).json({ error: `Só dá pra tirar item pendente (esse tá ${item.status})` });
    }
    db.prepare('DELETE FROM bulk_campaign_items WHERE id = ?').run(item.id);
    db.prepare('UPDATE bulk_campaigns SET total_items = total_items - 1, updated_at = unixepoch() WHERE id = ?')
      .run(req.params.id);
    res.json({ ok: true });
  });

  // Proxy do Drive pra <img>/<video> no browser sem lidar com OAuth no client.
  // Suporta Range pro <video> conseguir seek. Streaming direto, sem gravar disco.
  router.get('/media/drive/:fileId', auth, async (req, res) => {
    try {
      const axios = require('axios');
      const meta = await drive.fileMeta(req.params.fileId);
      const accessToken = await drive.getAccessToken();
      const range = req.headers.range;
      const upstream = await axios.get(
        `https://www.googleapis.com/drive/v3/files/${req.params.fileId}`,
        {
          params: { alt: 'media', supportsAllDrives: true },
          headers: { Authorization: `Bearer ${accessToken}`, ...(range ? { Range: range } : {}) },
          responseType: 'stream',
          validateStatus: s => s >= 200 && s < 400
        }
      );
      res.status(upstream.status);
      const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
      pass.forEach(h => { if (upstream.headers[h]) res.setHeader(h, upstream.headers[h]); });
      if (!upstream.headers['content-type'] && meta.mimeType) res.setHeader('Content-Type', meta.mimeType);
      if (!upstream.headers['accept-ranges']) res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      upstream.data.pipe(res);
    } catch (err) {
      const s = err.response?.status || 500;
      res.status(s).json({ error: err.response?.data?.error?.message || err.message });
    }
  });

  router.post('/bulk/campaigns/:id/pause', auth, (req, res) => {
    getDb().prepare("UPDATE bulk_campaigns SET status='paused', updated_at=unixepoch() WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/bulk/campaigns/:id/resume', auth, async (req, res) => {
    try {
      // Retomar de onde parou: reset start_date pra HOJE e recalcula slots
      // pendentes. Sem isso, todos os slots vencidos disparariam em rajada.
      getDb().prepare("UPDATE bulk_campaigns SET status='active', scheduled_start_at=NULL, updated_at=unixepoch() WHERE id=?").run(req.params.id);
      const rebuild = await bulk.rebuildPendingSlots(req.params.id, { resetStart: true });
      res.json({ ok: true, rebuild });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/bulk/campaigns/:id', auth, async (req, res) => {
    try {
      const db = getDb();
      const c = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(req.params.id);
      if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });
      const allowed = ['name', 'account_ids', 'posts_per_day', 'total_days', 'times', 'start_date',
                       'caption_mode', 'caption_config', 'suspensions', 'story_config'];
      // campos que afetam o cronograma dos itens pendentes: mudança neles
      // exige recomputar scheduled_at, senão o backend continua usando os
      // horários velhos gravados em bulk_campaign_items.
      const scheduleAffecting = new Set(['posts_per_day', 'total_days', 'times', 'start_date', 'suspensions']);
      let scheduleTouched = false;

      // Valida horários e posts/dia ANTES de tocar no banco.
      if (req.body.times !== undefined) {
        if (!Array.isArray(req.body.times) || !req.body.times.length) {
          return res.status(400).json({ error: 'Adicione ao menos 1 horário' });
        }
        const bad = req.body.times.find(t => !/^\d{1,2}:\d{2}$/.test(t));
        if (bad) return res.status(400).json({ error: `Horário inválido: "${bad}" (use HH:MM)` });
      }
      const effectiveTimes = req.body.times !== undefined ? req.body.times : JSON.parse(c.times || '[]');
      const effectivePpd = req.body.posts_per_day !== undefined ? parseInt(req.body.posts_per_day, 10) : c.posts_per_day;
      if (effectivePpd > effectiveTimes.length) {
        return res.status(400).json({
          error: `Você pediu ${effectivePpd} posts/dia mas só configurou ${effectiveTimes.length} horário(s). Adicione mais horários ou reduza posts/dia.`
        });
      }

      const updates = [];
      const values = [];
      for (const k of allowed) {
        if (req.body[k] === undefined) continue;
        const v = ['account_ids','times','caption_config','suspensions','story_config'].includes(k)
          ? JSON.stringify(req.body[k]) : req.body[k];
        updates.push(`${k} = ?`);
        values.push(v);
        if (scheduleAffecting.has(k)) scheduleTouched = true;
      }
      if (!updates.length) return res.json({ ok: true, changed: 0 });
      updates.push('updated_at = unixepoch()');
      values.push(req.params.id);
      db.prepare(`UPDATE bulk_campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      let rebuild = null;
      if (scheduleTouched) {
        rebuild = await bulk.rebuildPendingSlots(req.params.id);
      }
      res.json({ ok: true, changed: updates.length - 1, rebuild });
    } catch (err) {
      console.error('[bulk update]', redact(err.message));
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/bulk/campaigns/:id/activate', auth, async (req, res) => {
    try {
      const db = getDb();
      const { start_at } = req.body || {};
      if (start_at) {
        const ts = Math.floor(new Date(start_at).getTime() / 1000);
        db.prepare("UPDATE bulk_campaigns SET status='scheduled', scheduled_start_at=?, updated_at=unixepoch() WHERE id=?")
          .run(ts, req.params.id);
        res.json({ ok: true });
      } else {
        // "Iniciar agora": ativa E realinha slots pendentes começando de hoje,
        // pra não disparar em rajada tudo que ficou atrasado enquanto pausado.
        db.prepare("UPDATE bulk_campaigns SET status='active', scheduled_start_at=NULL, updated_at=unixepoch() WHERE id=?")
          .run(req.params.id);
        const rebuild = await bulk.rebuildPendingSlots(req.params.id, { resetStart: true });
        res.json({ ok: true, rebuild });
      }
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/bulk/campaigns/:id', auth, (req, res) => {
    getDb().prepare('DELETE FROM bulk_campaigns WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ==== DEBUG: rodar 1 item da campanha sync com log detalhado ====
  router.get('/debug/run-campaign/:id', auth, async (req, res) => {
    const logs = [];
    const log = (msg, data) => {
      const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const entry = `[${ts}] ${msg}` + (data !== undefined ? ` | ${JSON.stringify(data)}` : '');
      logs.push(entry);
      console.log('[debug]', entry);
    };

    try {
      log('=== DEBUG MANUAL ===');
      log(`Campanha ID: ${req.params.id}`);
      log(`Server TZ: ${process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone}`);
      log(`Server now (epoch): ${Math.floor(Date.now()/1000)} | BRT: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

      const db = getDb();
      const campaign = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(req.params.id);
      if (!campaign) return res.json({ ok: false, error: 'Campanha não encontrada', logs });
      log(`Campanha: ${campaign.name} | status=${campaign.status} | source=${campaign.source_type} | format=${campaign.post_format}`);

      if (campaign.status !== 'active') {
        log(`⚠️ Campanha não está ativa (status=${campaign.status}). Debug vai ignorar isso e tentar rodar 1 item mesmo assim.`);
      }

      // Pega o item pendente MAIS PRÓXIMO no passado (ou o próximo futuro)
      const nowSec = Math.floor(Date.now()/1000);
      let item = db.prepare(`SELECT * FROM bulk_campaign_items
        WHERE campaign_id = ? AND status = 'pending'
        ORDER BY (scheduled_at <= ?) DESC, scheduled_at ASC LIMIT 1`).get(req.params.id, nowSec);
      if (!item) return res.json({ ok: true, message: 'Nenhum item pending nesta campanha', logs });

      const scheduledBrt = new Date(item.scheduled_at*1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      log(`Item selecionado: id=${item.id} slot=${item.slot_index} scheduled_at=${item.scheduled_at} (${scheduledBrt})`);
      log(`Diff em segundos: ${nowSec - item.scheduled_at} (negativo = futuro; positivo = já passou)`);

      const meta = JSON.parse(item.drive_meta || '{}');
      log(`Meta do item:`, { source: meta.source, name: meta.name, url: meta.url, mimeType: meta.mimeType, hasFiles: !!meta.files?.length });

      // Contas destino
      const accountIds = JSON.parse(campaign.account_ids || '[]');
      const accounts = db.prepare(`SELECT id, platform, platform_username, ig_business_id
        FROM social_accounts WHERE id IN (${accountIds.map(()=>'?').join(',') || '0'})`).all(...accountIds);
      log(`${accounts.length} conta(s) alvo:`, accounts);

      if (!accounts.length) throw new Error('Nenhuma conta de destino ativa na campanha');

      // Se for drive, tenta listar / baixar
      const bulk = require('../lib/bulk');
      const drive = require('../lib/drive');
      const captions = require('../lib/captions');

      // Testa geração de legenda
      log('Testando geração de legenda...');
      const captionConfig = JSON.parse(campaign.caption_config || '{}');
      const caption = await captions.generateCaption(campaign.caption_mode, captionConfig);
      log(`Legenda gerada (${caption.length} chars): "${caption.slice(0,80)}"`);

      // Determina URL da mídia
      const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://zeus-post.jefersonhenrike.com';
      let mediaUrls = [];
      const fs = require('fs');
      const path = require('path');

      if (campaign.post_format === 'carousel' && meta.source === 'upload-carousel') {
        for (const f of (meta.files||[]).slice(0,10)) {
          mediaUrls.push(f.url.startsWith('http') ? f.url : PUBLIC_BASE + f.url);
        }
        log(`Carrossel upload: ${mediaUrls.length} lâminas`, mediaUrls);
      } else if (campaign.post_format === 'carousel') {
        log('Baixando arquivos do Drive (carrossel)...');
        for (const f of (meta.files||[]).slice(0,10)) {
          const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
          const filename = `debug-${Date.now()}-${Math.random().toString(36).slice(2)}${drive.extForMime(f.mimeType, f.name)}`;
          const dest = path.join(UPLOAD_DIR, filename);
          await drive.downloadFile(f.id, dest);
          const stat = fs.statSync(dest);
          log(`  baixou ${f.name} → ${filename} (${stat.size} bytes)`);
          mediaUrls.push(`${PUBLIC_BASE}/uploads/${filename}`);
        }
      } else if (meta.source === 'upload') {
        const url = meta.url.startsWith('http') ? meta.url : PUBLIC_BASE + meta.url;
        mediaUrls.push(url);
        // valida arquivo existe
        if (meta.path && fs.existsSync(meta.path)) {
          const stat = fs.statSync(meta.path);
          log(`Arquivo local: ${meta.path} (${stat.size} bytes, mtime ${stat.mtime.toISOString()})`);
        } else {
          log(`⚠️ Arquivo local NÃO existe: ${meta.path}`);
        }
      } else {
        log('Baixando arquivo do Drive...');
        const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
        const filename = `debug-${Date.now()}-${Math.random().toString(36).slice(2)}${drive.extForMime(meta.mimeType, meta.name)}`;
        const dest = path.join(UPLOAD_DIR, filename);
        await drive.downloadFile(item.drive_file_id, dest);
        const stat = fs.statSync(dest);
        log(`Baixou ${meta.name} → ${filename} (${stat.size} bytes)`);
        mediaUrls.push(`${PUBLIC_BASE}/uploads/${filename}`);
      }

      // Testa acessibilidade da URL pública
      const axios = require('axios');
      log('Testando acessibilidade pública da URL...');
      try {
        const head = await axios.head(mediaUrls[0], { validateStatus: () => true });
        log(`HEAD ${mediaUrls[0]} → HTTP ${head.status} content-length=${head.headers['content-length']||'?'}`);
        if (head.status >= 400) throw new Error(`URL inacessível: HTTP ${head.status}`);
      } catch (e) {
        log(`⚠️ HEAD falhou: ${e.message}`);
      }

      // === PASSO A: Container ===
      const account = accounts[0];
      const fullAccount = db.prepare('SELECT * FROM social_accounts WHERE id = ?').get(account.id);
      const igId = fullAccount.ig_business_id;
      const token = open(fullAccount.access_token); // token fica criptografado no banco

      const isVideo = campaign.post_format === 'video' ||
        (mediaUrls[0] && /\.(mp4|mov|m4v)(\?|$)/i.test(mediaUrls[0]));

      log(`PASSO A: Criando container IG (${isVideo ? 'REELS' : campaign.post_format === 'carousel' ? 'CAROUSEL' : 'IMAGE'})...`);
      let creationId;
      if (campaign.post_format === 'carousel') {
        const childIds = [];
        for (const url of mediaUrls) {
          const isVidChild = /\.(mp4|mov|m4v)(\?|$)/i.test(url);
          const params = isVidChild
            ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true, access_token: token }
            : { image_url: url, is_carousel_item: true, access_token: token };
          const r = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, params);
          childIds.push(r.data.id);
          log(`  child container: ${r.data.id}`);
        }
        const carouselRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, {
          media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: token
        });
        creationId = carouselRes.data.id;
      } else if (isVideo) {
        const trial = !!campaign.is_trial;
        const reelParams = trial
          ? { media_type: 'REELS', video_url: mediaUrls[0], caption, is_trial: true, access_token: token }
          : { media_type: 'REELS', video_url: mediaUrls[0], caption, share_to_feed: true, access_token: token };
        const r = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, reelParams);
        creationId = r.data.id;
      } else {
        const r = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, {
          image_url: mediaUrls[0], caption, access_token: token
        });
        creationId = r.data.id;
      }
      log(`Container criado: ${creationId}`);

      // === PASSO B: Poll status ===
      log('PASSO B: Aguardando processamento (polling status_code)...');
      let statusCode = 'IN_PROGRESS', attempts = 0;
      while (statusCode === 'IN_PROGRESS' && attempts < 24) {
        await new Promise(r => setTimeout(r, 5000));
        const st = await axios.get(`https://graph.facebook.com/v19.0/${creationId}`, {
          params: { fields: 'status_code,status', access_token: token }
        });
        statusCode = st.data.status_code;
        log(`  attempt ${attempts+1}: status_code=${statusCode} status=${st.data.status || '-'}`);
        if (statusCode === 'ERROR') throw new Error('Container em ERROR: ' + (st.data.status || 'sem detalhe'));
        attempts++;
      }
      if (statusCode !== 'FINISHED') throw new Error(`Timeout: status_code=${statusCode} após ${attempts} tentativas`);

      // === PASSO C: Publish ===
      log('PASSO C: Publicando...');
      const pub = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
        creation_id: creationId, access_token: token
      });
      log(`✅ PUBLICADO! platform_post_id=${pub.data.id}`);

      let postId = item.post_id;
      if (!postId) {
        const postType = campaign.post_format === 'carousel' ? 'carousel'
          : (isVideo ? 'video' : 'image');
        const mediaPath = campaign.post_format === 'carousel' ? JSON.stringify(mediaUrls) : mediaUrls[0];
        const ins = db.prepare(`INSERT INTO posts
          (title, caption, media_path, media_type, post_type, platforms, account_ids, scheduled_at, status)
          VALUES (?,?,?,?,?,?,?,?, 'published')`).run(
          `Bulk #${campaign.id}/${item.slot_index} [debug]`,
          caption, mediaPath, meta.mimeType || null, postType,
          JSON.stringify(['instagram']), JSON.stringify(accountIds), item.scheduled_at
        );
        postId = ins.lastInsertRowid;
        db.prepare('UPDATE bulk_campaign_items SET post_id=? WHERE id=?').run(postId, item.id);
        log(`Post shim criado: id=${postId} (bulk debug não tinha post_id vinculado)`);
      }

      db.prepare(`INSERT OR REPLACE INTO post_results (post_id, account_id, platform, platform_post_id, status, published_at)
        VALUES (?,?,?,?,'published', unixepoch())`).run(postId, account.id, 'instagram', pub.data.id);
      db.prepare(`UPDATE bulk_campaign_items SET status='published', processed_at=unixepoch() WHERE id=?`).run(item.id);
      db.prepare(`UPDATE bulk_campaigns SET published_count=published_count+1 WHERE id=?`).run(campaign.id);

      log(`✅ Item ${item.id} marcado como publicado no banco`);
      res.json({ ok: true, published_id: pub.data.id, item_id: item.id, logs });
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.message;
      const errFull = err.response?.data || null;
      log(`❌ ERRO: ${errMsg}`);
      if (errFull) log(`Detalhes da API:`, errFull);
      console.error('[debug] stack:', redact(err.stack));
      res.status(500).json({ ok: false, error: errMsg, full: errFull, logs });
    }
  });

  // ==== Recalcular slots de uma campanha (útil após fix de timezone) ====
  router.post('/bulk/campaigns/:id/rebuild-slots', auth, async (req, res) => {
    try {
      const db = getDb();
      const campaign = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(req.params.id);
      if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

      if (req.body.start_date) {
        db.prepare('UPDATE bulk_campaigns SET start_date = ? WHERE id = ?').run(req.body.start_date, campaign.id);
      }
      if (req.body.times) {
        db.prepare('UPDATE bulk_campaigns SET times = ? WHERE id = ?').run(JSON.stringify(req.body.times), campaign.id);
      }

      const r = await bulk.rebuildPendingSlots(req.params.id);
      res.json({ ok: true, ...r });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/settings/ai', auth, (req, res) => {
    const allowed = ['ai_claude_key', 'ai_openai_key', 'ai_gemini_key'];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k) && v) settingsLib.setSetting(k, v); // criptografada em repouso
    }
    res.json({ ok: true });
  });

  router.get('/settings/ai', auth, (req, res) => {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('ai_claude_key','ai_openai_key','ai_gemini_key')").all();
    const out = {};
    rows.forEach(r => { out[r.key + '_set'] = !!r.value; });
    res.json(out);
  });

  return router;
};
