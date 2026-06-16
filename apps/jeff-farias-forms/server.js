'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3029;
const SHEET_ID = process.env.SHEET_ID || '13Fgr8BSzdNkuyZg6Ed2vFuQYTwAAFJlVu0eupV64S78';
const GOOGLE_USER = process.env.GOOGLE_USER || 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = path.resolve(__dirname, '../../jeff-worker/scripts/google.sh');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function detectDevice(ua) {
  if (!ua) return 'Desconhecido';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Outro';
}

function detectBrowser(ua) {
  if (!ua) return 'Desconhecido';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  return 'Outro';
}

async function getGeoIP(ip) {
  try {
    const cleanIp = ip === '::1' || ip === '127.0.0.1' ? '' : ip;
    if (!cleanIp) return { city: 'Local', state: '' };
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=city,regionName&lang=pt-BR`);
    const data = await res.json();
    return { city: data.city || '', state: data.regionName || '' };
  } catch { return { city: '', state: '' }; }
}

function notifyJeff(nome, whatsapp, posicionamento) {
  const wapi = path.resolve(__dirname, '../../jeff-worker/scripts/wapi.sh');
  const msg = `Nova aplicacao Proximo Ciclo!\n\nNome: ${nome}\nWhatsApp: ${whatsapp}\nPerfil: ${posicionamento}`;
  execFile(wapi, ['POST', '/messages/private', JSON.stringify({ to: '5511910075450', body: msg })],
    (err) => { if (err) console.error('notify error:', err.message); });
}

app.post('/submit', async (req, res) => {
  try {
    const {
      nome, linkedin, whatsapp, posicionamento,
      faturamento, experiencia, momento, decisoes,
      preocupacao, porque_pronto, capacidade_financeira,
      rede
    } = req.body;

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const device = detectDevice(ua);
    const browser = detectBrowser(ua);

    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const ts = brt.toISOString().replace('T', ' ').substring(0, 19) + ' BRT';

    // ordem deve bater com os cabeçalhos da aba "Aplicações": A-R
    const row = [
      ts,                          // A: Data/Hora (BRT)
      nome || '',                  // B: Nome Completo
      linkedin || '',              // C: LinkedIn
      whatsapp || '',              // D: WhatsApp
      '',                          // E: Email (não coletado)
      posicionamento || '',        // F: Posicionamento no Mercado
      faturamento || '',           // G: Faturamento Anual
      experiencia || '',           // H: Experiência em Liderança
      momento || '',               // I: Momento Profissional
      decisoes || '',              // J: Decisões Sozinho
      preocupacao || '',           // K: Preocupação com Futuro
      porque_pronto || '',         // L: Por que está pronto
      capacidade_financeira || '', // M: Capacidade Financeira
      device,                      // N: Dispositivo
      '',                          // O: Sistema Operacional
      browser,                     // P: Navegador
      rede || '',                  // Q: Rede
      ip                           // R: IP
    ];

    const appendResult = await execFileAsync(GOOGLE_SCRIPT, [
      'sheets-append', GOOGLE_USER, SHEET_ID,
      'Aplicações!A:R',
      JSON.stringify([row])
    ]);
    if (appendResult.stdout && appendResult.stdout.includes('"error"')) {
      throw new Error(appendResult.stdout);
    }

    notifyJeff(nome, whatsapp, posicionamento);

    res.json({ ok: true });
  } catch (err) {
    console.error('submit error:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao salvar. Tente novamente.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-farias-forms rodando na porta ${PORT}`);
});
