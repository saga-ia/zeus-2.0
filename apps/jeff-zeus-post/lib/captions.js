const axios = require('axios');
const { getSetting } = require('./settings');

function generateFixed(config) {
  return String(config.text || '');
}

function splitStanzas(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n{2,}|\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

function generateShuffled(config) {
  const stanzas = splitStanzas(config.text);
  if (!stanzas.length) return '';
  const n = Math.max(1, Math.min(parseInt(config.stanzas_per_post, 10) || 1, stanzas.length));
  const pool = stanzas.slice();
  const picked = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.join('\n\n');
}

async function generateAI(config) {
  const provider = config.provider;
  const prompt = config.prompt || 'Escreva uma legenda curta e envolvente para Instagram.';
  const key = getSetting(`ai_${provider}_key`);
  if (!key) throw new Error(`API Key do provedor "${provider}" não configurada`);

  if (provider === 'claude') return callClaude(key, prompt);
  if (provider === 'openai') return callOpenAI(key, prompt);
  if (provider === 'gemini') return callGemini(key, prompt);
  throw new Error(`Provedor desconhecido: ${provider}`);
}

async function callClaude(apiKey, prompt) {
  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });
  return res.data.content?.[0]?.text?.trim() || '';
}

async function callOpenAI(apiKey, prompt) {
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  });
  return res.data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(apiKey, prompt) {
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function generateCaption(mode, config) {
  if (mode === 'fixed') return generateFixed(config);
  if (mode === 'shuffle') return generateShuffled(config);
  if (mode === 'ai') return generateAI(config);
  throw new Error(`Modo de legenda inválido: ${mode}`);
}

module.exports = { generateCaption, generateFixed, generateShuffled, generateAI, splitStanzas };
