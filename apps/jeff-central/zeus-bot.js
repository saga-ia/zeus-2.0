// Zeus bot no conector de WhatsApp da Central (Conectores › WhatsApp). O número principal do ZEUS roda no Zeus Worker
// (whatsapp-worker, porta 3002), não na Evolution. A Central não abre sessão nenhuma: só mostra o estado dele e traz o
// pareamento (QR ou código de 8 dígitos) para a tela, pela API do próprio worker.
//   GET  /api/wa/zeus          -> estado (conectado, aguardando QR...), número, nome e fila de envio
//   GET  /api/wa/zeus/qr       -> QR atual em SVG
//   POST /api/wa/zeus/pair     -> { phone } -> código de 8 dígitos para parear pelo número
//   POST /api/wa/zeus/restart  -> recria a sessão do worker (gera QR novo)
//   POST /api/wa/zeus/logout   -> desconecta o número
// Tudo, menos o estado, é só para administradores: quem lê o QR assume o número.
// O token da API do worker é lido do .env dele na hora (nunca copiado nem exposto), como as outras pontes.
const express = require('express');
const fs = require('fs');
const http = require('http');

const HOST = process.env.ZEUS_WORKER_HOST || '127.0.0.1';
const PORT = parseInt(process.env.ZEUS_WORKER_PORT || '3002', 10);
const ENV = process.env.ZEUS_WORKER_ENV || '/opt/jeff-worker/.env';

let _token = null, _tokenEm = 0;
function token() {
  if (_token && Date.now() - _tokenEm < 60000) return _token;
  const linha = fs.readFileSync(ENV, 'utf8').split('\n').find(l => /^\s*API_TOKEN\s*=/.test(l));
  const v = linha ? linha.replace(/^\s*API_TOKEN\s*=\s*/, '').trim().replace(/^["']|["']$/g, '') : '';
  if (!v) throw new Error('API_TOKEN do Zeus Worker não configurado');
  _token = v; _tokenEm = Date.now();
  return v;
}
// Chamada ao worker. Devolve { status, json } ou { status, texto } (QR em SVG).
function worker(method, caminho, corpo, tempo) {
  return new Promise((resolve, reject) => {
    const dados = corpo == null ? null : Buffer.from(JSON.stringify(corpo));
    const headers = { authorization: 'Bearer ' + token(), accept: 'application/json' };
    if (dados) { headers['content-type'] = 'application/json'; headers['content-length'] = dados.length; }
    const req = http.request({ host: HOST, port: PORT, method, path: caminho, headers, timeout: tempo || 15000 }, r => {
      const partes = []; r.on('data', c => partes.push(c));
      r.on('end', () => {
        const texto = Buffer.concat(partes).toString('utf8');
        let json = null; try { json = JSON.parse(texto); } catch (_) {}
        resolve({ status: r.statusCode, json, texto });
      });
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', reject);
    req.end(dados || undefined);
  });
}
const fora = (res, e) => res.status(502).json({ error: 'O Zeus Worker não respondeu (' + e.message + '). Veja se o whatsapp-worker está no ar.' });
const soAdmin = (req, res, next) => (req.user && req.user.admin) ? next() : res.status(403).json({ error: 'Só administradores da conta conectam ou desconectam o número do Zeus.' });

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [s, h] = await Promise.all([worker('GET', '/status'), worker('GET', '/health').catch(() => ({ json: null }))]);
    if (s.status !== 200 || !s.json) return res.status(502).json({ error: 'O Zeus Worker recusou a consulta (' + s.status + ').' });
    const d = s.json;
    res.json({ ok: true, state: d.state || 'unknown', since: d.since || null, number: d.meNumber || null, name: d.meName || null,
      temQr: !!d.qr, erro: d.lastError ? String(d.lastError).slice(0, 300) : null, fila: h.json && h.json.queueSize != null ? h.json.queueSize : null, admin: !!req.user.admin });
  } catch (e) { fora(res, e); }
});

router.get('/qr', soAdmin, async (_req, res) => {
  try {
    const r = await worker('GET', '/qr?format=svg');
    if (r.status === 409) return res.status(409).json({ error: 'sem_qr', state: r.json && r.json.details ? r.json.details.state : (r.json && r.json.state) || null });
    if (r.status !== 200 || !/^\s*<(\?xml|svg)/.test(r.texto)) return res.status(502).json({ error: 'O Zeus Worker não devolveu o QR (' + r.status + ').' });
    res.json({ ok: true, qr: 'data:image/svg+xml;base64,' + Buffer.from(r.texto, 'utf8').toString('base64') });
  } catch (e) { fora(res, e); }
});

router.post('/pair', soAdmin, async (req, res) => {
  const phone = String((req.body && req.body.phone) || '').replace(/\D+/g, '');
  if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error: 'Número inválido. Use DDI + DDD + número, só dígitos (ex.: 5511999999999).' });
  try {
    const r = await worker('POST', '/pair', { phone }, 40000);
    if (r.status === 200 && r.json && r.json.code) return res.json({ ok: true, code: r.json.code });
    const cod = (r.json && r.json.error) || '';
    res.status(r.status === 409 ? 409 : 502).json({ error: cod === 'client_not_pairable' ? 'O número só aceita pareamento enquanto está aguardando o QR. Gere um QR novo e tente de novo.' : 'O WhatsApp não gerou o código (' + (cod || r.status) + ').' });
  } catch (e) { fora(res, e); }
});

router.post('/restart', soAdmin, async (req, res) => {
  try { const r = await worker('POST', '/session/restart', {}); console.log('[zeus-bot] sessão recriada por', req.user.email || 'admin'); res.status(r.status === 200 ? 200 : 502).json({ ok: r.status === 200 }); }
  catch (e) { fora(res, e); }
});

router.post('/logout', soAdmin, async (req, res) => {
  try {
    const r = await worker('POST', '/session/logout', {}, 40000);
    console.log('[zeus-bot] número desconectado por', req.user.email || 'admin', '->', r.status);
    if (r.status === 200) return res.json({ ok: true });
    res.status(502).json({ error: 'Não consegui desconectar (' + ((r.json && r.json.error) || r.status) + ').' });
  } catch (e) { fora(res, e); }
});

module.exports = { router };
