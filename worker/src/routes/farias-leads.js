const express = require('express');
const { db } = require('../db');
const logger = require('../logger');

const router = express.Router();

const insert = db.prepare(`
  INSERT INTO farias_leads (nome, telefone, email, interesse, origem, user_agent, ip)
  VALUES (@nome, @telefone, @email, @interesse, @origem, @user_agent, @ip)
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
    });

    logger.info({ id: result.lastInsertRowid, nome, telefone }, 'farias_lead recebido');

    notifyJeff({ id: result.lastInsertRowid, nome, telefone, email, interesse }).catch((err) => {
      logger.warn({ err: String(err) }, 'farias_lead notify failed');
    });

    return res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logger.error({ err: String(err) }, 'farias_lead submit failed');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

async function notifyJeff({ id, nome, telefone, email, interesse }) {
  const msg = `Novo lead Farias Souza #${id}\n\n${nome}\nTel: ${telefone}\nEmail: ${email}\nInteresse: ${interesse}`;
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
