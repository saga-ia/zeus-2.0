'use strict';
const express = require('express');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3029;
const SHEET_ID = process.env.SHEET_ID || '13Fgr8BSzdNkuyZg6Ed2vFuQYTwAAFJlVu0eupV64S78';
const GOOGLE_USER = process.env.GOOGLE_USER || 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = path.resolve(__dirname, '../../jeff-worker/scripts/google.sh');
const WAPI_SCRIPT = path.resolve(__dirname, '../../jeff-worker/scripts/wapi.sh');

app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function isEmailValid(v) {
  if (typeof v !== 'string') return false;
  const email = v.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
  return true;
}

function detectDevice(ua) {
  if (!ua) return 'Desconhecido';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Outro';
}

function detectOS(ua) {
  if (!ua) return '';
  const m1 = ua.match(/iPhone OS ([\d_]+)/); if (m1) return 'iOS ' + m1[1].replace(/_/g,'.');
  const m2 = ua.match(/iPad; CPU OS ([\d_]+)/); if (m2) return 'iPadOS ' + m2[1].replace(/_/g,'.');
  const m3 = ua.match(/Android ([\d.]+)/); if (m3) return 'Android ' + m3[1];
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7';
  const m4 = ua.match(/Mac OS X ([\d_]+)/); if (m4) return 'macOS ' + m4[1].replace(/_/g,'.');
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

function detectBrowser(ua) {
  if (!ua) return 'Desconhecido';
  if (/Instagram/.test(ua)) return 'Instagram App';
  if (/FBAN|FBAV/.test(ua)) return 'Facebook App';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  return 'Outro';
}

function detectSource(ua, tracking) {
  const t = tracking || {};
  const origem = (t.origem || '').toLowerCase();
  if (origem === 'pagina' || origem === 'página') return 'Página';
  if (origem) return origem.charAt(0).toUpperCase() + origem.slice(1);
  const src = (t.utm_source || '').toLowerCase();
  if (src.includes('fb') || src.includes('facebook')) return 'Facebook';
  if (src.includes('ig') || src.includes('insta')) return 'Instagram';
  if (src.includes('google')) return 'Google';
  if (src.includes('whats')) return 'WhatsApp';
  if (t.fbclid) return 'Facebook/Instagram (fbclid)';
  if (t.gclid) return 'Google Ads';
  if (/Instagram/.test(ua)) return 'Instagram (in-app)';
  if (/FBAN|FBAV/.test(ua)) return 'Facebook (in-app)';
  const ref = (t.referrer || '').toLowerCase();
  if (ref.includes('instagram')) return 'Instagram';
  if (ref.includes('facebook')) return 'Facebook';
  if (ref.includes('google')) return 'Google';
  if (ref.includes('whatsapp') || ref.includes('wa.me')) return 'WhatsApp';
  if (!ref) return 'Direto';
  return 'Outro';
}

function detectPlacement(tracking) {
  const t = tracking || {};
  const explicit = (t.placement || '').toLowerCase();
  if (explicit) return explicit.charAt(0).toUpperCase() + explicit.slice(1);
  const content = (t.utm_content || '').toLowerCase();
  const campaign = (t.utm_campaign || '').toLowerCase();
  const medium = (t.utm_medium || '').toLowerCase();
  const blob = content + ' ' + campaign + ' ' + medium;
  if (/stories|story/.test(blob)) return 'Stories';
  if (/reel/.test(blob)) return 'Reels';
  if (/feed/.test(blob)) return 'Feed';
  if (/explor/.test(blob)) return 'Explore';
  if (/search/.test(blob)) return 'Search';
  return '';
}

function brtIsoNow() {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().replace('T', ' ').substring(0, 19) + ' BRT';
}

async function geoLookup(ip) {
  try {
    if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '::1') {
      return { city: '', region: '', country: '' };
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city&lang=pt-BR`, { signal: controller.signal });
    clearTimeout(t);
    const j = await r.json();
    if (j.status !== 'success') return { city: '', region: '', country: '' };
    return { city: j.city || '', region: j.regionName || '', country: j.country || '' };
  } catch {
    return { city: '', region: '', country: '' };
  }
}

// phones que recebem alerta de nova aplicação
const NOTIFY_PHONES = ['5511910075450', '5512996361910', '5511988792521'];

// ------------------------------------------------------------
// Auto-save de abandonos (aba "Abandonos")
// ------------------------------------------------------------
const ABANDONOS_TAB = 'Abandonos';
const ABANDONOS_COLS = 'AL'; // 38 colunas: A..AL
const sessionRowCache = new Map();   // session_id -> row number
const sessionMeta = new Map();       // session_id -> { primeira, geo }
const sessionLocks = new Map();      // session_id -> Promise (serializa upsert)

async function withSessionLock(sessionId, fn) {
  const prev = sessionLocks.get(sessionId) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  sessionLocks.set(sessionId, next);
  try {
    return await next;
  } finally {
    if (sessionLocks.get(sessionId) === next) sessionLocks.delete(sessionId);
  }
}

async function findAbandonoRow(sessionId) {
  if (sessionRowCache.has(sessionId)) return sessionRowCache.get(sessionId);
  const r = await execFileAsync(GOOGLE_SCRIPT, ['sheets-get', GOOGLE_USER, SHEET_ID, `${ABANDONOS_TAB}!A:A`]);
  const values = (JSON.parse(r.stdout).values) || [];
  for (let i = 1; i < values.length; i++) {
    if (values[i] && values[i][0] === sessionId) {
      sessionRowCache.set(sessionId, i + 1);
      return i + 1;
    }
  }
  return null;
}

async function nextAbandonoRow() {
  const r = await execFileAsync(GOOGLE_SCRIPT, ['sheets-get', GOOGLE_USER, SHEET_ID, `${ABANDONOS_TAB}!A:A`]);
  const values = (JSON.parse(r.stdout).values) || [];
  return values.length + 1;
}

async function upsertAbandono(payload) {
  const sessionId = payload.session_id;
  if (!sessionId) return;

  const ua = payload._ua || '';
  const ip = payload._ip || '';
  const device = detectDevice(ua);
  const os = detectOS(ua);
  const browser = detectBrowser(ua);
  const source = detectSource(ua, payload.tracking);
  const placement = detectPlacement(payload.tracking);
  const t = payload.tracking || {};
  const now = brtIsoNow();

  let targetRow = await findAbandonoRow(sessionId);
  let primeira = now;
  let geo = { city: '', region: '', country: '' };

  const cached = sessionMeta.get(sessionId);
  if (cached) {
    primeira = cached.primeira;
    geo = cached.geo;
  } else if (targetRow) {
    // linha existe (novo boot do worker) mas sem cache: lê row pra preservar primeira/geo
    const r = await execFileAsync(GOOGLE_SCRIPT, ['sheets-get', GOOGLE_USER, SHEET_ID, `${ABANDONOS_TAB}!A${targetRow}:AL${targetRow}`]);
    const vals = (JSON.parse(r.stdout).values) || [];
    if (vals[0]) {
      if (vals[0][1]) primeira = vals[0][1];
      geo = { city: vals[0][24] || '', region: vals[0][25] || '', country: vals[0][26] || '' };
    }
  } else {
    geo = await geoLookup(ip);
  }
  sessionMeta.set(sessionId, { primeira, geo });

  const status = payload.status || 'Em andamento';
  const finalizadoEm = status === 'Finalizado' ? now : '';

  const row = [
    sessionId,                                       // A
    primeira,                                        // B
    now,                                             // C: ultima_atividade
    payload.current_id || '',                        // D: ultima_pergunta
    payload.pergunta_numero || '',                   // E
    status,                                          // F
    payload.nome || '',                              // G
    payload.telefone || '',                          // H
    payload.email || '',                             // I
    payload.empresa || '',                           // J
    payload.colaboradores || '',                     // K
    payload.faturamento || '',                       // L
    payload.posicao || '',                           // M
    payload.gargalo || '',                           // N
    payload.desafio_90d || '',                       // O
    payload.impede_dobrar || '',                     // P
    payload.divisor_aguas || '',                     // Q
    payload.pergunta_conselho || '',                 // R
    payload.tempo_ate_aqui || '',                    // S
    device,                                          // T
    os,                                              // U
    browser,                                         // V
    payload.rede || '',                              // W
    ip,                                              // X
    geo.city,                                        // Y
    geo.region,                                      // Z
    geo.country,                                     // AA
    source,                                          // AB
    placement,                                       // AC
    t.utm_source || '',                              // AD
    t.utm_medium || '',                              // AE
    t.utm_campaign || '',                            // AF
    t.utm_content || '',                             // AG
    t.fbclid || '',                                  // AH
    t.referrer || '',                                // AI
    t.creative_id || '',                             // AJ
    ua,                                              // AK
    finalizadoEm                                     // AL
  ];

  if (!targetRow) targetRow = await nextAbandonoRow();
  const range = `${ABANDONOS_TAB}!A${targetRow}:${ABANDONOS_COLS}${targetRow}`;
  const upd = await execFileAsync(GOOGLE_SCRIPT, [
    'raw', GOOGLE_USER, 'PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    JSON.stringify({ values: [row] })
  ]);
  if (upd.stdout && upd.stdout.includes('"error"')) throw new Error(upd.stdout);
  sessionRowCache.set(sessionId, targetRow);
}

app.post('/autosave', (req, res) => {
  // responde na hora (fire and forget); a gravação segue em background
  res.json({ ok: true });
  try {
    const sessionId = req.body && req.body.session_id;
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10 || sessionId.length > 80) return;
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const payload = Object.assign({}, req.body, { _ip: ip, _ua: ua });
    withSessionLock(sessionId, () => upsertAbandono(payload))
      .catch(err => console.error('autosave upsert error:', err.message));
  } catch (err) {
    console.error('autosave error:', err.message);
  }
});

function notifyJeff(nome, telefone, empresa, posicao, source, city, region) {
  const geo = [city, region].filter(Boolean).join('/');
  const msg = `Nova aplicacao Farias Souza\n\nNome: ${nome}\nTelefone: ${telefone}\nEmpresa: ${empresa}\nPosicao: ${posicao}\nOrigem: ${source || '-'}\nLocal: ${geo || '-'}`;
  for (const to of NOTIFY_PHONES) {
    execFile(WAPI_SCRIPT, ['POST', '/messages/private', JSON.stringify({ to, body: msg })],
      (err) => { if (err) console.error('notify error:', err.message); });
  }
}

app.post('/submit', async (req, res) => {
  try {
    const {
      nome, telefone, email, empresa,
      colaboradores, preferencia, horario,
      faturamento, posicao, rede,
      gargalo, desafio_90d, impede_dobrar, divisor_aguas, pergunta_conselho,
      tempo_preenchimento, tracking
    } = req.body;

    if (!isEmailValid(email)) {
      return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const device = detectDevice(ua);
    const os = detectOS(ua);
    const browser = detectBrowser(ua);
    const source = detectSource(ua, tracking);
    const placement = detectPlacement(tracking);
    const geo = await geoLookup(ip);

    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const ts = brt.toISOString().replace('T', ' ').substring(0, 19) + ' BRT';

    const t = tracking || {};

    // ordem A-AH conforme cabecalhos da aba "Aplicações"
    const row = [
      ts,                                // A: Data/Hora (BRT)
      nome || '',                        // B: Nome Completo
      telefone || '',                    // C: Telefone
      email || '',                       // D: E-mail Corporativo
      empresa || '',                     // E: Empresa
      '',                                // F: CNPJ (removido do form)
      colaboradores || '',               // G: Colaboradores
      preferencia || '',                 // H: Preferencia
      horario || '',                     // I: Horario
      faturamento || '',                 // J: Faturamento
      posicao || '',                     // K: Posicao
      device,                            // L: Dispositivo
      os,                                // M: Sistema Operacional
      browser,                           // N: Navegador
      rede || '',                        // O: Conexao (WiFi/4G)
      ip,                                // P: IP
      geo.city,                          // Q: Cidade
      geo.region,                        // R: Estado/Regiao
      geo.country,                       // S: Pais
      source,                            // T: Origem
      placement,                         // U: Placement
      t.utm_source || '',                // V: UTM Source
      t.utm_medium || '',                // W: UTM Medium
      t.utm_campaign || '',              // X: UTM Campaign
      t.utm_content || '',               // Y: UTM Content
      t.fbclid || '',                    // Z: fbclid
      t.referrer || '',                  // AA: Referrer
      t.creative_id || '',               // AB: Creative ID
      tempo_preenchimento || '',         // AC: Tempo Preenchimento (s)
      gargalo || '',                     // AD: Gargalo Principal
      desafio_90d || '',                 // AE: Desafio 90 Dias
      impede_dobrar || '',               // AF: Impede Dobrar 12 Meses
      divisor_aguas || '',               // AG: Divisor de Águas
      pergunta_conselho || ''            // AH: Pergunta ao Farias
    ];

    // Sheets append tem bug de detecção de tabela quando linhas anteriores têm gaps:
    // pode gravar deslocado (ex: começar em AC). Descobre a próxima linha vazia
    // pela coluna A e faz update explícito nela.
    const getResult = await execFileAsync(GOOGLE_SCRIPT, [
      'sheets-get', GOOGLE_USER, SHEET_ID, 'Aplicações!A:A'
    ]);
    const currentRows = (JSON.parse(getResult.stdout).values || []).length;
    const nextRow = currentRows + 1;
    const range = `Aplicações!A${nextRow}:AH${nextRow}`;
    const updateResult = await execFileAsync(GOOGLE_SCRIPT, [
      'raw', GOOGLE_USER, 'PUT',
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      JSON.stringify({ values: [row] })
    ]);
    if (updateResult.stdout && updateResult.stdout.includes('"error"')) {
      throw new Error(updateResult.stdout);
    }

    notifyJeff(nome, telefone, empresa, posicao, source, geo.city, geo.region);

    // marca a sessão como Finalizado na aba Abandonos (se veio session_id)
    const sessionId = req.body.session_id;
    if (sessionId) {
      withSessionLock(sessionId, () => upsertAbandono({
        session_id: sessionId,
        current_id: 'q15',
        pergunta_numero: 12,
        status: 'Finalizado',
        nome, telefone, email, empresa,
        colaboradores, faturamento, posicao,
        gargalo: req.body.gargalo || '',
        desafio_90d, impede_dobrar, divisor_aguas, pergunta_conselho,
        rede,
        tempo_ate_aqui: tempo_preenchimento,
        tracking: req.body.tracking,
        _ip: ip, _ua: ua
      })).catch(err => console.error('finalizar abandono error:', err.message));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('submit error:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao salvar. Tente novamente.' });
  }
});

// ------------------------------------------------------------
// Palestras — captura de leads pra contratar Farias como palestrante
// ------------------------------------------------------------

function notifyJeffPalestra(nome, telefone, email, empresa, cargo, tipo, dataEvento, cidade, mensagem, source) {
  const linhas = [
    'Novo lead — CONTRATAR PALESTRA (Farias Souza)',
    '',
    `Nome: ${nome}`,
    `Telefone: ${telefone}`,
    `E-mail: ${email}`,
    `Empresa: ${empresa}`,
    cargo ? `Cargo: ${cargo}` : null,
    tipo ? `Tipo de evento: ${tipo}` : null,
    dataEvento ? `Data prevista: ${dataEvento}` : null,
    cidade ? `Cidade/Estado: ${cidade}` : null,
    mensagem ? `Mensagem: ${mensagem}` : null,
    `Origem: ${source || '-'}`,
  ].filter(Boolean);
  const msg = linhas.join('\n');
  for (const to of NOTIFY_PHONES) {
    execFile(WAPI_SCRIPT, ['POST', '/messages/private', JSON.stringify({ to, body: msg })],
      (err) => { if (err) console.error('notify palestra error:', err.message); });
  }
}

app.get('/palestras', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'palestras.html'));
});

app.post('/submit-palestras', async (req, res) => {
  try {
    const {
      nome, telefone, email, empresa,
      cargo, tipo_evento, data_evento, cidade, mensagem,
      tracking
    } = req.body;

    if (!nome || !telefone || !empresa) {
      return res.status(400).json({ ok: false, error: 'Nome, telefone e empresa são obrigatórios.' });
    }
    if (!isEmailValid(email)) {
      return res.status(400).json({ ok: false, error: 'E-mail inválido.' });
    }

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const device = detectDevice(ua);
    const source = detectSource(ua, tracking);
    const t = tracking || {};

    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const ts = brt.toISOString().replace('T', ' ').substring(0, 19) + ' BRT';

    const row = [
      ts,                       // A
      nome || '',               // B
      telefone || '',           // C
      email || '',              // D
      empresa || '',            // E
      cargo || '',              // F
      tipo_evento || '',        // G
      data_evento || '',        // H
      cidade || '',             // I
      mensagem || '',           // J
      source,                   // K
      device,                   // L
      ip,                       // M
      t.referrer || ''          // N
    ];

    const appendResult = await execFileAsync(GOOGLE_SCRIPT, [
      'sheets-append', GOOGLE_USER, SHEET_ID,
      'Palestras!A:N',
      JSON.stringify([row])
    ]);
    if (appendResult.stdout && appendResult.stdout.includes('"error"')) {
      throw new Error(appendResult.stdout);
    }

    notifyJeffPalestra(nome, telefone, email, empresa, cargo, tipo_evento, data_evento, cidade, mensagem, source);

    res.json({ ok: true });
  } catch (err) {
    console.error('submit-palestras error:', err.message);
    res.status(500).json({ ok: false, error: 'Erro ao enviar. Tente novamente.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-farias-forms rodando na porta ${PORT}`);
});
