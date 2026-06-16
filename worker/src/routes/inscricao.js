const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../db');
const logger = require('../logger');

const router = express.Router();

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value || fallback;
}

function renderTemplate(filePath, vars) {
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.replaceAll(`__${k}__`, v || '');
  }
  return html;
}

const insertStmt = db.prepare(`
  INSERT INTO inscricoes (nome, email, telefone, genero, renda_faixa, cidade, origem, user_agent, ip)
  VALUES (@nome, @email, @telefone, @genero, @renda_faixa, @cidade, @origem, @user_agent, @ip)
`);

function noCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

router.get('/', (req, res) => {
  noCache(res);
  const html = renderTemplate(path.join(__dirname, '..', '..', 'public', 'inscricao', 'index.html'), {
    PIXEL_ID: getSetting('meta_pixel_id'),
    CONV_NAME: getSetting('meta_conv_event_name'),
  });
  res.type('html').send(html);
});

router.get('/obrigado', (req, res) => {
  noCache(res);
  const html = renderTemplate(path.join(__dirname, '..', '..', 'public', 'inscricao', 'obrigado.html'), {
    GROUP_URL: getSetting('inscricao_grupo_wpp_url'),
    PIXEL_ID: getSetting('meta_pixel_id'),
    CONV_NAME: getSetting('meta_conv_event_name'),
  });
  res.type('html').send(html);
});

