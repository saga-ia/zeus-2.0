const path = require('path');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const db = require('../lib/db');
const log = require('../lib/logger');
const { jidToPhone, isGroupJid } = require('../lib/phone');

const SESSION_DIR = process.env.SESSION_DIR
  || path.join(__dirname, '..', 'data', 'sessions');

const upsertContato = db.prepare(`
  INSERT INTO contatos (tenant_id, phone, nome, push_name, primeira_msg_em, ultima_msg_em)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(tenant_id, phone) DO UPDATE SET
    nome = COALESCE(excluded.nome, contatos.nome),
    push_name = COALESCE(excluded.push_name, contatos.push_name),
    ultima_msg_em = excluded.ultima_msg_em
  RETURNING id
`);

const insertMensagem = db.prepare(`
  INSERT OR IGNORE INTO mensagens
    (tenant_id, device_id, contato_id, vendedor_id, message_id, direction, type, body,
     has_media, is_group, ts)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateDeviceStatus = db.prepare(`
  UPDATE devices SET status=?, ultimo_qr=?, ultimo_qr_em=?, conectado_em=?, numero=COALESCE(?, numero) WHERE id=?
`);

const findActiveVendedor = db.prepare(`
  SELECT vendedor_id FROM vendedor_device
   WHERE device_id=? AND ativo=1
   ORDER BY id DESC LIMIT 1
`);

async function persistMessage(device, msg) {
  try {
    const fromMe = !!msg.fromMe;
    const direction = fromMe ? 'out' : 'in';
    const chatJid = fromMe ? msg.to : msg.from;
    if (isGroupJid(chatJid)) return;
    const phone = jidToPhone(chatJid);
    if (!phone) return;
    const tsIso = new Date((msg.timestamp || Date.now() / 1000) * 1000).toISOString();

    let pushName = null;
    try { pushName = msg._data && msg._data.notifyName || null; } catch (_) {}

    const contato = upsertContato.get(
      device.tenant_id, phone, null, pushName, tsIso, tsIso
    );

    const vend = findActiveVendedor.get(device.id);
    const vendedorId = vend ? vend.vendedor_id : null;

    insertMensagem.run(
      device.tenant_id,
      device.id,
      contato.id,
      vendedorId,
      msg.id && (msg.id._serialized || msg.id.id) || `${tsIso}-${Math.random()}`,
      direction,
      msg.type || 'chat',
      msg.body || '',
      msg.hasMedia ? 1 : 0,
      isGroupJid(chatJid) ? 1 : 0,
      tsIso
    );
  } catch (e) {
    log.error('wa-client', `falha persistMessage device=${device.id}`, e.message);
  }
}

function createClient(device) {
  const sessionPath = path.join(SESSION_DIR, device.session_id);
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: device.session_id,
      dataPath: SESSION_DIR,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });

  client.on('qr', async (qr) => {
    try {
      const svg = await QRCode.toString(qr, { type: 'svg', margin: 1 });
      updateDeviceStatus.run('qr', svg, new Date().toISOString(), null, null, device.id);
      log.info('wa-client', `QR atualizado device=${device.id} (${device.apelido})`);
    } catch (e) {
      log.error('wa-client', `falha QR device=${device.id}`, e.message);
    }
  });

  client.on('authenticated', () => {
    updateDeviceStatus.run('authenticated', null, null, null, null, device.id);
    log.info('wa-client', `authenticated device=${device.id}`);
  });

  client.on('auth_failure', (m) => {
    updateDeviceStatus.run('auth_failure', null, null, null, null, device.id);
    log.warn('wa-client', `auth_failure device=${device.id}`, m);
  });

  client.on('ready', () => {
    let numero = null;
    try { numero = client.info && client.info.wid && client.info.wid.user; } catch (_) {}
    updateDeviceStatus.run('ready', null, null, new Date().toISOString(), numero, device.id);
    log.info('wa-client', `READY device=${device.id} numero=${numero}`);
  });

  client.on('disconnected', (reason) => {
    updateDeviceStatus.run('disconnected', null, null, null, null, device.id);
    log.warn('wa-client', `disconnected device=${device.id}`, reason);
  });

  client.on('message', (msg) => persistMessage(device, msg));
  client.on('message_create', (msg) => {
    if (msg.fromMe) persistMessage(device, msg);
  });

  client.initialize().catch((e) => {
    log.error('wa-client', `initialize falhou device=${device.id}`, e.message);
    updateDeviceStatus.run('auth_failure', null, null, null, null, device.id);
  });

  return client;
}

module.exports = { createClient, SESSION_DIR };
