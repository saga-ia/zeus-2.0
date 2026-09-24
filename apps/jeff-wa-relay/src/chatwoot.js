const fs = require('fs');
const path = require('path');

const CHATWOOT_URL = (process.env.CHATWOOT_URL || '').replace(/\/+$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID;
const API_TOKEN = process.env.CHATWOOT_API_TOKEN;
const QUEUE_DELAY_MS = parseInt(process.env.CHATWOOT_QUEUE_DELAY_MS || '300', 10);

const globalEnabled = !!(CHATWOOT_URL && ACCOUNT_ID && API_TOKEN);

function phoneOnly(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function createChatwoot({ inboxId, inboxIdent, cacheKey }) {
  const enabled = !!(globalEnabled && inboxId && inboxIdent);
  const cacheFile = path.join(__dirname, '..', 'data', `chatwoot-cache-${cacheKey}.json`);
  const legacyCacheFile = path.join(__dirname, '..', 'data', 'chatwoot-cache.json');

  let cache = { byPhone: {}, byConvId: {} };
  try {
    if (fs.existsSync(cacheFile)) {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else if (fs.existsSync(legacyCacheFile) && cacheKey === '7329') {
      cache = JSON.parse(fs.readFileSync(legacyCacheFile, 'utf8'));
    }
  } catch (e) { console.error(`[chatwoot:${cacheKey}] cache load:`, e.message); }

  function persist() {
    try { fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2)); }
    catch (e) { console.error(`[chatwoot:${cacheKey}] cache save:`, e.message); }
  }

  async function ensureContact(phone) {
    const cached = cache.byPhone[phone];
    if (cached && cached.contactId) return cached;

    const sourceId = `wa:${phone}`;
    const url = `${CHATWOOT_URL}/public/api/v1/inboxes/${inboxIdent}/contacts`;
    const contactName = `+${phone}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId, name: contactName, phone_number: `+${phone}` }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`contact create ${r.status}: ${JSON.stringify(data)}`);

    const entry = { phone, sourceId, contactId: data.id, conversationId: null };
    cache.byPhone[phone] = entry;
    persist();
    return entry;
  }

  async function ensureConversation(phone) {
    const c = await ensureContact(phone);
    if (c.conversationId) return c;
    const url = `${CHATWOOT_URL}/public/api/v1/inboxes/${inboxIdent}/contacts/${c.sourceId}/conversations`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`conv create ${r.status}: ${JSON.stringify(data)}`);
    c.conversationId = data.id;
    cache.byPhone[phone] = c;
    cache.byConvId[c.conversationId] = phone;
    persist();
    return c;
  }

  async function sendIncomingMessage(phone, { content, attachments }) {
    const c = await ensureConversation(phone);
    const url = `${CHATWOOT_URL}/public/api/v1/inboxes/${inboxIdent}/contacts/${c.sourceId}/conversations/${c.conversationId}/messages`;
    const payload = { content: content || '' };
    if (attachments && attachments.length) payload.attachments = attachments;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`msg create ${r.status}: ${JSON.stringify(data)}`);
    return data;
  }

  async function sendIncomingWithMedia(phone, { content, buffer, mimetype, filename }) {
    const c = await ensureConversation(phone);
    const url = `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${c.conversationId}/messages`;
    const form = new FormData();
    form.append('content', content || '');
    form.append('message_type', 'incoming');
    const blob = new Blob([buffer], { type: mimetype || 'application/octet-stream' });
    form.append('attachments[]', blob, filename || 'media');
    const r = await fetch(url, { method: 'POST', headers: { api_access_token: API_TOKEN }, body: form });
    const data = await r.json();
    if (!r.ok) throw new Error(`media msg ${r.status}: ${JSON.stringify(data)}`);
    return data;
  }

  function lookupByConvId(convId) {
    const phone = cache.byConvId[convId];
    return phone ? cache.byPhone[phone] : null;
  }

  const sentByUsIds = new Set();
  function markSentByUs(messageId) {
    sentByUsIds.add(String(messageId));
    if (sentByUsIds.size > 5000) {
      const it = sentByUsIds.values();
      for (let i = 0; i < 1000; i++) sentByUsIds.delete(it.next().value);
    }
  }
  function wasSentByUs(messageId) { return sentByUsIds.has(String(messageId)); }

  const importedChatwootMsgIds = new Set();
  function markImportedMsg(chatwootMsgId) {
    importedChatwootMsgIds.add(String(chatwootMsgId));
    if (importedChatwootMsgIds.size > 50000) {
      const it = importedChatwootMsgIds.values();
      for (let i = 0; i < 10000; i++) importedChatwootMsgIds.delete(it.next().value);
    }
  }
  function wasImportedMsg(chatwootMsgId) { return importedChatwootMsgIds.has(String(chatwootMsgId)); }

  async function postOutgoingMessage(phone, { content }) {
    const c = await ensureConversation(phone);
    const url = `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${c.conversationId}/messages`;
    const payload = { content: content || '', message_type: 'outgoing' };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', api_access_token: API_TOKEN },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`outgoing msg ${r.status}: ${JSON.stringify(data)}`);
    if (data.id) markImportedMsg(data.id);
    return data;
  }

  async function postOutgoingWithMedia(phone, { content, buffer, mimetype, filename }) {
    const c = await ensureConversation(phone);
    const url = `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${c.conversationId}/messages`;
    const form = new FormData();
    form.append('content', content || '');
    form.append('message_type', 'outgoing');
    const blob = new Blob([buffer], { type: mimetype || 'application/octet-stream' });
    form.append('attachments[]', blob, filename || 'media');
    const r = await fetch(url, { method: 'POST', headers: { api_access_token: API_TOKEN }, body: form });
    const data = await r.json();
    if (!r.ok) throw new Error(`outgoing media ${r.status}: ${JSON.stringify(data)}`);
    if (data.id) markImportedMsg(data.id);
    return data;
  }

  const queue = [];
  let queueRunning = false;
  async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    while (queue.length) {
      const job = queue.shift();
      try { await job(); } catch (e) { console.error(`[chatwoot:${cacheKey} queue]`, e.message); }
      if (queue.length) await new Promise(r => setTimeout(r, QUEUE_DELAY_MS));
    }
    queueRunning = false;
  }
  function enqueue(fn) { queue.push(fn); processQueue(); }
  function queueSize() { return queue.length; }

  return {
    enabled,
    inboxId: Number(inboxId),
    inboxIdent,
    cacheKey,
    enqueue,
    queueSize,
    ensureContact,
    ensureConversation,
    sendIncomingMessage,
    sendIncomingWithMedia,
    postOutgoingMessage,
    postOutgoingWithMedia,
    lookupByConvId,
    markSentByUs,
    wasSentByUs,
    markImportedMsg,
    wasImportedMsg,
  };
}

module.exports = { createChatwoot, phoneOnly, globalEnabled };
