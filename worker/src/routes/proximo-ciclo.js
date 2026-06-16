const express = require('express');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { db } = require('../db');
const logger = require('../logger');

const router = express.Router();

const SHEET_ID = '13Fgr8BSzdNkuyZg6Ed2vFuQYTwAAFJlVu0eupV64S78';
const GOOGLE_USER = 'jefersonhenrike1@gmail.com';
const SCRIPT = path.resolve(__dirname, '../../scripts/google.sh');

const insert = db.prepare(`
  INSERT INTO proximo_ciclo_aplicacoes
    (nome, linkedin, whatsapp, email, posicionamento, faturamento, experiencia,
     momento_profissional, decisoes_sozinho, preocupacao_futuro, por_que_pronto,
     capacidade_financeira, dispositivo, sistema_op, navegador, rede, ip,
     cidade_pais, tempo_preenchimento, user_agent)
  VALUES
    (@nome, @linkedin, @whatsapp, @email, @posicionamento, @faturamento, @experiencia,
     @momento_profissional, @decisoes_sozinho, @preocupacao_futuro, @por_que_pronto,
     @capacidade_financeira, @dispositivo, @sistema_op, @navegador, @rede, @ip,
     @cidade_pais, @tempo_preenchimento, @user_agent)
`);

router.post('/submit', express.json({ limit: '100kb' }), (req, res) => {
  try {
    const b = req.body || {};

    const nome = String(b.nome || '').trim().slice(0, 120);
    const whatsapp = String(b.whatsapp || '').replace(/\D/g, '').slice(0, 20);
    const linkedin = String(b.linkedin || '').trim().slice(0, 200);
    const email = String(b.email || '').trim().slice(0, 120);

    if (!nome || !whatsapp) {
      return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios.' });
    }
    if (whatsapp.length < 10) {
      return res.status(400).json({ error: 'WhatsApp inválido (informe DDD + número).' });
    }

    const row = {
      nome,
      linkedin,
      whatsapp,
      email,
      posicionamento:        String(b.posicionamento || '').slice(0, 100),
      faturamento:           String(b.faturamento || '').slice(0, 100),
      experiencia:           String(b.experiencia || '').slice(0, 100),
      momento_profissional:  String(b.momento_profissional || '').slice(0, 200),
      decisoes_sozinho:      String(b.decisoes_sozinho || '').slice(0, 200),
      preocupacao_futuro:    String(b.preocupacao_futuro || '').slice(0, 200),
      por_que_pronto:        String(b.por_que_pronto || '').slice(0, 2000),
      capacidade_financeira: String(b.capacidade_financeira || '').slice(0, 100),
      dispositivo:           String(b.dispositivo || '').slice(0, 60),
      sistema_op:            String(b.sistema_op || '').slice(0, 60),
      navegador:             String(b.navegador || '').slice(0, 60),
      rede:                  String(b.rede || '').slice(0, 20),
      ip:                    req.ip,
      cidade_pais:           String(b.cidade_pais || '').slice(0, 100),
      tempo_preenchimento:   parseInt(b.tempo_preenchimento) || 0,
      user_agent:            String(req.headers['user-agent'] || '').slice(0, 256),
    };

    const result = insert.run(row);
    const id = result.lastInsertRowid;

    logger.info({ id, nome, whatsapp }, 'proximo_ciclo aplicacao recebida');

    appendToSheets(id, row).catch((err) =>
      logger.warn({ err: String(err) }, 'proximo_ciclo sheets append failed')
    );

    notifyJeff(id, row).catch((err) =>
      logger.warn({ err: String(err) }, 'proximo_ciclo notify failed')
    );

    return res.json({ ok: true, id });
  } catch (err) {
    logger.error({ err: String(err) }, 'proximo_ciclo submit failed');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

function appendToSheets(id, row) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const ts = brt.toISOString().replace('T', ' ').slice(0, 19);

    const values = JSON.stringify([[
      ts,
      row.nome,
      row.linkedin,
      row.whatsapp,
      row.email,
      row.posicionamento,
      row.faturamento,
      row.experiencia,
      row.momento_profissional,
      row.decisoes_sozinho,
      row.preocupacao_futuro,
      row.por_que_pronto,
      row.capacidade_financeira,
      row.dispositivo,
      row.sistema_op,
      row.navegador,
      row.rede,
      row.ip,
      row.cidade_pais,
      String(row.tempo_preenchimento),
    ]]);

    execFile(SCRIPT, [
      'sheets-append',
      GOOGLE_USER,
      SHEET_ID,
      "Aplicações!A:T",
      values,
    ], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        logger.warn({ err: String(err), stderr }, 'sheets append error');
        return reject(err);
      }
      db.prepare('UPDATE proximo_ciclo_aplicacoes SET sheets_synced=1 WHERE id=?').run(id);
      resolve();
    });
  });
}

async function notifyJeff(id, row) {
  const persona = row.momento_profissional
    ? `Persona: ${row.momento_profissional.split(']')[0].replace('[', '').trim()}`
    : '';
  const financa = row.capacidade_financeira || '-';

  const msg =
    `Nova aplicacao Mentoria O Proximo Ciclo #${id}\n\n` +
    `${row.nome}\n` +
    `WhatsApp: ${row.whatsapp}\n` +
    (row.email ? `Email: ${row.email}\n` : '') +
    (row.linkedin ? `LinkedIn: ${row.linkedin}\n` : '') +
    `Posicao: ${row.posicionamento || '-'}\n` +
    (row.faturamento ? `Faturamento: ${row.faturamento}\n` : '') +
    (row.experiencia ? `Experiencia: ${row.experiencia}\n` : '') +
    (persona ? `${persona}\n` : '') +
    `Financeiro: ${financa}\n` +
    `Dispositivo: ${row.dispositivo || '-'} | ${row.sistema_op || '-'}\n` +
    `Tempo de preenchimento: ${row.tempo_preenchimento}s`;

  db.prepare(`
    INSERT INTO send_queue (chat_id, kind, payload, status, scheduled_for, created_at)
    VALUES (?, 'text', ?, 'pending', datetime('now'), datetime('now'))
  `).run('5511910075450@c.us', JSON.stringify({ body: msg }));
}

module.exports = router;
