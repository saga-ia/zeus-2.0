// jeff-claude-shim: endpoint no formato OpenAI (/v1/chat/completions) que responde
// usando o `claude -p` do servidor (assinatura), sem ferramentas. Feito pro Presenton.
// Escuta só no IP da bridge do Docker e exige Bearer token (.token).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HOST = process.env.SHIM_HOST || '172.17.0.1';
const PORT = +(process.env.SHIM_PORT || 8787);
const CLAUDE_BIN = process.env.CLAUDE_BIN || '/root/.nvm/versions/node/v20.20.2/bin/claude';
const MODEL = process.env.SHIM_MODEL || 'sonnet';
const MAX_CONCURRENCY = +(process.env.SHIM_CONCURRENCY || 2);
const TIMEOUT_MS = +(process.env.SHIM_TIMEOUT_MS || 240000);
const MAX_BODY = 8 * 1024 * 1024;
const MAX_ARG = 100 * 1024; // limite seguro por argumento de linha de comando
const WORKDIR = path.join(__dirname, 'work');
const TOKEN = fs.readFileSync(path.join(__dirname, '.token'), 'utf8').trim();

if (!fs.existsSync(WORKDIR)) fs.mkdirSync(WORKDIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ─── Fila: cada `claude` custa RAM/CPU, o Presenton dispara slides em paralelo ─
let running = 0;
const waiting = [];
function acquire() {
  if (running < MAX_CONCURRENCY) { running++; return Promise.resolve(); }
  return new Promise(r => waiting.push(r));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

// ─── Mensagens OpenAI → system prompt + prompt ────────────────────────────────
function textOf(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(p => {
      if (typeof p === 'string') return p;
      if (p && (p.type === 'text' || p.type === 'input_text')) return p.text || '';
      if (p && p.type === 'image_url') return '[imagem omitida: este endpoint não recebe imagens]';
      return '';
    }).filter(Boolean).join('\n');
  }
  return String(content);
}

function buildPrompt(messages) {
  const sys = [], conv = [];
  for (const m of messages || []) {
    const t = textOf(m.content);
    if (m.role === 'system' || m.role === 'developer') { if (t) sys.push(t); continue; }
    if (m.role === 'tool') { conv.push({ role: 'RESULTADO DE FERRAMENTA', text: t }); continue; }
    if (m.role === 'assistant') {
      const calls = (m.tool_calls || []).map(c => `[chamou ${c.function && c.function.name}(${c.function && c.function.arguments})]`).join('\n');
      conv.push({ role: 'ASSISTENTE', text: [t, calls].filter(Boolean).join('\n') });
      continue;
    }
    conv.push({ role: 'USUÁRIO', text: t });
  }
  let prompt;
  if (conv.length === 1 && conv[0].role === 'USUÁRIO') prompt = conv[0].text;
  else prompt = conv.map(c => `=== ${c.role} ===\n${c.text}`).join('\n\n') + '\n\nResponda agora à última mensagem do usuário.';
  return { system: sys.join('\n\n'), prompt };
}

// ─── Qual JSON Schema a resposta precisa seguir (se houver) ───────────────────
function pickSchema(body) {
  const rf = body.response_format;
  if (rf && rf.type === 'json_schema' && rf.json_schema && rf.json_schema.schema) {
    return { schema: rf.json_schema.schema, as: 'content' };
  }
  const tools = Array.isArray(body.tools) ? body.tools.filter(t => t && t.type === 'function' && t.function) : [];
  const tc = body.tool_choice;
  if (tools.length && tc && tc !== 'auto' && tc !== 'none') {
    const name = typeof tc === 'object' && tc.function ? tc.function.name : null;
    const tool = (name && tools.find(t => t.function.name === name)) || tools[0];
    return { schema: tool.function.parameters || { type: 'object' }, as: 'tool', toolName: tool.function.name };
  }
  if (rf && rf.type === 'json_object') return { schema: null, as: 'content', jsonObject: true };
  return null;
}

function extractJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (_) {}
  const i = t.search(/[\[{]/);
  const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (_) {} }
  return undefined;
}

// ─── Executa o claude CLI ─────────────────────────────────────────────────────
function runClaude({ system, prompt, schema }) {
  return new Promise((resolve, reject) => {
    const baseSystem = 'Você é um motor de geração de conteúdo chamado por API. Siga exatamente as instruções recebidas e entregue só o que foi pedido, sem comentários, saudações ou perguntas.';
    let sys = system ? system : baseSystem;
    let stdin = prompt;
    if (Buffer.byteLength(sys) > MAX_ARG) { stdin = `=== INSTRUÇÕES DO SISTEMA ===\n${sys}\n\n=== PEDIDO ===\n${prompt}`; sys = baseSystem; }
    const args = ['-p', '--model', MODEL, '--output-format', 'json', '--tools', '', '--strict-mcp-config',
      '--setting-sources', 'project', '--system-prompt', sys];
    if (schema) args.push('--json-schema', JSON.stringify(schema));

    const env = Object.assign({}, process.env);
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; // sempre a assinatura, nunca API paga
    const proc = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const timer = setTimeout(() => { if (!done) { proc.kill('SIGKILL'); fail(new Error('timeout do claude')); } }, TIMEOUT_MS);
    function fail(e) { if (done) return; done = true; clearTimeout(timer); reject(e); }
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { err += d; if (err.length > 8000) err = err.slice(-8000); });
    proc.on('error', fail);
    proc.on('close', code => {
      if (done) return; done = true; clearTimeout(timer);
      let j; try { j = JSON.parse(out); } catch (_) {}
      if (!j) return reject(new Error(`claude exit ${code}: ${(err || out).slice(-400)}`));
      if (j.is_error) return reject(new Error('claude: ' + String(j.result || j.subtype).slice(0, 400)));
      resolve(j);
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(stdin);
  });
}

async function complete(body) {
  const { system, prompt } = buildPrompt(body.messages);
  const want = pickSchema(body);
  let text = null, structured;
  let usage = { input_tokens: 0, output_tokens: 0 };
  const addUsage = j => { const u = j.usage || {}; usage.input_tokens += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); usage.output_tokens += u.output_tokens || 0; };

  const schemaFits = want && want.schema && Buffer.byteLength(JSON.stringify(want.schema)) <= MAX_ARG;
  if (schemaFits) {
    try {
      const j = await runClaude({ system, prompt, schema: want.schema });
      addUsage(j);
      structured = j.structured_output;
      if (structured === undefined) structured = extractJson(j.result);
    } catch (e) { log('schema nativo falhou, tentando por prompt:', e.message.slice(0, 200)); }
  }
  if (want && structured === undefined) {
    const guide = want.schema
      ? `\n\nResponda SOMENTE com um JSON válido (sem crases, sem texto antes ou depois) que satisfaça este JSON Schema:\n${JSON.stringify(want.schema)}`
      : '\n\nResponda SOMENTE com um objeto JSON válido, sem crases e sem texto antes ou depois.';
    const j = await runClaude({ system, prompt: prompt + guide });
    addUsage(j);
    structured = extractJson(j.result);
    if (structured === undefined) throw new Error('o modelo não devolveu JSON válido');
  }
  if (!want) {
    const j = await runClaude({ system, prompt });
    addUsage(j);
    text = String(j.result || '');
  }

  const message = { role: 'assistant', content: null };
  let finish = 'stop';
  if (want && want.as === 'tool') {
    message.tool_calls = [{ id: 'call_' + crypto.randomBytes(9).toString('hex'), type: 'function',
      function: { name: want.toolName, arguments: JSON.stringify(structured) } }];
    finish = 'tool_calls';
  } else {
    message.content = want ? JSON.stringify(structured) : text;
  }
  return { message, finish, usage: { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens, total_tokens: usage.input_tokens + usage.output_tokens } };
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function authed(req) {
  const h = String(req.headers.authorization || '');
  const got = Buffer.from(h.replace(/^Bearer\s+/i, ''));
  const exp = Buffer.from(TOKEN);
  return got.length === exp.length && crypto.timingSafeEqual(got, exp);
}

async function handleChat(req, res, body) {
  const id = 'chatcmpl-' + crypto.randomBytes(12).toString('hex');
  const created = Math.floor(Date.now() / 1000);
  const model = body.model || 'claude-code';
  const stream = !!body.stream;
  const t0 = Date.now();
  let ping = null, aborted = false;
  res.on('close', () => { aborted = true; if (ping) clearInterval(ping); });

  if (stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': aguardando claude\n\n');
    ping = setInterval(() => { if (!aborted) res.write(': ping\n\n'); }, 5000);
  }
  await acquire();
  try {
    if (aborted) return;
    const r = await complete(body);
    log(`ok ${Date.now() - t0}ms stream=${stream} msgs=${(body.messages || []).length} schema=${!!pickSchema(body)} tokens=${r.usage.total_tokens} fila=${waiting.length}`);
    if (!stream) {
      return sendJson(res, 200, { id, object: 'chat.completion', created, model,
        choices: [{ index: 0, message: r.message, finish_reason: r.finish, logprobs: null }], usage: r.usage });
    }
    const chunk = (delta, finish, extra) => res.write('data: ' + JSON.stringify(Object.assign({ id, object: 'chat.completion.chunk', created, model,
      choices: [{ index: 0, delta, finish_reason: finish || null, logprobs: null }] }, extra || {})) + '\n\n');
    chunk({ role: 'assistant', content: '' });
    if (r.message.tool_calls) {
      const c = r.message.tool_calls[0];
      chunk({ tool_calls: [{ index: 0, id: c.id, type: 'function', function: { name: c.function.name, arguments: c.function.arguments } }] });
    } else {
      const s = r.message.content || '';
      for (let i = 0; i < s.length; i += 600) chunk({ content: s.slice(i, i + 600) });
    }
    chunk({}, r.finish);
    if (body.stream_options && body.stream_options.include_usage) {
      res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [], usage: r.usage }) + '\n\n');
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    log(`erro ${Date.now() - t0}ms: ${e.message.slice(0, 300)}`);
    const err = { error: { message: e.message.slice(0, 500), type: 'server_error', code: 'claude_shim_error' } };
    if (stream) { if (!aborted) { res.write('data: ' + JSON.stringify(err) + '\n\n'); res.end(); } }
    else sendJson(res, 500, err);
  } finally {
    if (ping) clearInterval(ping);
    release();
  }
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (req.method === 'GET' && url === '/health') return sendJson(res, 200, { ok: true, running, waiting: waiting.length });
  if (!authed(req)) return sendJson(res, 401, { error: { message: 'token inválido', type: 'invalid_request_error' } });
  if (req.method === 'GET' && /^(\/v1)?\/models$/.test(url)) {
    return sendJson(res, 200, { object: 'list', data: [{ id: 'claude-code', object: 'model', created: 0, owned_by: 'jeff' }] });
  }
  if (req.method === 'POST' && /^(\/v1)?\/chat\/completions$/.test(url)) {
    let size = 0; const parts = [];
    req.on('data', d => { size += d.length; if (size > MAX_BODY) { sendJson(res, 413, { error: { message: 'corpo grande demais' } }); req.destroy(); return; } parts.push(d); });
    req.on('end', () => {
      let body; try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (_) { return sendJson(res, 400, { error: { message: 'JSON inválido' } }); }
      if (!Array.isArray(body.messages) || !body.messages.length) return sendJson(res, 400, { error: { message: 'messages obrigatório' } });
      handleChat(req, res, body).catch(e => { log('falha inesperada', e); sendJson(res, 500, { error: { message: 'erro interno' } }); });
    });
    return;
  }
  sendJson(res, 404, { error: { message: 'rota não encontrada' } });
});
server.requestTimeout = 0; server.headersTimeout = 60000; server.keepAliveTimeout = 65000;
server.listen(PORT, HOST, () => log(`[jeff-claude-shim] up em http://${HOST}:${PORT} modelo=${MODEL} concorrência=${MAX_CONCURRENCY}`));
