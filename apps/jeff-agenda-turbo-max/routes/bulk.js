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

const uploadGuard = require('../lib/upload-guard');
const bulkUploadStorage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, uploadGuard.nomeSeguro(file, 'bulk-'))
});
const bulkUpload = multer({
  storage: bulkUploadStorage,
  limits: { fileSize: 500 * 1024 * 1024, files: 500 },
  fileFilter: uploadGuard.fileFilter
});

module.exports = function(auth) {
  const router = express.Router();

  router.post('/bulk/upload-batch', auth, (req, res, next) => {
    bulkUpload.array('files', 500)(req, res, (err) => err ? uploadGuard.tratarErroUpload(err, req, res, next) : next());
  }, (req, res) => {
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
      const { drive_url, post_format, posts_per_day, total_days } = req.body;
      const total_slots = (parseInt(posts_per_day, 10) || 0) * (parseInt(total_days, 10) || 0);
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
      res.json({ total_slots, drive_items, sufficient: drive_items === null || drive_items >= total_slots });
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
      drive_meta, status, error_message, processed_at, post_id, retry_count FROM bulk_campaign_items
      WHERE campaign_id = ? ORDER BY slot_index ASC`).all(req.params.id);
    // expõe nome/preview da mídia pra galeria, sem vazar caminho absoluto do disco
    items.forEach(it => {
      let meta = {};
      try { meta = JSON.parse(it.drive_meta || '{}'); } catch {}
      const files = Array.isArray(meta.files) ? meta.files : [];
      it.media = {
        source: meta.source || 'drive',
        name: meta.name || meta.groupName || meta.folderName || files[0]?.name || null,
        mimeType: meta.mimeType || files[0]?.mimeType || null,
        // upload: URL pública servida por /uploads → dá pra ver o preview de verdade
        url: meta.url || files[0]?.url || null,
        count: files.length || 1
      };
      delete it.drive_meta;
    });
    res.json({ campaign: c, items });
  });

  router.post('/bulk/campaigns/:id/pause', auth, (req, res) => {
    getDb().prepare("UPDATE bulk_campaigns SET status='paused', updated_at=unixepoch() WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/bulk/campaigns/:id/resume', auth, (req, res) => {
    getDb().prepare("UPDATE bulk_campaigns SET status='active', updated_at=unixepoch() WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });

  // Edição da campanha.
  //
  // Antes, isto gravava só a configuração em `bulk_campaigns` e ia embora — os
  // itens já agendados em `bulk_campaign_items` continuavam com os horários e a
  // quantidade antigos. Como são ELES que o worker publica, a edição não tinha
  // efeito nenhum ("salvo e continua a programação antiga").
  //
  // Agora, ao mudar algo que afeta o agendamento, os itens PENDENTES são
  // recalculados. Itens publicados ou em publicação nunca são tocados.
  router.put('/bulk/campaigns/:id', auth, async (req, res) => {
    try {
      const db = getDb();
      const c = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(req.params.id);
      if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });

      const allowed = ['name', 'account_ids', 'posts_per_day', 'total_days', 'times', 'start_date',
                       'caption_mode', 'caption_config', 'suspensions', 'story_config'];
      const jsonFields = ['account_ids','times','caption_config','suspensions','story_config'];
      // campos que mudam QUANDO cada publicação sai
      const afetamAgenda = ['posts_per_day', 'total_days', 'times', 'start_date', 'suspensions', 'story_config'];

      const updates = [], values = [];
      let precisaRecalcular = false;
      for (const k of allowed) {
        if (req.body[k] === undefined) continue;
        const novo = jsonFields.includes(k) ? JSON.stringify(req.body[k]) : req.body[k];
        if (String(novo) !== String(c[k])) {           // só conta se mudou de fato
          if (afetamAgenda.includes(k)) precisaRecalcular = true;
        }
        updates.push(`${k} = ?`);
        values.push(novo);
      }

      // validação de limites antes de gravar (mesma trava da criação)
      const timesNovo = req.body.times ?? JSON.parse(c.times || '[]');
      const ppdNovo = req.body.posts_per_day ?? c.posts_per_day;
      const scNovo = req.body.story_config ?? JSON.parse(c.story_config || '{}');
      const { validateCampaignLimits } = require('../lib/limits');
      const violacoes = validateCampaignLimits({
        posts_per_day: ppdNovo, times: timesNovo, jitter_minutes: c.jitter_minutes ?? 5,
        stories_per_burst: scNovo.stories_per_burst ?? 1,
        burst_interval_minutes: scNovo.burst_interval_minutes ?? 3,
        mirror_to_story: !!scNovo.mirror_to_story
      }, c.post_format === 'story' ? 'instagram_story' : 'instagram');
      if (violacoes.length) {
        return res.status(400).json({ error: 'Limite de segurança da plataforma: ' + violacoes.join(' | ') });
      }

      if (updates.length) {
        updates.push('updated_at = unixepoch()');
        db.prepare(`UPDATE bulk_campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.params.id);
      }

      const atualizada = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(req.params.id);
      const resumo = { ok: true, campos_alterados: updates.length ? updates.length - 1 : 0,
                       horarios_recalculados: 0, itens_removidos: 0 };

      // === reduzir a quantidade de publicações ===
      // Remove os pendentes mais distantes primeiro; nunca mexe no que já saiu.
      if (req.body.target_count !== undefined) {
        const alvo = Math.max(0, parseInt(req.body.target_count, 10) || 0);
        const total = db.prepare('SELECT COUNT(*) n FROM bulk_campaign_items WHERE campaign_id = ?').get(req.params.id).n;
        const intocaveis = db.prepare(`SELECT COUNT(*) n FROM bulk_campaign_items
          WHERE campaign_id = ? AND status IN ('published','processing')`).get(req.params.id).n;

        if (alvo < intocaveis) {
          return res.status(400).json({
            error: `Não dá para reduzir para ${alvo}: ${intocaveis} publicação(ões) já saíram ou estão saindo agora. O mínimo possível é ${intocaveis}.`
          });
        }
        if (alvo < total) {
          const sobrando = total - alvo;
          const remover = db.prepare(`SELECT id, drive_meta FROM bulk_campaign_items
            WHERE campaign_id = ? AND status IN ('pending','failed')
            ORDER BY scheduled_at DESC LIMIT ?`).all(req.params.id, sobrando);
          const del = db.prepare('DELETE FROM bulk_campaign_items WHERE id = ?');
          const apagarTudo = db.transaction(() => {
            for (const it of remover) {
              // limpa o arquivo local do upload junto (Drive não é tocado)
              try {
                const meta = JSON.parse(it.drive_meta || '{}');
                const paths = [];
                if (meta.source === 'upload' && meta.path) paths.push(meta.path);
                if (Array.isArray(meta.files)) meta.files.forEach(f => f.path && paths.push(f.path));
                for (const p of paths) {
                  const abs = path.resolve(p);
                  if (abs.startsWith(path.resolve(UPLOAD_DIR)) && fs.existsSync(abs)) fs.unlinkSync(abs);
                }
              } catch {}
              del.run(it.id);
            }
          });
          apagarTudo();
          resumo.itens_removidos = remover.length;
        }
      }

      // === recalcular os horários dos itens pendentes ===
      if (precisaRecalcular || resumo.itens_removidos) {
        const pendentes = db.prepare(`SELECT id FROM bulk_campaign_items
          WHERE campaign_id = ? AND status = 'pending' ORDER BY slot_index ASC`).all(req.params.id);
        if (pendentes.length) {
          const slots = await bulk.buildSlots(atualizada);
          const upd = db.prepare('UPDATE bulk_campaign_items SET scheduled_at = ?, slot_index = ? WHERE id = ?');
          const aplicar = db.transaction(() => {
            for (let i = 0; i < pendentes.length && i < slots.length; i++) {
              upd.run(slots[i], i, pendentes[i].id);
            }
          });
          aplicar();
          resumo.horarios_recalculados = Math.min(pendentes.length, slots.length);
          resumo.primeiro_horario = slots[0]
            ? new Date(slots[0] * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
          if (slots.length < pendentes.length) {
            resumo.aviso = `A nova configuração gera ${slots.length} horário(s), menos que os ${pendentes.length} itens pendentes. ` +
              `Os ${pendentes.length - slots.length} últimos ficaram sem horário novo — reduza a quantidade ou aumente os dias/horários.`;
          }
        }
      }

      // mantém o contador coerente
      db.prepare(`UPDATE bulk_campaigns SET total_items = (
          SELECT COUNT(*) FROM bulk_campaign_items WHERE campaign_id = ?
        ) WHERE id = ?`).run(req.params.id, req.params.id);
      resumo.total_items = db.prepare('SELECT total_items FROM bulk_campaigns WHERE id = ?').get(req.params.id).total_items;

      console.log(`[bulk] campanha ${req.params.id} editada:`, JSON.stringify(resumo));
      res.json(resumo);
    } catch (err) {
      console.error('[bulk edit]', redact(err?.stack || err));
      res.status(500).json({ error: redact(err.message) });
    }
  });

  // Retomar/iniciar.
  // Ao voltar de uma pausa, os itens cujo horário passou durante a pausa são
  // remarcados para a próxima grade — antes eles saíam todos de uma vez no
  // primeiro tick, furando os horários programados.
  router.post('/bulk/campaigns/:id/activate', auth, (req, res) => {
    const db = getDb();
    const { start_at } = req.body || {};
    if (start_at) {
      const ts = Math.floor(new Date(start_at).getTime() / 1000);
      db.prepare("UPDATE bulk_campaigns SET status='scheduled', scheduled_start_at=?, updated_at=unixepoch() WHERE id=?")
        .run(ts, req.params.id);
      return res.json({ ok: true, agendada_para: new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) });
    }

    db.prepare("UPDATE bulk_campaigns SET status='active', scheduled_start_at=NULL, updated_at=unixepoch() WHERE id=?")
      .run(req.params.id);

    let remarcados = 0, proximo = null;
    try {
      const c = db.prepare('SELECT * FROM bulk_campaigns WHERE id = ?').get(req.params.id);
      const agora = Math.floor(Date.now() / 1000);
      const vencidos = db.prepare(`SELECT id FROM bulk_campaign_items
        WHERE campaign_id = ? AND status = 'pending' AND scheduled_at < ?
        ORDER BY scheduled_at ASC`).all(req.params.id, agora);

      if (vencidos.length) {
        const ultimoFuturo = db.prepare(`SELECT MAX(scheduled_at) m FROM bulk_campaign_items
          WHERE campaign_id = ? AND status = 'pending' AND scheduled_at >= ?`).get(req.params.id, agora).m;
        const slots = bulk.buildSlotsFrom(c, Math.max(agora, ultimoFuturo || 0), vencidos.length);
        const upd = db.prepare('UPDATE bulk_campaign_items SET scheduled_at = ? WHERE id = ?');
        db.transaction(() => {
          for (let i = 0; i < vencidos.length && i < slots.length; i++) upd.run(slots[i], vencidos[i].id);
        })();
        remarcados = Math.min(vencidos.length, slots.length);
      }

      const prox = db.prepare(`SELECT MIN(scheduled_at) m FROM bulk_campaign_items
        WHERE campaign_id = ? AND status = 'pending'`).get(req.params.id).m;
      if (prox) proximo = new Date(prox * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch (e) {
      console.error('[bulk activate] remarcação falhou:', e.message);
    }

    console.log(`[bulk] campanha ${req.params.id} retomada — ${remarcados} item(ns) remarcado(s), próxima em ${proximo || '—'}`);
    res.json({ ok: true, remarcados, proxima_publicacao: proximo });
  });

  router.delete('/bulk/campaigns/:id', auth, (req, res) => {
    getDb().prepare('DELETE FROM bulk_campaigns WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // Remove UM item da programação (sem mexer no resto da campanha).
  // Só itens ainda não publicados — o que já foi ao ar não se desfaz por aqui.
  router.delete('/bulk/campaigns/:id/items/:itemId', auth, (req, res) => {
    const db = getDb();
    const item = db.prepare('SELECT * FROM bulk_campaign_items WHERE id = ? AND campaign_id = ?')
      .get(req.params.itemId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado nesta campanha' });
    if (item.status === 'published') {
      return res.status(400).json({ error: 'Este item já foi publicado no Instagram — remover aqui não apaga o post que já está no ar.' });
    }
    if (item.status === 'processing') {
      return res.status(400).json({ error: 'Este item está sendo publicado neste momento. Aguarde terminar e tente de novo.' });
    }

    // apaga o arquivo local do upload, se ainda existir (Drive não é tocado)
    let removedFile = false;
    try {
      const meta = JSON.parse(item.drive_meta || '{}');
      const paths = [];
      if (meta.source === 'upload' && meta.path) paths.push(meta.path);
      if (Array.isArray(meta.files)) meta.files.forEach(f => f.path && paths.push(f.path));
      for (const p of paths) {
        // só apaga dentro de data/uploads — nunca fora
        const resolved = path.resolve(p);
        if (resolved.startsWith(path.resolve(UPLOAD_DIR)) && fs.existsSync(resolved)) {
          fs.unlinkSync(resolved);
          removedFile = true;
        }
      }
    } catch (e) { /* arquivo já sumiu: segue */ }

    db.prepare('DELETE FROM bulk_campaign_items WHERE id = ?').run(item.id);
    // mantém o contador coerente com o que sobrou
    db.prepare(`UPDATE bulk_campaigns SET total_items = (
        SELECT COUNT(*) FROM bulk_campaign_items WHERE campaign_id = ?
      ), updated_at = unixepoch() WHERE id = ?`).run(req.params.id, req.params.id);

    const total = db.prepare('SELECT total_items FROM bulk_campaigns WHERE id = ?').get(req.params.id)?.total_items;
    console.log(`[bulk] item ${item.id} removido da campanha ${req.params.id} (arquivo local apagado: ${removedFile})`);
    res.json({ ok: true, removed_file: removedFile, total_items: total });
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
      const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://agendaturbomax.jefersonhenrike.com';
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
        const r = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, {
          media_type: 'REELS', video_url: mediaUrls[0], caption, share_to_feed: true, access_token: token
        });
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

      // Só recalcula slots ainda pendentes
      const pendingItems = db.prepare(`SELECT * FROM bulk_campaign_items
        WHERE campaign_id = ? AND status = 'pending' ORDER BY slot_index ASC`).all(campaign.id);

      if (!pendingItems.length) return res.json({ ok: true, message: 'Sem itens pendentes pra recalcular', updated: 0 });

      // Se novo start_date foi passado, atualiza
      if (req.body.start_date) {
        db.prepare('UPDATE bulk_campaigns SET start_date = ? WHERE id = ?').run(req.body.start_date, campaign.id);
        campaign.start_date = req.body.start_date;
      }
      if (req.body.times) {
        db.prepare('UPDATE bulk_campaigns SET times = ? WHERE id = ?').run(JSON.stringify(req.body.times), campaign.id);
        campaign.times = JSON.stringify(req.body.times);
      }

      const slots = await bulk.buildSlots(campaign);
      let updated = 0;
      for (let i = 0; i < Math.min(slots.length, pendingItems.length); i++) {
        db.prepare('UPDATE bulk_campaign_items SET scheduled_at = ? WHERE id = ?')
          .run(slots[i], pendingItems[i].id);
        updated++;
      }
      res.json({ ok: true, updated, first_slot_brt: slots[0] ? new Date(slots[0]*1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null });
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
