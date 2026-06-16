'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function readWorkerToken() {
  try {
    const env = fs.readFileSync(path.resolve(__dirname, '../../jeff-worker/.env'), 'utf8');
    const m = env.match(/^API_TOKEN=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const WORKER_TOKEN = readWorkerToken();

const META_PIXEL_ID = process.env.META_PIXEL_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

function hashSHA256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

async function sendCapiEvent(eventName, userData, eventSourceUrl, eventId, customData) {
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
    if (customData) event.custom_data = customData;
    const resp = await fetch(`https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] })
    });
    const body = await resp.json();
    if (body.error) console.error('CAPI error response:', JSON.stringify(body.error));
    else console.log('CAPI ok:', body.events_received, 'event(s) received');
  } catch (err) {
    console.error('CAPI error:', err.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3026;
const SHEET_ID = process.env.SHEET_ID || '1I2uandximvso0o4bZ2tpy1m-c-ogSds24PwBjYbb-R0';
const GOOGLE_USER = process.env.GOOGLE_USER || 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = path.resolve(__dirname, '../../jeff-worker/scripts/google.sh');

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

const GUSTAVO_PHONE = '5562996321433';
const WAPI_URL = 'http://127.0.0.1:3002';

async function notifyGustavo(lead) {
  try {
    const cidade = [lead.geo_city, lead.geo_state].filter(Boolean).join('/') || lead.regiao || '';
    const lines = [
      'Novo lead CIGC 2026',
      '',
      `Nome: ${lead.nome || '-'}`,
      `Tel: ${lead.telefone || '-'}`,
      `E-mail: ${lead.email || '-'}`,
      `Cidade: ${cidade || '-'}`,
      `Dono de clinica: ${lead.dono_clinica || '-'}`,
      `Clinica: ${lead.nome_clinica || '-'}`,
      `Instagram: ${lead.instagram || '-'}`
    ];
    await fetch(`${WAPI_URL}/messages/private`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ to: GUSTAVO_PHONE, body: lines.join('\n') })
    });
  } catch (err) {
    console.error('notifyGustavo error:', err.message);
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

app.post('/api/submit', async (req, res) => {
  try {
    const {
      nome, telefone, email, instagram,
      dono_clinica, nome_clinica, segmento, regiao,
      conexao, plataforma, posicionamento, utm_content,
      event_id, fbc, fbp
    } = req.body;

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const geo = await getGeoByIp(ip);
    const { formatted, dayName } = getBrazilDateTime();

    const row = [
      formatted,
      nome || '',
      telefone || '',
      email || '',
      instagram || '',
      dono_clinica || '',
      nome_clinica || '',
      segmento || '',
      regiao || '',
      geo.city,
      geo.state,
      conexao || '',
      plataforma || '',
      posicionamento || '',
      utm_content || '',
      dayName
    ];

    await execFileAsync(GOOGLE_SCRIPT, [
      'sheets-append', GOOGLE_USER, SHEET_ID,
      'Respostas!A:P',
      JSON.stringify([row])
    ]);

    notifyGustavo({ nome, telefone, email, instagram, dono_clinica, nome_clinica, regiao, geo_city: geo.city, geo_state: geo.state });

    const referer = req.headers.referer || 'https://cigc.cadastroforms.com';
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
    const capiCustomData = {
      content_name: 'CIGC 2026',
      content_category: segmento || '',
      value: 0,
      currency: 'BRL'
    };
    sendCapiEvent('Lead', capiUserData, referer, event_id, capiCustomData);

    res.json({ ok: true });
  } catch (err) {
    console.error('submit error:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao salvar. Tente novamente.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-cigc-forms rodando na porta ${PORT}`);
});
