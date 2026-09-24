const express = require('express');
const db = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const t = db.prepare('SELECT id, nome, email, gerente_phone FROM tenants WHERE id=?').get(req.user.tid);
  const cfg = db.prepare('SELECT * FROM configuracoes_avaliacao WHERE tenant_id=?').get(req.user.tid);
  res.json({ tenant: t, config: cfg });
});

router.patch('/', (req, res) => {
  const { nome, gerente_phone } = req.body || {};
  db.prepare(`UPDATE tenants SET nome=COALESCE(?,nome), gerente_phone=COALESCE(?,gerente_phone) WHERE id=?`)
    .run(nome || null, gerente_phone || null, req.user.tid);
  res.json({ ok: true });
});

router.patch('/config', (req, res) => {
  const { manual_atendimento_txt, prazo_resposta_seg, horario_atendimento_inicio, horario_atendimento_fim } = req.body || {};
  db.prepare(`
    UPDATE configuracoes_avaliacao
       SET manual_atendimento_txt = COALESCE(?, manual_atendimento_txt),
           prazo_resposta_seg     = COALESCE(?, prazo_resposta_seg),
           horario_atendimento_inicio = COALESCE(?, horario_atendimento_inicio),
           horario_atendimento_fim    = COALESCE(?, horario_atendimento_fim),
           atualizado_em = datetime('now')
     WHERE tenant_id=?
  `).run(
    manual_atendimento_txt || null,
    prazo_resposta_seg || null,
    horario_atendimento_inicio || null,
    horario_atendimento_fim || null,
    req.user.tid
  );
  res.json({ ok: true });
});

module.exports = router;
