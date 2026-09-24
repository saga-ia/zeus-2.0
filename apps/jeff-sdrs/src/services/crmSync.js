// Cliente HTTP pra empurrar eventos do disparo/fluxo pro jeff-sdrs-crm.
// URL interna (localhost) + token compartilhado (WORKER_TOKEN, mesmo do worker).
const fs = require('fs');
const path = require('path');

const CRM_INTERNAL_URL = process.env.CRM_INTERNAL_URL || 'http://127.0.0.1:3051';

function readWorkerToken() {
  if (process.env.WORKER_TOKEN) return process.env.WORKER_TOKEN;
  try {
    const env = fs.readFileSync(path.resolve(__dirname, '../../../../jeff-worker/.env'), 'utf8');
    const m = env.match(/^API_TOKEN=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const TOKEN = readWorkerToken();

async function post(url, body) {
  if (!TOKEN) return { ok: false, error: 'no_token' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok !== false, ...j };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Registra/atualiza lead no Kanban como "disparado" (cadastro na fila OU após envio).
function markSent(phone, name, slot) {
  return post(`${CRM_INTERNAL_URL}/api/internal/leads/mark-sent`, { phone, name, slot });
}

// Marca 2-check (delivered) → move pra "conversa_iniciada".
function markDelivered(phone) {
  return post(`${CRM_INTERNAL_URL}/api/internal/leads/mark-delivered`, { phone });
}

// Marca resposta do lead → move pra "novo_lead" + roda detectTags.
function markReplied(phone, messageText, waMessageId) {
  return post(`${CRM_INTERNAL_URL}/api/internal/leads/mark-replied`, {
    phone, message_text: messageText, wa_message_id: waMessageId,
  });
}

module.exports = { markSent, markDelivered, markReplied };
