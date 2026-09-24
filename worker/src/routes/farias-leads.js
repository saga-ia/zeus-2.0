const express = require('express');
const { db } = require('../db');
const logger = require('../logger');

const router = express.Router();

const insert = db.prepare(`
  INSERT INTO farias_leads (nome, telefone, email, interesse, origem, user_agent, ip, device_type, platform, connection_type, city, creative_id, appstore_id)
  VALUES (@nome, @telefone, @email, @interesse, @origem, @user_agent, @ip, @device_type, @platform, @connection_type, @city, @creative_id, @appstore_id)
`);

router.post('/submit', express.json({ limit: '50kb' }), (req, res) => {
  try {
    const b = req.body || {};
    const nome = String(b.nome || '').trim().slice(0, 120);
    const telefone = String(b.telefone || '').replace(/\D/g, '').slice(0, 20);
    const email = String(b.email || '').trim().slice(0, 120);
    const interesse = String(b.interesse || 'conselheiros').slice(0, 60);

    if (!nome || !telefone || !email) {
      return res.status(400).json({ error: 'Nome, telefone e e-mail sao obrigatorios' });
    }
    if (telefone.length < 10) {
      return res.status(400).json({ error: 'Telefone invalido (informe DDD + numero)' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'E-mail invalido' });
    }

    const result = insert.run({
      nome, telefone, email, interesse,
      origem: 'fariassouza.com.br',
      user_agent: String(req.headers['user-agent'] || '').slice(0, 256),
      ip: req.ip,
      device_type: String(b.device_type || '').slice(0, 50),
      platform: String(b.platform || '').slice(0, 30),
      connection_type: String(b.connection_type || '').slice(0, 20),
      city: String(b.city || '').slice(0, 80),
      creative_id: String(b.creative_id || '').slice(0, 100),
      appstore_id: String(b.appstore_id || '').slice(0, 256),
    });

    logger.info({ id: result.lastInsertRowid, nome, telefone }, 'farias_lead recebido');

    notifyJeff({
      id: result.lastInsertRowid,
      nome, telefone, email, interesse,
      device_type: String(b.device_type || ''),
      platform: String(b.platform || ''),
      connection_type: String(b.connection_type || ''),
      city: String(b.city || ''),
      creative_id: String(b.creative_id || ''),
      appstore_id: String(b.appstore_id || '')
    }).catch((err) => {
      logger.warn({ err: String(err) }, 'farias_lead notify failed');
    });

    return res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logger.error({ err: String(err) }, 'farias_lead submit failed');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

async function notifyJeff({ id, nome, telefone, email, interesse, device_type, platform, connection_type, city, creative_id, appstore_id }) {
  const extra = [];
  if (device_type) extra.push(`📱 Device: ${device_type}`);
  if (platform) extra.push(`📲 Origem: ${platform}`);
  if (connection_type) extra.push(`📡 Conexão: ${connection_type}`);
  if (city) extra.push(`📍 Cidade: ${city}`);
  if (creative_id) extra.push(`🎬 Criativo: ${creative_id}`);

  const msg = `Novo lead Farias Souza #${id}\n\n${nome}\nTel: ${telefone}\nEmail: ${email}\nInteresse: ${interesse}${extra.length > 0 ? '\n' + extra.join('\n') : ''}`;
  try {
    const enqueue = db.prepare(`
      INSERT INTO send_queue (chat_id, kind, payload, status, scheduled_for, created_at)
      VALUES (?, 'text', ?, 'pending', datetime('now'), datetime('now'))
    `);
    enqueue.run('5511910075450@c.us', JSON.stringify({ body: msg }));
  } catch (err) {
    logger.warn({ err: String(err) }, 'farias_lead enqueue failed');
  }
}

module.exports = router;
