const express = require('express');
const { db } = require('../db');
const logger = require('../logger');

const router = express.Router();

const insert = db.prepare(`
  INSERT INTO cigc_leads (nome, telefone, email, instagram, dono_clinica, nome_clinica, segmento, origem, user_agent, ip)
  VALUES (@nome, @telefone, @email, @instagram, @dono_clinica, @nome_clinica, @segmento, @origem, @user_agent, @ip)
`);

router.post('/submit', express.json({ limit: '50kb' }), (req, res) => {
  try {
    const b = req.body || {};
    const nome = String(b.nome || '').trim().slice(0, 120);
    const telefone = String(b.telefone || '').replace(/\D/g, '').slice(0, 20);
    const email = String(b.email || '').trim().slice(0, 120);
    const instagram = String(b.instagram || '').trim().slice(0, 120);
    const dono_clinica = String(b.dono_clinica || '').slice(0, 10);
    const nome_clinica = String(b.nome_clinica || '').trim().slice(0, 120);
    const segmento = String(b.segmento || '').slice(0, 60);

    if (!nome || !telefone || !email) {
      return res.status(400).json({ error: 'Nome, telefone e e-mail são obrigatórios' });
    }
    if (telefone.length < 10) {
      return res.status(400).json({ error: 'Telefone inválido (informe DDD + número)' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    const result = insert.run({
      nome, telefone, email, instagram, dono_clinica, nome_clinica, segmento,
      origem: 'cigc_cadastrofirms',
      user_agent: String(req.headers['user-agent'] || '').slice(0, 256),
      ip: req.ip,
    });

    logger.info({ id: result.lastInsertRowid, nome, telefone, segmento }, 'cigc_lead recebido');

    notifyJeff({ id: result.lastInsertRowid, nome, telefone, email, instagram, dono_clinica, nome_clinica, segmento }).catch((err) => {
      logger.warn({ err: String(err) }, 'cigc_lead notify failed');
    });

    return res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logger.error({ err: String(err) }, 'cigc_lead submit failed');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

async function notifyJeff({ id, nome, telefone, email, instagram, dono_clinica, nome_clinica, segmento }) {
  const donoCl = dono_clinica === 'sim'
    ? `Clinica: ${nome_clinica || 'nao informada'} | Segmento: ${segmento || 'nao informado'}`
    : 'Nao e dono de clinica';

  const msg = `Novo lead CIGC #${id}\n\n${nome}\nTel: ${telefone}\nEmail: ${email}\nIG: ${instagram || '-'}\n${donoCl}`;

  try {
    const enqueue = db.prepare(`
      INSERT INTO send_queue (chat_id, kind, payload, status, scheduled_for, created_at)
      VALUES (?, 'text', ?, 'pending', datetime('now'), datetime('now'))
    `);
    enqueue.run('5511910075450@c.us', JSON.stringify({ body: msg }));
  } catch (err) {
    logger.warn({ err: String(err) }, 'cigc_lead enqueue failed');
  }
}

module.exports = router;
