// Motor de Growth: API do dashboard de mídia paga (dados reais de Meta Ads; Google Ads quando houver credencial).
const express = require('express');
const data = require('./growth-data');

const router = express.Router();
const fail = (res, e) => { console.error('[growth]', e.message); res.status(502).json({ error: e.message }); };

router.get('/accounts', async (req, res) => { try { res.json(Object.assign({ google: data.googleStatus() }, await data.listAccounts(req.query.force === '1'))); } catch (e) { fail(res, e); } });
router.get('/meta', async (req, res) => {
  if (!/^(act_)?\d{5,20}$/.test(String(req.query.account_id || ''))) return res.status(400).json({ error: 'conta inválida' });
  try { res.json(await data.metaDashboard(req.query.account_id, req.query, req.query.force === '1')); } catch (e) { fail(res, e); }
});

// Análise dos Anúncios IA: roda em segundo plano, a tela consulta o job
const ia = require('./growth-ia');
router.post('/analyze', (req, res) => {
  const b = req.body || {};
  if (!/^(act_)?\d{5,20}$/.test(String(b.account_id || ''))) return res.status(400).json({ error: 'conta inválida' });
  res.json({ job: ia.iniciar(b.account_id, String(b.preset || '7d'), !!b.include_inactive, String(b.query || '').trim().slice(0, 2000)) });
});
router.get('/analyze/:job', (req, res) => {
  const j = ia.jobs.get(req.params.job);
  if (!j) return res.status(404).json({ error: 'análise não encontrada (o servidor pode ter reiniciado). Rode de novo.' });
  res.json({ status: j.status, erro: j.erro || null, resultado: j.resultado || null });
});
router.post('/apply', async (req, res) => {
  const b = req.body || {};
  if (!/^(act_)?\d{5,20}$/.test(String(b.account_id || ''))) return res.status(400).json({ error: 'conta inválida' });
  try { res.json(await ia.aplicar(b.account_id, b.action || {}, req.user)); } catch (e) { console.error('[growth-ia] aplicar:', e.message); res.status(400).json({ error: e.message }); }
});

module.exports = { router };