router.post('/submit', express.json({ limit: '50kb' }), (req, res) => {
  try {
    const b = req.body || {};
    const nome = String(b.nome || '').trim().slice(0, 120);
    const email = String(b.email || '').trim().slice(0, 120);
    const telefone = String(b.telefone || '').replace(/\D/g, '').slice(0, 20);
    const genero = String(b.genero || '').slice(0, 30);
    const renda_faixa = String(b.renda_faixa || '').slice(0, 30);
    const cidade = String(b.cidade || '').trim().slice(0, 80);

    if (!nome || !email || !telefone) {
      return res.status(400).json({ error: 'Nome, e-mail e telefone são obrigatórios' });
    }
    if (telefone.length < 10) {
      return res.status(400).json({ error: 'Telefone inválido (informe DDD + número)' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const result = insertStmt.run({
      nome, email, telefone, genero, renda_faixa, cidade,
      origem: 'inscricao_imersao',
      user_agent: String(req.headers['user-agent'] || '').slice(0, 256),
      ip: req.ip,
    });

    logger.info({ id: result.lastInsertRowid, nome, telefone, cidade, renda_faixa }, 'inscricao recebida');

    // Notify Mayara SDR worker (port 3003) — best effort, doesn't block response
    notifyMayara({ id: result.lastInsertRowid, nome, telefone, email, cidade, genero, renda_faixa }).catch((err) => {
      logger.warn({ err: String(err) }, 'failed to notify mayara of new inscricao');
    });

    // Append to Google Sheet
    appendToSheet({ id: result.lastInsertRowid, nome, telefone, email, cidade, genero, renda_faixa }).catch((err) => {
      logger.warn({ err: String(err) }, 'failed to append inscricao to sheet');
    });

    return res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logger.error({ err: String(err) }, 'inscricao submit failed');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

async function notifyMayara({ id, nome, telefone, email, cidade, genero, renda_faixa }) {
  // 1) Notify Jefferson via worker's own send queue
  const adminMsg = `📥 Nova inscrição #${id}\n\n*${nome}*\n📞 ${telefone}\n✉️ ${email}\n📍 ${cidade}\n💰 ${renda_faixa}\n👤 ${genero}`;
  const recipients = ['5511910075450@c.us'];
  try {
    const enqueueStmt = db.prepare(`
      INSERT INTO send_queue (chat_id, kind, payload, status, scheduled_for, created_at)
      VALUES (?, 'text', ?, 'pending', datetime('now'), datetime('now'))
    `);
    for (const chat_id of recipients) {
      enqueueStmt.run(chat_id, JSON.stringify({ body: adminMsg }));
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'failed to enqueue admin notification');
  }

  // 2) Trigger Mayara SDR (port 3003) to greet the lead proactively (independent of step 1)
  try {
    await triggerMayaraGreeting({ nome, telefone });
  } catch (err) {
    logger.warn({ err: String(err), telefone }, 'mayara greeting failed');
  }

  // 3) Auto-add lead to Imersão Paradigma student group (Diretor é admin do grupo)
  try {
    addToParadigmaGroup({ nome, telefone });
  } catch (err) {
    logger.warn({ err: String(err), telefone }, 'auto-add group failed');
  }
}

// Group ID atual da turma — atualizar quando trocar de turma
const PARADIGMA_GROUP_JID = '';

function addToParadigmaGroup({ nome, telefone }) {
  if (!PARADIGMA_GROUP_JID) { logger.info({ telefone }, "auto-add disabled (no group jid configured)"); return; }
  let digits = String(telefone || '').replace(/\D/g, '');
  if (digits.length === 11 && !digits.startsWith('55')) digits = '55' + digits;
  if (digits.length === 10 && !digits.startsWith('55')) digits = '55' + digits;
  const partJid = digits + '@c.us';
  const queue = require('../queue/send-queue');
  // Use the same queue interface — but we need the queue instance. Use direct DB enqueue:
  const enqueueStmt = db.prepare(`
    INSERT INTO send_queue (chat_id, kind, payload, status, scheduled_for, created_at)
    VALUES (?, 'group_action', ?, 'pending', datetime('now', '+30 seconds'), datetime('now'))
  `);
  enqueueStmt.run(
    PARADIGMA_GROUP_JID,
    JSON.stringify({ op: 'addParticipants', args: { participants: [partJid] } })
  );
  logger.info({ telefone: digits, group: PARADIGMA_GROUP_JID, nome }, 'auto-add to paradigma group enqueued');
}

// In-memory dedup: phone -> last greeting timestamp
const lastGreeting = new Map();
const GREETING_DEDUP_MS = 30 * 60 * 1000; // 30 min
const SDR_DB_PATH = '/opt/labastia/sdr-imersao/data/sdr.db';

// Pause SDR reactive replies for a phone via SQLite write to its DB.
// Returns true on success.
function setSdrApiReplies(phone, enabled, notes) {
  try {
    const Database = require('better-sqlite3');
    const sdrDb = new Database(SDR_DB_PATH, { fileMustExist: true });
    sdrDb.prepare(`
      INSERT INTO contact_settings (phone, api_replies_enabled, notes, set_by, updated_at)
      VALUES (?, ?, ?, 'inscricao_handoff', datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        api_replies_enabled = excluded.api_replies_enabled,
        notes = excluded.notes,
        set_by = excluded.set_by,
        updated_at = datetime('now')
    `).run(phone, enabled ? 1 : 0, notes || null);
    sdrDb.close();
    return true;
  } catch (err) {
    logger.warn({ err: String(err), phone, enabled }, 'failed to set SDR contact_settings');
    return false;
  }
}

async function triggerMayaraGreeting({ nome, telefone }) {
  const sdrToken = getSetting('sdr_imersao_api_token') || process.env.SDR_IMERSAO_API_TOKEN || 'f27d1310fd19454781b5704b531e507da41ea11604b987290f9080d9eb1d0473';
  const sdrBase = getSetting('sdr_imersao_base_url') || 'http://127.0.0.1:3003';

  // Normalize phone to digits, ensure country code prefix
  let digits = String(telefone || '').replace(/\D/g, '');
  if (digits.length === 11 && !digits.startsWith('55')) digits = '55' + digits;
  if (digits.length === 10 && !digits.startsWith('55')) digits = '55' + digits;
  const chatId = digits + '@c.us';

  // Dedup: greet once. Subsequent submits within window get a short follow-up instead.
  const now = Date.now();
  const last = lastGreeting.get(digits) || 0;
  const isReSubmit = (now - last) < GREETING_DEDUP_MS && last > 0;
  lastGreeting.set(digits, now);

  if (isReSubmit) {
    logger.info({ telefone: digits, mins_since_last: ((now - last) / 60000).toFixed(1) }, 'mayara handoff: resubmit detected, sending short follow-up');
    const shortName = (nome || '').trim().split(/\s+/)[0] || '';
    const cleanShort = shortName.charAt(0).toUpperCase() + shortName.slice(1).toLowerCase();
    const followup = `Oi ${cleanShort}! 😊 Vi que você preencheu nosso formulário de novo — ficou mais alguma dúvida que eu posso te ajudar a tirar agora?`;
    setSdrApiReplies(digits, false, 'pausado durante follow-up de re-inscrição');
    (async () => {
      try {
        const r = await fetch(`${sdrBase}/send-message`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${sdrToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message: followup }),
        });
        if (!r.ok) throw new Error(`SDR followup failed: ${r.status}`);
      } catch (err) {
        logger.warn({ err: String(err), telefone: digits }, 'mayara resubmit followup failed');
      } finally {
        setTimeout(() => setSdrApiReplies(digits, true, 'reativado após follow-up'), 5000);
      }
    })();
    return;
  }

  // First name only, capitalize
  const firstName = (nome || '').trim().split(/\s+/)[0] || '';
  const cleanName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

  // Multi-bubble conversation — natural relationship pace
  const bubbles = [
    `Oi ${cleanName}! 💛`,
    `Aqui é a Mayara, faço parte do time de pré-atendimento do Lucas Labastie. Acabei de receber sua inscrição por aqui — seja muito bem-vindo(a)!`,
    `${cleanName}, te passo as informações principais já 👇`,
    `📅 *01 a 03 de Maio* — 3 dias presenciais\n📍 *Alameda Mamoré, 503 — 16° andar*\n   Central Storydoing — Alphaville/Barueri/SP\n🕗 *8h às 18h* todos os dias`,
    `${cleanName}, você consegue estar com a gente nessa data?`,
  ];

  const sendOne = async (text, delayMs) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const r = await fetch(`${sdrBase}/send-message`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sdrToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: text }),
    });
    if (!r.ok) {
      const d = await r.text().catch(() => '');
      throw new Error(`SDR send failed: ${r.status} ${d.slice(0, 150)}`);
    }
    return r.json().catch(() => ({}));
  };

  // Pause Mayara reactive replies during handoff to avoid overlap/hallucination
  setSdrApiReplies(digits, false, 'pausado durante handoff de inscrição');

  // First bubble immediate, then ~5s gap between each one. Don't await the chain to release the HTTP response fast.
  (async () => {
    try {
      await sendOne(bubbles[0], 0);
      await sendOne(bubbles[1], 5000);
      await sendOne(bubbles[2], 5000);
      await sendOne(bubbles[3], 5000);
      await sendOne(bubbles[4], 6000);
      logger.info({ telefone: digits }, 'mayara greeting sequence completed');
    } catch (err) {
      logger.warn({ err: String(err), telefone: digits }, 'mayara greeting sequence failed mid-way');
    } finally {
      // Re-enable reactive replies 10s after greeting completes (lets reactive Mayara handle the lead's first reply)
      setTimeout(() => {
        setSdrApiReplies(digits, true, 'reativado após handoff de inscrição');
      }, 10000);
    }
  })();

  logger.info({ telefone: digits }, 'mayara greeting started');
}

async function appendToSheet({ nome, telefone, email, cidade, genero, renda_faixa }) {
  const sheetId = db.prepare("SELECT value FROM app_settings WHERE key='inscricoes_sheet_id'").get();
  if (!sheetId?.value) return;
  const refresh = db.prepare("SELECT refresh_token FROM google_oauth_tokens WHERE user_key='default'").get();
  const cid = db.prepare("SELECT value FROM app_settings WHERE key='google_oauth_client_id'").get();
  const csec = db.prepare("SELECT value FROM app_settings WHERE key='google_oauth_client_secret'").get();
  if (!refresh?.refresh_token || !cid?.value || !csec?.value) return;

  const params = new URLSearchParams();
  params.set('client_id', cid.value);
  params.set('client_secret', csec.value);
  params.set('refresh_token', refresh.refresh_token);
  params.set('grant_type', 'refresh_token');
  const tk = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(),
  }).then(r => r.json());
  const access = tk.access_token;
  if (!access) return;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId.value}/values/Inscrições!A2:H:append?valueInputOption=USER_ENTERED`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: [[
        new Date().toISOString(),
        nome, telefone, email, cidade, genero, renda_faixa, 'inscricao_imersao',
      ]],
    }),
  });
}

module.exports = router;
