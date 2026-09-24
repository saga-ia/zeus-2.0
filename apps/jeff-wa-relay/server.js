require('dotenv').config();
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const { MessageMedia } = require('whatsapp-web.js');
const { createChatwoot, phoneOnly } = require('./src/chatwoot');
const { createSession } = require('./src/session');

const PORT = parseInt(process.env.PORT || '3030', 10);
const TOKEN = process.env.API_TOKEN;
if (!TOKEN) { console.error('API_TOKEN ausente no .env'); process.exit(1); }

const SESSION_SLUGS = String(process.env.SESSIONS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

if (!SESSION_SLUGS.length) { console.error('SESSIONS ausente no .env'); process.exit(1); }

const DEFAULT_SLUG = SESSION_SLUGS[0];
const sessions = new Map();

for (const slug of SESSION_SLUGS) {
  const inboxId = process.env[`SESSION_${slug}_CHATWOOT_INBOX_ID`];
  const inboxIdent = process.env[`SESSION_${slug}_CHATWOOT_INBOX_IDENTIFIER`];
  const chatwoot = createChatwoot({ inboxId, inboxIdent, cacheKey: slug });
  const session = createSession({
    slug,
    dataPath: path.join(__dirname, 'session'),
    chatwoot,
  });
  sessions.set(slug, session);
  console.log(`[boot] sessao ${slug} inicializada (chatwoot=${chatwoot.enabled ? `inbox ${chatwoot.inboxId}` : 'off'})`);
}

const inboxToSlug = new Map();
for (const [slug, s] of sessions) {
  if (s.chatwoot.enabled) inboxToSlug.set(s.chatwoot.inboxId, slug);
}

function pickSession(req) {
  const slug = req.header('X-Session') || req.query.session || DEFAULT_SLUG;
  return sessions.get(slug) || null;
}

const app = express();
app.use(express.json({ limit: '25mb' }));

function auth(req, res, next) {
  const t = req.header('X-Token') || req.query.token || req.params.token;
  if (t !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function requireSession(req, res, next) {
  const s = pickSession(req);
  if (!s) return res.status(404).json({ error: 'session_not_found', hint: 'header X-Session ou ?session=slug' });
  req.session = s;
  next();
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.endsWith('@c.us') ? digits : `${digits}@c.us`;
}

async function renderQrPage(req, res) {
  const s = pickSession(req);
  if (!s) return res.status(404).type('html').send(`<h2>sessao invalida</h2>`);
  const st = s.state;
  if (!st.qr) {
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>WA Relay ${s.slug}</title>
<style>body{font-family:system-ui;background:#111;color:#eee;padding:24px;text-align:center}</style>
<h2>Sessao ${s.slug} - Status: ${st.status}</h2>
<p>${st.status === 'ready' ? `Numero ${st.phone} ja conectado.` : 'Aguarde alguns segundos e recarregue.'}</p>
<script>setTimeout(()=>location.reload(),5000)</script>`);
  }
  const dataUrl = await QRCode.toDataURL(st.qr, { width: 320, margin: 2 });
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>WA Relay QR ${s.slug}</title>
<style>body{font-family:system-ui;background:#111;color:#eee;display:flex;flex-direction:column;align-items:center;padding:24px}img{background:#fff;padding:8px;border-radius:8px}small{color:#888;margin-top:12px;display:block}</style>
<h2>Sessao ${s.slug} - Escaneie no WhatsApp</h2>
<img src="${dataUrl}" alt="QR">
<small>status: ${st.status}</small>
<small>gerado: ${st.qrAt || '-'}</small>
<small>recarrega sozinho em 20s</small>
<script>setTimeout(()=>location.reload(),20000)</script>`);
}

app.get('/health', (req, res) => {
  const out = { sessions: {} };
  for (const [slug, s] of sessions) {
    out.sessions[slug] = {
      status: s.state.status,
      phone: s.state.phone,
      readyAt: s.state.readyAt,
      qrAt: s.state.qrAt,
      lastDisconnect: s.state.lastDisconnect,
      chatwootInbox: s.chatwoot.enabled ? s.chatwoot.inboxId : null,
    };
  }
  res.json(out);
});

app.get('/qr', auth, renderQrPage);
app.get('/qr/:token', auth, renderQrPage);

async function renderPairPage(req, res) {
  const s = pickSession(req);
  if (!s) return res.status(404).type('html').send('<h2>sessao invalida</h2>');
  const phone = String(req.query.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return res.status(400).type('html').send('<h2>?phone=DDIDDInumero obrigatorio (so digitos)</h2>');
  if (s.state.status === 'ready') {
    return res.type('html').send(`<h2>Sessao ${s.slug} ja conectada como ${s.state.phone}</h2>`);
  }
  if (!s.state.qr) {
    return res.type('html').send(`<h2>Sessao ${s.slug} ainda nao gerou QR (status: ${s.state.status})</h2><p>Aguarde alguns segundos e recarregue.</p><script>setTimeout(()=>location.reload(),4000)</script>`);
  }
  try {
    const code = await s.client.requestPairingCode(phone, true);
    const pretty = code.match(/.{1,4}/g).join('-');
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>WA Pair ${s.slug}</title>
<style>body{font-family:system-ui;background:#111;color:#eee;text-align:center;padding:32px}code{font-size:44px;letter-spacing:8px;background:#222;padding:16px 24px;border-radius:12px;display:inline-block;margin:16px}small{color:#888;display:block;margin-top:16px}</style>
<h2>Sessao ${s.slug} - Codigo de pareamento</h2>
<code>${pretty}</code>
<p>No celular <b>+${phone}</b>: WhatsApp -> Aparelhos conectados -> Conectar aparelho -> <b>Conectar com numero de telefone</b> -> digite o codigo acima.</p>
<small>codigo valido por ~60s. recarregue pra gerar novo.</small>`);
  } catch (e) {
    console.error(`[${s.slug}:pair] erro:`, e.message);
    res.status(500).type('html').send(`<h2>erro ao gerar codigo</h2><pre>${e.message}</pre>`);
  }
}

app.get('/pair', auth, renderPairPage);
app.get('/pair/:token', auth, renderPairPage);

app.post('/send', auth, requireSession, async (req, res) => {
  const s = req.session;
  if (s.state.status !== 'ready') {
    return res.status(503).json({ error: 'not_ready', session: s.slug, status: s.state.status });
  }
  const { to, message, linkPreview } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'to_and_message_required' });
  const chatId = normalizePhone(to);
  if (!chatId) return res.status(400).json({ error: 'invalid_phone' });
  try {
    const sent = await s.client.sendMessage(chatId, String(message), { linkPreview: linkPreview === true });
    res.json({ ok: true, session: s.slug, id: sent.id ? sent.id._serialized : null, to: chatId });
  } catch (e) {
    console.error(`[${s.slug}:send] erro:`, e.message);
    res.status(500).json({ error: 'send_failed', message: e.message });
  }
});

app.post('/send-media', auth, requireSession, async (req, res) => {
  const s = req.session;
  if (s.state.status !== 'ready') {
    return res.status(503).json({ error: 'not_ready', session: s.slug, status: s.state.status });
  }
  const { to, url, base64, mimetype, filename, caption, sendAsDocument, sendAsVoice } = req.body || {};
  if (!to) return res.status(400).json({ error: 'to_required' });
  if (!url && !base64) return res.status(400).json({ error: 'url_or_base64_required' });
  if (base64 && !mimetype) return res.status(400).json({ error: 'mimetype_required_with_base64' });
  const chatId = normalizePhone(to);
  if (!chatId) return res.status(400).json({ error: 'invalid_phone' });
  try {
    let media;
    if (url) {
      media = await MessageMedia.fromUrl(url, { unsafeMime: true, filename });
    } else {
      media = new MessageMedia(mimetype, base64, filename || null);
    }
    const opts = {};
    if (caption) opts.caption = String(caption);
    if (sendAsDocument) opts.sendMediaAsDocument = true;
    if (sendAsVoice) opts.sendAudioAsVoice = true;
    const sent = await s.client.sendMessage(chatId, media, opts);
    res.json({ ok: true, session: s.slug, id: sent.id ? sent.id._serialized : null, to: chatId });
  } catch (e) {
    console.error(`[${s.slug}:send-media] erro:`, e.message);
    res.status(500).json({ error: 'send_failed', message: e.message });
  }
});

// Chatwoot → WhatsApp: roteia pela inbox_id do payload
app.post('/chatwoot/outgoing', async (req, res) => {
  res.json({ ok: true });
  const body = req.body || {};
  try {
    if (body.event !== 'message_created') return;
    if (body.message_type !== 'outgoing') return;
    if (body.private === true) return;

    const inboxId = body.inbox && body.inbox.id;
    const slug = inboxId ? inboxToSlug.get(Number(inboxId)) : null;
    const s = slug ? sessions.get(slug) : null;
    if (!s) { console.warn('[chatwoot out] inbox sem sessao mapeada:', inboxId); return; }
    if (body.id && s.chatwoot.wasImportedMsg(body.id)) return;
    const senderType = body.sender && (body.sender.type || body.sender.kind);
    if (senderType && !['user', 'agent_bot', 'User'].includes(senderType)) return;
    if (s.state.status !== 'ready') {
      console.warn(`[${slug}:chatwoot out] sessao nao ready, skip:`, s.state.status);
      return;
    }

    const conv = body.conversation || {};
    const sender = (conv.meta && conv.meta.sender) || {};
    let phone = phoneOnly(sender.phone_number || sender.identifier || '');
    if (!phone && conv.id) {
      const cached = s.chatwoot.lookupByConvId(conv.id);
      if (cached) phone = cached.phone;
    }
    if (!phone) { console.warn(`[${slug}:chatwoot out] sem phone p/ conv`, conv.id); return; }

    const chatId = `${phone}@c.us`;
    const text = body.content || '';
    const attachments = body.attachments || [];

    if (attachments.length) {
      for (const att of attachments) {
        try {
          const media = await MessageMedia.fromUrl(att.data_url || att.file_url || att.url, { unsafeMime: true });
          const opts = {};
          if (text) opts.caption = text;
          const sent = await s.client.sendMessage(chatId, media, opts);
          if (sent && sent.id) s.chatwoot.markSentByUs(sent.id._serialized);
        } catch (e) {
          console.error(`[${slug}:chatwoot out] media erro:`, e.message);
        }
      }
      return;
    }

    if (text) {
      const sent = await s.client.sendMessage(chatId, text, { linkPreview: false });
      if (sent && sent.id) s.chatwoot.markSentByUs(sent.id._serialized);
    }
  } catch (e) {
    console.error('[chatwoot out] erro:', e.message);
  }
});

app.post('/chatwoot/import-history', auth, requireSession, async (req, res) => {
  const s = req.session;
  if (!s.chatwoot.enabled) return res.status(400).json({ error: 'chatwoot_disabled_for_session' });
  if (s.state.status !== 'ready') return res.status(503).json({ error: 'not_ready', status: s.state.status });

  const { since, until, limitPerChat = 200, dryRun = false } = req.body || {};
  if (!since || !until) return res.status(400).json({ error: 'since_and_until_required_iso8601' });
  const sinceTs = Math.floor(new Date(since).getTime() / 1000);
  const untilTs = Math.floor(new Date(until).getTime() / 1000);
  if (!Number.isFinite(sinceTs) || !Number.isFinite(untilTs) || untilTs <= sinceTs) {
    return res.status(400).json({ error: 'invalid_range' });
  }

  res.json({ ok: true, session: s.slug, started: true, since, until, dryRun });

  (async () => {
    const stats = { chatsScanned: 0, msgsImported: 0, errors: 0, contacts: 0 };
    try {
      const chats = await s.client.getChats();
      console.log(`[${s.slug}:import] ${chats.length} chats, varrendo...`);
      for (const chat of chats) {
        if (chat.isGroup) continue;
        if (!chat.id || !chat.id._serialized) continue;
        stats.chatsScanned++;
        let msgs;
        try { msgs = await chat.fetchMessages({ limit: limitPerChat }); }
        catch (e) { console.error(`[${s.slug}:import] fetchMessages:`, e.message); stats.errors++; continue; }
        const outgoing = msgs.filter(m => m.fromMe && m.timestamp >= sinceTs && m.timestamp <= untilTs && (m.body || m.hasMedia));
        if (!outgoing.length) continue;

        let phone = null;
        const serialized = chat.id._serialized;
        if (serialized.endsWith('@c.us')) {
          phone = phoneOnly(serialized);
        } else {
          try {
            const contact = await chat.getContact();
            if (contact && contact.id && contact.id.server === 'c.us' && contact.id.user) {
              const u = String(contact.id.user).replace(/\D/g, '');
              if (u.length >= 10 && u.length <= 13) phone = u;
            }
          } catch { /* ignore */ }
        }
        if (!phone) { console.warn(`[${s.slug}:import] sem telefone p/`, serialized); stats.errors++; continue; }
        for (const m of outgoing) {
          const content = m.body || '[midia]';
          if (dryRun) { stats.msgsImported++; continue; }
          try {
            await s.chatwoot.postOutgoingMessage(phone, { content });
            stats.msgsImported++;
          } catch (e) {
            console.error(`[${s.slug}:import] post ${phone}:`, e.message);
            stats.errors++;
          }
          await new Promise(r => setTimeout(r, 200));
        }
        stats.contacts++;
      }
      console.log(`[${s.slug}:import] done:`, JSON.stringify(stats));
    } catch (e) {
      console.error(`[${s.slug}:import] fatal:`, e.message);
    }
  })();
});

app.post('/logout', auth, requireSession, async (req, res) => {
  const s = req.session;
  try {
    await s.client.logout();
    s.state.status = 'logged_out';
    s.state.phone = null;
    res.json({ ok: true, session: s.slug });
  } catch (e) {
    res.status(500).json({ error: 'logout_failed', message: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[http] jeff-wa-relay porta ${PORT} | sessoes: ${SESSION_SLUGS.join(', ')} | default: ${DEFAULT_SLUG}`);
});

process.on('SIGTERM', async () => {
  console.log('[sig] SIGTERM');
  for (const s of sessions.values()) {
    try { await s.client.destroy(); } catch {}
  }
  process.exit(0);
});
