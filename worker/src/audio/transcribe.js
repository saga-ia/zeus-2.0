const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { config } = require('../config');
const logger = require('../logger');

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3';
const TIMEOUT_MS = 30_000;

function buildMultipart(filePath, fields) {
  const boundary = '----ww' + Math.random().toString(16).slice(2);
  const CRLF = '\r\n';
  const fileBuf = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`, 'utf8'));
  }
  parts.push(
    Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}Content-Type: application/octet-stream${CRLF}${CRLF}`,
      'utf8'
    )
  );
  parts.push(fileBuf);
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8'));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function postMultipart(url, { body, contentType }, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: { 'Content-Type': contentType, 'Content-Length': body.length, ...headers },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(raw);
          else reject(new Error(`groq ${res.statusCode}: ${raw.slice(0, 300)}`));
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('groq request timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function transcribe(filePath, { language = 'pt' } = {}) {
  if (!config.groqApiKey) throw new Error('GROQ_API_KEY not set');
  const mp = buildMultipart(filePath, { model: MODEL, language, response_format: 'json' });
  const raw = await postMultipart(ENDPOINT, mp, { Authorization: `Bearer ${config.groqApiKey}` });
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('groq response not JSON');
  }
  const text = (json.text || '').trim();
  logger.info({ filePath, chars: text.length }, 'groq transcription ok');
  return text;
}

module.exports = { transcribe };
