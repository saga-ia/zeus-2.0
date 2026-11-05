'use strict';
// jeff-leads — receptor genérico de formulários de captura.
// POST /api/lead/<form>  ->  grava JSONL local (nunca perde) + append na planilha do form.
const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 3042;
const GOOGLE_USER = process.env.GOOGLE_USER || 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = '/opt/jeff-worker/scripts/google.sh';
const DATA_DIR = path.join(__dirname, 'data');
const FORMS_FILE = path.join(__dirname, 'forms.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function forms() {
  try { return JSON.parse(fs.readFileSync(FORMS_FILE, 'utf8')); } catch { return {}; }
}

function agoraBRT() {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, forms: Object.keys(forms()), ts: Date.now() }));

app.post('/api/lead/:form', async (req, res) => {
  const slug = req.params.form;
  const cfg = forms()[slug];
  if (!cfg) return res.status(404).json({ ok: false, error: 'Formulário não encontrado.' });

  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  const telefone = String(b.telefone || b.whatsapp || '').trim();
  const email = String(b.email || '').trim().toLowerCase();

  if (!nome || nome.length < 2) return res.status(400).json({ ok: false, error: 'Informe seu nome completo.' });
  if (telefone.replace(/\D/g, '').length < 10) return res.status(400).json({ ok: false, error: 'Informe um WhatsApp válido com DDD.' });
  // forms com "email": false capturam só nome e telefone
  if (cfg.email !== false && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Informe um e-mail válido.' });

  const lead = {
    quando: agoraBRT(),
    form: slug,
    nome, telefone, email,
    utm_source: b.utm_source || '', utm_medium: b.utm_medium || '',
    utm_campaign: b.utm_campaign || '', utm_content: b.utm_content || '', utm_term: b.utm_term || '',
    pagina: b.pagina || req.headers.referer || '',
    ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
    ua: req.headers['user-agent'] || ''
  };

  // 1) persistência local primeiro: o lead nunca se perde se o Google falhar
  try {
    fs.appendFileSync(path.join(DATA_DIR, `${slug}.jsonl`), JSON.stringify(lead) + '\n');
  } catch (err) {
    console.error('falha ao gravar local:', err.message);
  }

  // 2) planilha
  const row = [
    lead.quando, lead.nome, lead.telefone, lead.email, slug,
    lead.utm_source, lead.utm_medium, lead.utm_campaign, lead.utm_content, lead.utm_term, lead.pagina
  ];
  let planilha = 'ok';
  try {
    await execFileAsync(GOOGLE_SCRIPT, [
      'sheets-append', GOOGLE_USER, cfg.sheet_id, `${cfg.tab || 'Leads'}!A:K`, JSON.stringify([row])
    ], { timeout: 20000 });
  } catch (err) {
    planilha = 'pendente';
    console.error('sheets-append falhou:', err.message);
    try { fs.appendFileSync(path.join(DATA_DIR, `${slug}.pendentes.jsonl`), JSON.stringify(lead) + '\n'); } catch {}
  }

  console.log(`lead ${slug}: ${nome} / ${telefone} (planilha: ${planilha})`);
  res.json({ ok: true, redirect: cfg.obrigado || null });
});

app.listen(PORT, '0.0.0.0', () => console.log(`jeff-leads ouvindo na :${PORT}`));
