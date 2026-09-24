const http = require('http');
const { execFile, spawn } = require('child_process');

const SHEET_ID = '1prKyR5kB-Zb6Fvsh13IN7aFzCQI2JHG3A7AHDw3alEQ';
const USER = 'jefersonhenrike1@gmail.com';
const HELPER = '/opt/jeff-worker/scripts/google.sh';
const REFRESH = '/opt/jeff-sites/boardsummit2026planilha/refresh.py';
const PORT = 3095;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function callRaw(method, url, body) {
  return new Promise((resolve, reject) => {
    const args = [HELPER, 'raw', USER, method, url];
    if (body != null) args.push(typeof body === 'string' ? body : JSON.stringify(body));
    execFile('/bin/bash', args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function runRefresh() {
  return new Promise((resolve) => {
    const p = spawn('/usr/bin/python3', [REFRESH], { stdio: 'ignore', detached: true });
    p.unref();
    setTimeout(resolve, 100);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function looksLikeRange(s) {
  return typeof s === 'string' && /^[A-Za-z0-9_ !''"À-ÿ()-]+![A-Z]+\d+(:[A-Z]+\d+)?$/.test(s);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return send(res, 200, { ok: true, service: 'jeff-board-editor' });
  }
  if (req.method !== 'POST' || req.url !== '/save') {
    return send(res, 404, { ok: false, error: 'not_found' });
  }
  let payload;
  try { payload = await readJson(req); }
  catch (e) { return send(res, 400, { ok: false, error: 'invalid_json' }); }

  const edits = Array.isArray(payload.edits) ? payload.edits : [];
  if (!edits.length) return send(res, 400, { ok: false, error: 'no_edits' });
  if (edits.length > 200) return send(res, 400, { ok: false, error: 'too_many_edits' });

  const data = [];
  for (const e of edits) {
    if (!looksLikeRange(e.range)) {
      return send(res, 400, { ok: false, error: 'bad_range', range: e.range });
    }
    const val = e.value == null ? '' : String(e.value);
    if (val.length > 200) return send(res, 400, { ok: false, error: 'value_too_long', range: e.range });
    data.push({ range: e.range, values: [[val]] });
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`;
    const out = await callRaw('POST', url, { valueInputOption: 'USER_ENTERED', data });
    let parsed = null;
    try { parsed = JSON.parse(out); } catch (_) { parsed = { raw: out.slice(0, 400) }; }
    if (parsed && parsed.error) {
      return send(res, 502, { ok: false, error: 'sheets_error', details: parsed.error });
    }
    await runRefresh();
    return send(res, 200, {
      ok: true,
      updated_ranges: data.map(d => d.range),
      totalUpdatedCells: parsed && parsed.totalUpdatedCells,
    });
  } catch (err) {
    return send(res, 500, { ok: false, error: 'internal', message: String(err.message || err) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-board-editor listening on ${PORT}`);
});
