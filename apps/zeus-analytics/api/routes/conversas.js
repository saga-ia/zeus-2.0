const express = require('express');
const db = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

const router = express.Router();
router.use(requireAuth);

// Lista conversas com agregados leves
router.get('/', (req, res) => {
  const { vendedor_id, desfecho, limit = 50, offset = 0 } = req.query;
  const where = ['c.tenant_id=?'];
  const args = [req.user.tid];
  if (vendedor_id) { where.push('c.vendedor_id=?'); args.push(vendedor_id); }
  if (desfecho)   { where.push('c.desfecho=?');    args.push(desfecho); }
  const rows = db.prepare(`
    SELECT c.*, ct.phone, ct.nome AS contato_nome, v.nome AS vendedor_nome,
           sc.nota, sc.resumo
      FROM conversas c
      JOIN contatos ct ON ct.id = c.contato_id
      LEFT JOIN vendedores v ON v.id = c.vendedor_id
      LEFT JOIN scorecard_conversa sc ON sc.conversa_id = c.id
     WHERE ${where.join(' AND ')}
     ORDER BY c.inicio DESC
     LIMIT ? OFFSET ?
  `).all(...args, parseInt(limit), parseInt(offset));
  res.json(rows);
});

// Detalhe de conversa: metadados + scorecard + mensagens
router.get('/:id', (req, res) => {
  const c = db.prepare(`
    SELECT c.*, ct.phone, ct.nome AS contato_nome, v.nome AS vendedor_nome
      FROM conversas c
      JOIN contatos ct ON ct.id = c.contato_id
      LEFT JOIN vendedores v ON v.id = c.vendedor_id
     WHERE c.id=? AND c.tenant_id=?
  `).get(req.params.id, req.user.tid);
  if (!c) return res.status(404).json({ error: 'not found' });

  const score = db.prepare('SELECT * FROM scorecard_conversa WHERE conversa_id=?').get(c.id);
  const msgs = db.prepare(`
    SELECT id, direction, type, body, audio_transcript, has_media, ts
      FROM mensagens
     WHERE contato_id=? AND device_id=?
       AND ts BETWEEN ? AND COALESCE(?, datetime('now'))
     ORDER BY ts ASC
  `).all(c.contato_id, c.device_id, c.inicio, c.fim);

  res.json({ conversa: c, scorecard: score, mensagens: msgs });
});

module.exports = router;
