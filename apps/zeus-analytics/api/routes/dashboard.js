const express = require('express');
const db = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/resumo', (req, res) => {
  const tid = req.user.tid;
  const hoje = new Date().toISOString().slice(0, 10);
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM devices WHERE tenant_id=? AND status='ready') AS devices_ativos,
      (SELECT COUNT(*) FROM vendedores WHERE tenant_id=? AND ativo=1) AS vendedores_ativos,
      (SELECT COUNT(*) FROM contatos WHERE tenant_id=?) AS contatos,
      (SELECT COUNT(*) FROM conversas WHERE tenant_id=? AND date(inicio)=date('now')) AS conversas_hoje,
      (SELECT COUNT(*) FROM mensagens WHERE tenant_id=? AND date(ts)=date('now')) AS mensagens_hoje,
      (SELECT AVG(nota) FROM scorecard_conversa sc
        JOIN conversas c ON c.id = sc.conversa_id
       WHERE c.tenant_id=? AND date(sc.analisado_em)=date('now')) AS nota_media_hoje,
      (SELECT COUNT(*) FROM alertas WHERE tenant_id=? AND visualizado_em IS NULL) AS alertas_pendentes
  `).get(tid, tid, tid, tid, tid, tid, tid);

  const ranking = db.prepare(`
    SELECT v.id, v.nome, AVG(sc.nota) AS nota_media, COUNT(sc.conversa_id) AS total
      FROM scorecard_vendedor_diario sc
      JOIN vendedores v ON v.id = sc.vendedor_id
     WHERE sc.tenant_id=? AND sc.data >= date('now','-7 days')
     GROUP BY v.id
     ORDER BY nota_media DESC NULLS LAST
     LIMIT 10
  `).all(tid);

  res.json({ counts, ranking });
});

router.get('/alertas', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM alertas WHERE tenant_id=?
     ORDER BY criado_em DESC LIMIT 100
  `).all(req.user.tid);
  res.json(rows);
});

module.exports = router;
