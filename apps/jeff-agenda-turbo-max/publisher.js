const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://agendaturbomax.jefersonhenrike.com';

function toPublicUrl(mediaPath) {
  if (!mediaPath) return mediaPath;
  if (/^https?:\/\//i.test(mediaPath)) return mediaPath;
  if (mediaPath.startsWith('/uploads/')) return PUBLIC_BASE + mediaPath;
  if (mediaPath.startsWith('/')) return PUBLIC_BASE + mediaPath;
  if (path.isAbsolute(mediaPath) && mediaPath.includes('/uploads/')) {
    const idx = mediaPath.indexOf('/uploads/');
    return PUBLIC_BASE + mediaPath.slice(idx);
  }
  return mediaPath;
}

const { ensureFreshToken } = require('./lib/tokens');
const { seal, redact } = require('./lib/crypto');

async function publishPost(post, db) {
  const results = [];
  const accounts = post.account_ids.length > 0
    ? db.prepare(`SELECT * FROM social_accounts WHERE id IN (${post.account_ids.map(() => '?').join(',') || '0'})`).all(...post.account_ids)
    : db.prepare('SELECT * FROM social_accounts WHERE status = ?').all('active');

  for (const account of accounts) {
    const tag = `[publisher] post ${post.id} → ${account.platform}@${account.platform_username || account.id}`;
    const startedAt = Date.now();
    try {
      // renova (YouTube/TikTok) e descriptografa o token antes de usar
      account.access_token = await ensureFreshToken(db, account);

      console.log(`${tag}: iniciando publicação (${post.post_type})`);
      let platformPostId;
      if (account.platform === 'instagram') platformPostId = await publishInstagram(post, account);
      else if (account.platform === 'youtube') platformPostId = await publishYoutube(post, account);
      else if (account.platform === 'tiktok') platformPostId = await publishTikTok(post, account);

      db.prepare(`INSERT OR REPLACE INTO post_results (post_id, account_id, platform, platform_post_id, status, published_at, access_token_used)
        VALUES (?,?,?,?,'published',unixepoch(),?)`).run(post.id, account.id, account.platform, platformPostId, seal(account.access_token));
      results.push({ platform: account.platform, status: 'published', platform_post_id: platformPostId });
      console.log(`${tag}: ✅ publicado em ${((Date.now() - startedAt) / 1000).toFixed(1)}s (id=${platformPostId})`);
    } catch (err) {
      // redact: a Meta ecoa access_token em algumas respostas de erro, e o
      // error_message vai parar na tela e no banco
      const msg = redact(err.response?.data?.error?.message
        || (err.response?.data ? JSON.stringify(err.response.data) : err.message));
      db.prepare(`INSERT OR REPLACE INTO post_results (post_id, account_id, platform, status, error_message)
        VALUES (?,?,?,'failed',?)`).run(post.id, account.id, account.platform, msg);
      results.push({ platform: account.platform, status: 'failed', error: msg });
      console.error(`${tag}: ❌ falhou em ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ${msg}`);
    }
  }

  const allFailed = results.every(r => r.status === 'failed');
  const allPublished = results.every(r => r.status === 'published');
  db.prepare(`UPDATE posts SET status=?, published_at=unixepoch(), updated_at=unixepoch() WHERE id=?`).run(
    allFailed ? 'failed' : allPublished ? 'published' : 'partial', post.id);

  return results;
}

async function publishInstagram(post, account) {
  const igId = account.ig_business_id;
  const token = account.access_token;

  const isVideoExt = (u) => /\.(mp4|mov|m4v)(\?|$)/i.test(u || '');
  const looksLikeVideo = post.post_type === 'video' || post.post_type === 'reel' || isVideoExt(post.media_path);

  // STORIES: container com media_type=STORIES. A API não aceita legenda,
  // stickers, enquetes nem link em stories — só a mídia.
  if (post.post_type === 'story') {
    const mediaUrl = toPublicUrl(post.media_path);
    const isVideo = isVideoExt(mediaUrl);
    const params = isVideo
      ? { media_type: 'STORIES', video_url: mediaUrl, access_token: token }
      : { media_type: 'STORIES', image_url: mediaUrl, access_token: token };
    const uploadRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, params);
    const containerId = uploadRes.data.id;
    // vídeo precisa terminar o processamento; imagem publica direto
    if (isVideo) await waitForContainer(containerId, token);
    const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
      creation_id: containerId, access_token: token
    });
    return publishRes.data.id;
  }

  if (post.post_type === 'carousel') {
    const raw = Array.isArray(post.media_path) ? post.media_path : JSON.parse(post.media_path || '[]');
    const urls = raw.map(toPublicUrl);
    if (urls.length < 2 || urls.length > 10) throw new Error('Carrossel exige entre 2 e 10 mídias');

    const childIds = [];
    for (const url of urls) {
      const isVideo = isVideoExt(url);
      const params = isVideo
        ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true, access_token: token }
        : { image_url: url, is_carousel_item: true, access_token: token };
      const r = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, params);
      const cid = r.data.id;
      if (isVideo) await waitForContainer(cid, token);
      childIds.push(cid);
    }
    const carouselRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, {
      media_type: 'CAROUSEL', children: childIds.join(','), caption: post.caption, access_token: token
    });
    const containerId = carouselRes.data.id;
    await waitForContainer(containerId, token);
    const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
      creation_id: containerId, access_token: token
    });
    return publishRes.data.id;
  }

  const mediaUrl = toPublicUrl(post.media_path);

  if (looksLikeVideo) {
    const uploadRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, {
      media_type: 'REELS', video_url: mediaUrl, caption: post.caption,
      share_to_feed: true, access_token: token
    });
    const containerId = uploadRes.data.id;
    await waitForContainer(containerId, token);
    const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
      creation_id: containerId, access_token: token
    });
    return publishRes.data.id;
  } else {
    const uploadRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media`, {
      image_url: mediaUrl, caption: post.caption, access_token: token
    });
    const containerId = uploadRes.data.id;
    const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
      creation_id: containerId, access_token: token
    });
    return publishRes.data.id;
  }
}

// Vídeos grandes levam vários minutos pra processar no lado da Meta — 120s
// derrubava Reels legítimos com timeout. 10 min de espera, poll a cada 10s.
async function waitForContainer(containerId, token, maxWait = 600000, pollInterval = 10000) {
  const start = Date.now();
  let lastStatus = null;
  while (Date.now() - start < maxWait) {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${containerId}`, {
      params: { fields: 'status_code,status', access_token: token }
    });
    lastStatus = res.data;
    if (res.data.status_code === 'FINISHED') return;
    if (res.data.status_code === 'ERROR') throw new Error('Container error: ' + (res.data.status || 'sem detalhe'));
    if (res.data.status_code === 'EXPIRED') throw new Error('Container expirou antes da publicação');
    await new Promise(r => setTimeout(r, pollInterval));
  }
  const elapsed = Math.round((Date.now() - start) / 1000);
  throw new Error(`Timeout aguardando container IG após ${elapsed}s (último status: ${lastStatus?.status_code || 'sem resposta'})`);
}

