const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { phoneOnly } = require('./chatwoot');

function createSession({ slug, dataPath, chatwoot }) {
  const state = {
    slug,
    status: 'starting',
    qr: null,
    qrAt: null,
    phone: null,
    readyAt: null,
    lastDisconnect: null,
  };

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: `session-${slug}`, dataPath }),
    puppeteer: {
      headless: true,
      executablePath: '/usr/bin/chromium',
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
      ],
    },
  });

  client.on('qr', (qr) => {
    state.status = 'qr';
    state.qr = qr;
    state.qrAt = new Date().toISOString();
    console.log(`[${slug}:qr] novo QR gerado`);
  });

  client.on('authenticated', () => {
    state.status = 'authenticated';
    console.log(`[${slug}:auth] autenticado`);
  });

  client.on('ready', () => {
    state.status = 'ready';
    state.qr = null;
    state.readyAt = new Date().toISOString();
    state.phone = client.info && client.info.wid ? client.info.wid.user : null;
    console.log(`[${slug}:ready] conectado como ${state.phone}`);
  });

  client.on('disconnected', (reason) => {
    state.status = 'disconnected';
    state.lastDisconnect = { reason, at: new Date().toISOString() };
    console.log(`[${slug}:disconnected] ${reason}`);
  });

  client.on('auth_failure', (msg) => {
    state.status = 'auth_failure';
    console.error(`[${slug}:auth_failure]`, msg);
  });

  client.on('message', async (msg) => {
    if (!chatwoot.enabled) return;
    try {
      if (msg.from.endsWith('@g.us')) return;
      if (msg.fromMe) return;
      if (chatwoot.wasSentByUs(msg.id && msg.id._serialized)) return;

      let phone = null;
      if (msg.from.endsWith('@c.us')) {
        phone = phoneOnly(msg.from);
      } else if (msg.from.endsWith('@lid')) {
        try {
          const contact = await msg.getContact();
          if (contact && contact.id && contact.id.server === 'c.us' && contact.id.user) {
            const u = String(contact.id.user).replace(/\D/g, '');
            if (u.length >= 10 && u.length <= 13) phone = u;
          }
        } catch {}
      }
      if (!phone) { console.warn(`[${slug}:chatwoot in] sem telefone p/`, msg.from); return; }

      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media && media.data) {
            const buffer = Buffer.from(media.data, 'base64');
            await chatwoot.sendIncomingWithMedia(phone, {
              content: msg.body || '',
              buffer,
              mimetype: media.mimetype,
              filename: media.filename || `media-${Date.now()}`,
            });
            return;
          }
        } catch (e) {
          console.error(`[${slug}:chatwoot in] media fallback:`, e.message);
        }
      }

      await chatwoot.sendIncomingMessage(phone, { content: msg.body || '[mensagem vazia]' });
    } catch (e) {
      console.error(`[${slug}:chatwoot in] erro:`, e.message);
    }
  });

  async function resolveOutgoingPhone(msg) {
    const to = msg.to || '';
    if (to.endsWith('@c.us')) return phoneOnly(to);
    if (to.endsWith('@lid')) {
      try {
        const chat = await msg.getChat();
        const contact = await chat.getContact();
        if (contact && contact.id && contact.id.server === 'c.us' && contact.id.user) {
          const u = String(contact.id.user).replace(/\D/g, '');
          if (u.length >= 10 && u.length <= 13) return u;
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  client.on('message_create', async (msg) => {
    if (!chatwoot.enabled) return;
    if (!msg.fromMe) return;
    try {
      if ((msg.to || '').endsWith('@g.us')) return;
      const mid = msg.id && msg.id._serialized;
      if (mid && chatwoot.wasSentByUs(mid)) return;
      if (!msg.body && !msg.hasMedia) return;

      const phone = await resolveOutgoingPhone(msg);
      if (!phone) { console.warn(`[${slug}:chatwoot out-sync] sem telefone p/`, msg.to); return; }

      let mediaPayload = null;
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media && media.data) {
            mediaPayload = {
              buffer: Buffer.from(media.data, 'base64'),
              mimetype: media.mimetype,
              filename: media.filename || `media-${Date.now()}`,
            };
          }
        } catch (e) { console.error(`[${slug}:chatwoot out-sync] download media:`, e.message); }
      }

      chatwoot.enqueue(async () => {
        try {
          if (mediaPayload) {
            await chatwoot.postOutgoingWithMedia(phone, { content: msg.body || '', ...mediaPayload });
          } else {
            await chatwoot.postOutgoingMessage(phone, { content: msg.body || '[midia]' });
          }
        } catch (e) {
          console.error(`[${slug}:chatwoot out-sync] post ${phone}:`, e.message);
        }
      });
    } catch (e) {
      console.error(`[${slug}:chatwoot out-sync] erro:`, e.message);
    }
  });

  client.initialize().catch((e) => {
    state.status = 'error';
    console.error(`[${slug}:init] falhou:`, e.message);
  });

  return { slug, client, state, chatwoot };
}

module.exports = { createSession };
