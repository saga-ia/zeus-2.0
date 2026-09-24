// Triagem rapida por mensagem (Haiku). Retorna sentimento+intencao+sinais.
const db = require('../lib/db');
const log = require('../lib/logger');
const { runClaude, extractJSON } = require('./claude-cli');

const lerMsg = db.prepare(`
  SELECT m.id, m.direction, m.body, m.audio_transcript, m.has_media, m.type,
         c.nome AS contato_nome, c.phone
    FROM mensagens m
    JOIN contatos c ON c.id = m.contato_id
   WHERE m.id=?
`);

const upsertTriagem = db.prepare(`
  INSERT INTO triagem_mensagem (mensagem_id, sentimento, intencao, sinais_json)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(mensagem_id) DO UPDATE SET
    sentimento=excluded.sentimento, intencao=excluded.intencao, sinais_json=excluded.sinais_json,
    analisado_em=datetime('now')
`);

function prompt(msg) {
  const conteudo = msg.body || msg.audio_transcript || `[${msg.type}]`;
  return `Voce e um analista de atendimento. Classifique a mensagem abaixo de forma curta.

Direcao: ${msg.direction === 'in' ? 'CLIENTE -> VENDEDOR' : 'VENDEDOR -> CLIENTE'}
Tipo: ${msg.type}
Conteudo: ${conteudo}

Retorne SOMENTE JSON valido com este formato:
{
  "sentimento": "positivo|neutro|negativo|duvida|objecao",
  "intencao": "saudacao|duvida_produto|preco|fechamento|reclamacao|agendamento|sem_resposta|outro",
  "sinais": {
    "sinal_compra": true|false,
    "urgencia": "baixa|media|alta",
    "objecao": "preco|tempo|confianca|nao_precisa|outro|nenhuma"
  }
}`;
}

async function triarMensagem(msgId) {
  const m = lerMsg.get(msgId);
  if (!m) return { ok: false, error: 'msg not found' };
  if (!m.body && !m.audio_transcript) {
    // sem conteudo textual: classifica trivial
    upsertTriagem.run(msgId, 'neutro', 'sem_resposta', JSON.stringify({ sinal_compra: false, urgencia: 'baixa', objecao: 'nenhuma' }));
    return { ok: true };
  }
  const r = await runClaude({ prompt: prompt(m), model: 'haiku', timeoutMs: 60000 });
  if (!r.ok) return { ok: false, error: r.error };
  const json = extractJSON(r.text);
  if (!json) {
    log.warn('triagem', `JSON invalido msg=${msgId}`, r.text.slice(0, 200));
    return { ok: false, error: 'json_invalido' };
  }
  upsertTriagem.run(
    msgId,
    String(json.sentimento || 'neutro'),
    String(json.intencao || 'outro'),
    JSON.stringify(json.sinais || {})
  );
  return { ok: true };
}

module.exports = { triarMensagem };
