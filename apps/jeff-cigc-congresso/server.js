'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const META_PIXEL_ID = process.env.META_PIXEL_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

function hashSHA256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

async function sendCapiEvent(eventName, userData, eventSourceUrl, eventId) {
  if (!META_PIXEL_ID || !META_ACCESS_TOKEN) return;
  try {
    const event = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: eventSourceUrl,
      action_source: 'website',
      user_data: userData
    };
    if (eventId) event.event_id = eventId;
    const resp = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] })
    });
    const body = await resp.json();
    if (body.error) console.error('CAPI error:', JSON.stringify(body.error));
    else console.log('CAPI ok:', body.events_received);
  } catch (err) {
    console.error('CAPI error:', err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3027;
const SHEET_ID = process.env.SHEET_ID || '1I2uandximvso0o4bZ2tpy1m-c-ogSds24PwBjYbb-R0';
const GOOGLE_USER = process.env.GOOGLE_USER || 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = path.resolve(__dirname, '../../jeff-worker/scripts/google.sh');
const GUSTAVO_PHONE = '5562996321433';
const WAPI_URL = 'http://127.0.0.1:3002';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

async function getGeoByIp(ip) {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,query&lang=pt`);
    if (!res.ok) return { city: '', state: '' };
    const data = await res.json();
    return { city: data.city || '', state: data.regionName || '' };
  } catch {
    return { city: '', state: '' };
  }
}

function getBrazilDateTime() {
  const now = new Date();
  const formatted = now.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });
  const weekdayMap = {
    sunday: 'Domingo', monday: 'Segunda', tuesday: 'Terca', wednesday: 'Quarta',
    thursday: 'Quinta', friday: 'Sexta', saturday: 'Sabado'
  };
  const en = now.toLocaleString('en-US', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
  const dayName = weekdayMap[en.toLowerCase()] || en;
  return { formatted, dayName };
}

async function notifyGustavo(lead) {
  try {
    const cidade = [lead.geo_city, lead.geo_state].filter(Boolean).join('/') || '';
    const lines = [
      'Novo lead CIGC 2026 (congressogestores)',
      '',
      `Nome: ${lead.nome || '-'}`,
      `Tel: ${lead.telefone || '-'}`,
      `E-mail: ${lead.email || '-'}`,
      `Cidade: ${cidade || '-'}`
    ];
    await fetch(`${WAPI_URL}/messages/private`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: GUSTAVO_PHONE, body: lines.join('\n') })
    });
  } catch (err) {
    console.error('notifyGustavo error:', err.message);
  }
}

app.post('/api/submit', async (req, res) => {
  try {
    const { nome, telefone, email, event_id, fbc, fbp, utm_content } = req.body;

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const geo = await getGeoByIp(ip);
    const { formatted, dayName } = getBrazilDateTime();

    const row = [
      formatted,
      nome || '',
      telefone || '',
      email || '',
      '',
      '',
      '',
      '',
      '',
      geo.city,
      geo.state,
      '',
      'congressogestores',
      '',
      utm_content || '',
      dayName
    ];

    await execFileAsync(GOOGLE_SCRIPT, [
      'sheets-append', GOOGLE_USER, SHEET_ID,
      'Respostas!A:P',
      JSON.stringify([row])
    ]);

    notifyGustavo({ nome, telefone, email, geo_city: geo.city, geo_state: geo.state });

    const referer = req.headers.referer || 'https://congressogestores.cadastroforms.com';
    const phoneDigits = (telefone || '').replace(/\D/g, '');
    const capiUserData = {
      em: hashSHA256(email),
      ph: phoneDigits ? hashSHA256('55' + phoneDigits) : undefined,
      fn: hashSHA256((nome || '').split(' ')[0]),
      ln: hashSHA256((nome || '').split(' ').slice(1).join(' ')),
      ct: hashSHA256(geo.city),
      st: hashSHA256(geo.state),
      country: hashSHA256('br'),
      client_ip_address: ip,
      client_user_agent: req.headers['user-agent']
    };
    if (fbc) capiUserData.fbc = fbc;
    if (fbp) capiUserData.fbp = fbp;
    sendCapiEvent('Lead', capiUserData, referer, event_id);

    res.json({ ok: true });
  } catch (err) {
    console.error('submit error:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao salvar. Tente novamente.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const fs = require('fs');
const INDEX_HTML = path.join(__dirname, 'public', 'index.html');
app.get('/', (req, res) => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8')
    .replace('window.__META_PIXEL_ID__', JSON.stringify(META_PIXEL_ID || null));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
app.get('*', (req, res) => res.sendFile(INDEX_HTML));

app.listen(PORT, '0.0.0.0', () => console.log(`jeff-cigc-congresso rodando na porta ${PORT}`));
