const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { db, log } = require('./db');

let wwebClient = null;
let qrPayload = '';
let qrStatus = 'desconectado';

function state() {
  return db.prepare('SELECT * FROM wa_state WHERE id=1').get();
}

function updateState(patch) {
  const cur = state();
  const merged = { ...cur, ...patch };
  db.prepare(`UPDATE wa_state SET modo=?, worker_url=?, worker_token=?, qr_status=?, qr_payload=?, atualizado_em=strftime('%s','now') WHERE id=1`)
    .run(merged.modo, merged.worker_url, merged.worker_token, merged.qr_status, merged.qr_payload);
}

function normalizePhone(raw) {
  const p = String(raw || '').replace(/\D/g, '');
  if (!p) return '';
  if (p.length >= 12 && p.startsWith('55')) return p;
  if (p.length === 11) return '55' + p;
  if (p.length === 10) return '55' + p;
  return p;
}

async function sendViaWorker(toPhone, body, mediaPath = null, mediaMime = null) {
  const s = state();
  const url = s.worker_url || 'http://127.0.0.1:3002';
  const token = s.worker_token || '';
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = 'Bearer ' + token;

  if (mediaPath && fs.existsSync(mediaPath)) {
    const b64 = fs.readFileSync(mediaPath).toString('base64');
    const chatId = normalizePhone(toPhone) + '@c.us';
    const res = await fetch(url + '/send-media', {
      method: 'POST', headers,
      body: JSON.stringify({ chatId, base64: b64, mimetype: mediaMime || 'application/octet-stream', caption: body || '' })
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`worker ${res.status}: ${txt}`);
    return txt;
  }

  const res = await fetch(url + '/messages/private', {
    method: 'POST', headers,
    body: JSON.stringify({ to: normalizePhone(toPhone), body: body || '' })
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`worker ${res.status}: ${txt}`);
  return txt;
}

async function sendViaQR(toPhone, body, mediaPath = null, mediaMime = null) {
  if (!wwebClient) throw new Error('sessao QR nao iniciada');
  const { MessageMedia } = require('whatsapp-web.js');
  const jid = normalizePhone(toPhone) + '@c.us';
  if (mediaPath && fs.existsSync(mediaPath)) {
    const media = MessageMedia.fromFilePath(mediaPath);
    await wwebClient.sendMessage(jid, media, { caption: body || '' });
  } else {
    await wwebClient.sendMessage(jid, body || '');
  }
  return 'ok';
}

async function send(toPhone, body, mediaPath = null, mediaMime = null) {
  const s = state();
  if (s.modo === 'qr') return sendViaQR(toPhone, body, mediaPath, mediaMime);
  return sendViaWorker(toPhone, body, mediaPath, mediaMime);
}

async function startQR() {
  if (wwebClient) return { ok: true, msg: 'ja iniciado' };
  const { Client, LocalAuth } = require('whatsapp-web.js');
  const qrcode = require('qrcode');
  wwebClient = new Client({
    authStrategy: new LocalAuth({ clientId: 'jeff-eventos', dataPath: path.join(__dirname, '..', 'sessions') }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });
  wwebClient.on('qr', async (qr) => {
    qrPayload = await qrcode.toDataURL(qr);
    qrStatus = 'aguardando_scan';
    updateState({ qr_status: qrStatus, qr_payload: qrPayload });
    log('info', 'wa', 'QR gerado');
  });
  wwebClient.on('ready', () => {
    qrStatus = 'conectado'; qrPayload = '';
    updateState({ qr_status: qrStatus, qr_payload: '' });
    log('info', 'wa', 'QR conectado');
  });
  wwebClient.on('disconnected', () => {
    qrStatus = 'desconectado'; qrPayload = '';
    updateState({ qr_status: qrStatus, qr_payload: '' });
    log('warn', 'wa', 'QR desconectado');
  });
  wwebClient.on('auth_failure', (m) => log('erro', 'wa', 'auth_failure: ' + m));
  await wwebClient.initialize();
  return { ok: true };
}

async function stopQR() {
  if (wwebClient) {
    try { await wwebClient.destroy(); } catch {}
    wwebClient = null;
  }
  qrStatus = 'desconectado'; qrPayload = '';
  updateState({ qr_status: qrStatus, qr_payload: '' });
  return { ok: true };
}

module.exports = { send, startQR, stopQR, state, updateState, normalizePhone };
