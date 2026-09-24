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

module.exports = { router };
