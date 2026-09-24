'use strict';
const express = require('express');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3066;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_USER = process.env.GOOGLE_USER || 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = path.resolve(__dirname, '../../jeff-worker/scripts/google.sh');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function nowBrt() {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });
}

app.post('/api/submit', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.nome || !b.email || !b.whatsapp || !b.empresa_segmento) {
      return res.status(400).json({ ok: false, error: 'Preencha os campos obrigatorios.' });
    }
    const gargalos = Array.isArray(b.gargalos) ? b.gargalos.slice(0, 2).join(' | ') : (b.gargalos || '');
    const row = [
      nowBrt(),
      b.nome || '',
      b.email || '',
      b.whatsapp || '',
      b.empresa_segmento || '',
      b.colaboradores || '',
      gargalos,
      b.tempo_incendios || '',
      b.desafio_90dias || '',
      b.impede_dobrar || '',
      b.divisor_aguas || '',
      b.pergunta_conselho || ''
    ];
    await execFileAsync(GOOGLE_SCRIPT, [
      'sheets-append', GOOGLE_USER, SHEET_ID,
      'Inscrições!A:L',
      JSON.stringify([row])
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('submit error:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao salvar. Tente novamente.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`jeff-conselho-do-dono rodando na porta ${PORT}`));
