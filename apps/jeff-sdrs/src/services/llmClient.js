'use strict';
// Cliente unificado LLM. Suporta anthropic, openai, gemini.
// generateReply({ provider, model, apiKey, systemPrompt, messages, maxTokens, temperature })
// messages: [{ role: 'user'|'assistant', content: string }]
// Retorna { text, tokensIn, tokensOut, latencyMs }

const { db } = require('../db');

const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_TEMP = 0.3;
const DEFAULT_MAX_TOKENS = 800;

async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: opts.signal || ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Guard defensivo. Anthropic/OpenAI exigem que o array de messages termine com role=user.
// Alem disso, Anthropic 400 se array vier vazio. Este sanitize eh o UNICO ponto de verdade:
// qualquer caminho que chamar generateReply passa por aqui, entao nao tem como escapar.
function sanitizeMessagesEndsInUser(messages) {
  const arr = Array.isArray(messages) ? messages.slice() : [];
  // drop trailing assistants
  while (arr.length && arr[arr.length - 1].role === 'assistant') arr.pop();
  // drop msgs sem content
  return arr.filter(m => m && m.role && m.content && String(m.content).trim());
}

// ---------- Anthropic ----------
async function callAnthropic({ model, apiKey, systemPrompt, messages, maxTokens, temperature, signal }) {
  const safe = sanitizeMessagesEndsInUser(messages);
  if (!safe.length) {
    const err = new Error('anthropic_skip: sem mensagens de usuario apos sanitize (historico so tem assistant ou vazio)');
    err.status = 0;
    throw err;
  }
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: safe.map(m => ({ role: m.role, content: m.content })),
  };
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`anthropic_${res.status}: ${(data && data.error && data.error.message) || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const reply = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
  const usage = data.usage || {};
  return { text: reply, tokensIn: usage.input_tokens || 0, tokensOut: usage.output_tokens || 0 };
}

// ---------- OpenAI ----------
async function callOpenAI({ model, apiKey, systemPrompt, messages, maxTokens, temperature, signal }) {
  const safe = sanitizeMessagesEndsInUser(messages);
  if (!safe.length) {
    const err = new Error('openai_skip: sem mensagens de usuario apos sanitize');
    err.status = 0;
    throw err;
  }
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      ...safe.map(m => ({ role: m.role, content: m.content })),
    ],
  };
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`openai_${res.status}: ${(data && data.error && data.error.message) || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
  const usage = data.usage || {};
  return { text: reply, tokensIn: usage.prompt_tokens || 0, tokensOut: usage.completion_tokens || 0 };
}

// ---------- Gemini ----------
async function callGemini({ model, apiKey, systemPrompt, messages, maxTokens, temperature, signal }) {
  // Gemini nao aceita 'assistant', usa 'model'. E system vira systemInstruction.
  const safe = sanitizeMessagesEndsInUser(messages);
  if (!safe.length) {
    const err = new Error('gemini_skip: sem mensagens de usuario apos sanitize');
    err.status = 0;
    throw err;
  }
  const contents = safe.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`gemini_${res.status}: ${(data && data.error && data.error.message) || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const cand = (data.candidates && data.candidates[0]) || null;
  const reply = cand && cand.content && cand.content.parts
    ? cand.content.parts.map(p => p.text || '').join('').trim()
    : '';
  const meta = data.usageMetadata || {};
  return { text: reply, tokensIn: meta.promptTokenCount || 0, tokensOut: meta.candidatesTokenCount || 0 };
}

function pickProvider(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'anthropic') return callAnthropic;
  if (p === 'openai') return callOpenAI;
  if (p === 'gemini' || p === 'google') return callGemini;
  throw new Error(`provider_desconhecido: ${provider}`);
}

async function generateReply({
  provider, model, apiKey, systemPrompt, messages,
  maxTokens = DEFAULT_MAX_TOKENS, temperature = DEFAULT_TEMP,
  slot = null, chatId = null, keyId = null, signal = null,
}) {
  const call = pickProvider(provider);
  const started = Date.now();
  let attempt = 0;
  let lastErr;
  while (attempt < 2) {
    try {
      const r = await call({ model, apiKey, systemPrompt, messages, maxTokens, temperature, signal });
      const latencyMs = Date.now() - started;
      logInteraction({ slot, chatId, provider, model, keyId, status: 'ok', tokensIn: r.tokensIn, tokensOut: r.tokensOut, latencyMs, replyPreview: (r.text || '').slice(0, 200) });
      return { text: r.text, tokensIn: r.tokensIn, tokensOut: r.tokensOut, latencyMs };
    } catch (e) {
      lastErr = e;
      const status = e && e.status;
      // Retry so em 5xx e uma vez.
      if (status && status >= 500 && attempt === 0) {
        attempt++;
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      break;
    }
  }
  const latencyMs = Date.now() - started;
  logInteraction({ slot, chatId, provider, model, keyId, status: 'error', tokensIn: 0, tokensOut: 0, latencyMs, error: String((lastErr && lastErr.message) || lastErr).slice(0, 500) });
  throw lastErr;
}

function logInteraction({ slot, chatId, provider, model, keyId, status, tokensIn, tokensOut, latencyMs, error = null, replyPreview = null }) {
  try {
    db.prepare(`INSERT INTO ai_interactions
      (slot, chat_id, provider, model, key_id, status, tokens_in, tokens_out, latency_ms, error, reply_preview)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(slot, chatId || '', provider || null, model || null, keyId || null, status, tokensIn || 0, tokensOut || 0, latencyMs || 0, error, replyPreview);
  } catch (e) {
    console.error('[llmClient] log fail:', e.message);
  }
}

// Modelos default por provider (usado pela UI se dropdown vier vazio)
const MODELS = {
  anthropic: { default: 'claude-sonnet-4-6', options: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'] },
  openai:    { default: 'gpt-4o-mini',      options: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] },
  gemini:    { default: 'gemini-2.0-flash-exp', options: ['gemini-2.0-flash-exp', 'gemini-1.5-pro'] },
};

module.exports = { generateReply, MODELS };
