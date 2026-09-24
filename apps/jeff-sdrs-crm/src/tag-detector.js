const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-haiku-4-5-20251001';
const DETECTION_TIMEOUT = 2000;

function fetchGlobalTags(db) {
  return db.prepare("SELECT id, name, category, instruction FROM global_tags WHERE is_system = 0 ORDER BY category").all();
}

function buildTagPrompt(messageText, tags) {
  const tagList = tags.map(t => {
    const instr = (t.instruction || '').trim();
    return `- ${t.name} (${t.category}): ${instr || 'marcar quando o texto refletir esta categoria'}`;
  }).join('\n');

  return `Você é um detector de tags para CRM de vendas.
Analise a mensagem abaixo e decida quais tags se aplicam usando ESTRITAMENTE a instrução de cada uma. Não invente critério.

Tags disponíveis:
${tagList}

Mensagem: "${messageText}"

Responda APENAS em JSON (sem markdown, sem explicações):
{
  "tags": ["tag1", "tag2"],
  "confidence": 0.95
}

Se nenhuma tag se aplica, retorne {"tags": [], "confidence": 0}`;
}

async function detectTags(messageText, db, timeout = DETECTION_TIMEOUT) {
  if (!messageText || messageText.trim().length === 0) {
    return { tags: [], confidence: 0 };
  }

  const tags = fetchGlobalTags(db);
  if (tags.length === 0) {
    return { tags: [], confidence: 0 };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[tag-detector] ANTHROPIC_API_KEY não configurada, usando detecção mockada');
    return detectTagsLocal(messageText, tags);
  }

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeout);

    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: buildTagPrompt(messageText, tags),
          },
        ],
      },
      { signal: abortController.signal }
    );

    clearTimeout(timeoutId);

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = JSON.parse(text);

    return {
      tags: parsed.tags || [],
      confidence: parsed.confidence || 0,
    };
  } catch (e) {
    console.error('[tag-detector] IA error:', e.message);
    return detectTagsLocal(messageText, tags);
  }
}

function detectTagsLocal(messageText, tags) {
  const lower = messageText.toLowerCase();
  const detected = [];

  if (lower.includes('preço') || lower.includes('valor') || lower.includes('caro')) {
    const tag = tags.find(t => t.name === 'objeção_preço');
    if (tag) detected.push('objeção_preço');
  }

  if (lower.includes('excelente') || lower.includes('adorei') || lower.includes('perfeito')) {
    const tag = tags.find(t => t.name === 'lead_quente');
    if (tag) detected.push('lead_quente');
  }

  if (lower.includes('concorrente') || lower.includes('competitor') || lower.includes('outro')) {
    const tag = tags.find(t => t.name === 'comparando_concorrente');
    if (tag) detected.push('comparando_concorrente');
  }

  return {
    tags: detected,
    confidence: detected.length > 0 ? 0.7 : 0,
  };
}

module.exports = { detectTags, fetchGlobalTags };