async function publishYoutube(post, account) {
  const token = account.access_token;
  if (!post.media_path || !fs.existsSync(post.media_path)) throw new Error('Arquivo de vídeo não encontrado');

  const meta = { snippet: { title: post.title || post.caption.slice(0, 100), description: post.caption, categoryId: '22' }, status: { privacyStatus: 'public' } };
  const form = new FormData();
  form.append('metadata', JSON.stringify(meta), { contentType: 'application/json' });
  form.append('video', fs.createReadStream(post.media_path));

  const res = await axios.post('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() }
  });
  return res.data.id;
}

async function publishTikTok(post, account) {
  const token = account.access_token;
  if (!post.media_path || !fs.existsSync(post.media_path)) throw new Error('Arquivo de vídeo não encontrado');

  const initRes = await axios.post('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    post_info: { title: post.caption.slice(0, 150), privacy_level: 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false },
    source_info: { source: 'FILE_UPLOAD', video_size: fs.statSync(post.media_path).size, chunk_size: fs.statSync(post.media_path).size, total_chunk_count: 1 }
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' } });

  const { publish_id, upload_url } = initRes.data.data;
  const fileBuffer = fs.readFileSync(post.media_path);
  const fileSize = fileBuffer.length;

  await axios.put(upload_url, fileBuffer, {
    headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`, 'Content-Length': fileSize }
  });

  return publish_id;
}

module.exports = { publishPost };
