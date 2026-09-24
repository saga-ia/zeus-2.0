// Scorecard de conversa (Sonnet). Gera nota, resumo, fortes, falhas, sugestoes.
const db = require('../lib/db');
const log = require('../lib/logger');
const { runClaude, extractJSON } = require('./claude-cli');

const lerConversa = db.prepare(`
  SELECT c.*, ct.phone, ct.nome AS contato_nome, v.nome AS vendedor_nome,
         d.apelido AS device_apelido,
         (SELECT manual_atendimento_txt FROM configuracoes_avaliacao WHERE tenant_id=c.tenant_id) AS manual
    FROM conversas c
    JOIN contatos ct ON ct.id = c.contato_id
    JOIN devices d ON d.id = c.device_id
    LEFT JOIN vendedores v ON v.id = c.vendedor_id
   WHERE c.id=?
`);

const lerMensagens = db.prepare(`
  SELECT direction, type, body, audio_transcript, ts
    FROM mensagens
   WHERE contato_id=? AND device_id=?
     AND ts BETWEEN ? AND COALESCE(?, datetime('now'))
   ORDER BY ts ASC
`);

const upsertScore = db.prepare(`
  INSERT INTO scorecard_conversa
    (conversa_id, nota, resumo, pontos_fortes_json, falhas_json, sugestoes_json,
     tempo_resp_medio_seg, desfecho_predito)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(conversa_id) DO UPDATE SET
    nota=excluded.nota, resumo=excluded.resumo,
    pontos_fortes_json=excluded.pontos_fortes_json,
    falhas_json=excluded.falhas_json,
    sugestoes_json=excluded.sugestoes_json,
    tempo_resp_medio_seg=excluded.tempo_resp_medio_seg,
    desfecho_predito=excluded.desfecho_predito,
    analisado_em=datetime('now')
`);

const setDesfechoConversa = db.prepare(`
  UPDATE conversas SET desfecho=? WHERE id=?
`);

function tempoRespMedio(msgs) {
  let total = 0, count = 0;
  for (let i = 1; i < msgs.length; i++) {
    if (msgs[i-1].direction === 'in' && msgs[i].direction === 'out') {
      const diff = (new Date(msgs[i].ts) - new Date(msgs[i-1].ts)) / 1000;
      if (diff > 0 && diff < 24 * 3600) { total += diff; count++; }
    }
  }
  return count ? Math.round(total / count) : null;
}

function formatTranscript(msgs) {
  return msgs.map(m => {
    const who = m.direction === 'in' ? 'CLIENTE' : 'VENDEDOR';
    const t = m.body || m.audio_transcript || `[${m.type}]`;
    return `[${m.ts.slice(11,16)}] ${who}: ${t}`;
  }).join('\n');
}

function prompt(conv, msgs) {
  const manual = (conv.manual && conv.manual.trim())
    ? `Manual de atendimento do cliente:\n${conv.manual}\n\n`
    : 'O cliente ainda nao definiu manual de atendimento. Use boas praticas universais de venda consultiva.\n\n';

  return `Voce e um avaliador senior de atendimento comercial. Analise a conversa entre vendedor e cliente.

${manual}Conversa (${msgs.length} mensagens):
${formatTranscript(msgs)}

Avalie e retorne SOMENTE JSON valido:
{
  "nota": <numero 0 a 10>,
  "resumo": "<2-3 frases descrevendo a conversa>",
  "pontos_fortes": ["..."],
  "falhas": ["..."],
  "sugestoes": ["acao especifica para esse vendedor melhorar"],
  "desfecho_predito": "venda|sem_resposta|abandono_cliente|abandono_vendedor|reclamacao|indefinido"
}

Criterios: rapidez de resposta, clareza, empatia, descoberta de necessidade, manejo de objecoes, fechamento, follow-up.`;
}

async function gerarScorecard(conversaId) {
  const conv = lerConversa.get(conversaId);
  if (!conv) return { ok: false, error: 'conversa not found' };
  const msgs = lerMensagens.all(conv.contato_id, conv.device_id, conv.inicio, conv.fim);
  if (msgs.length < 2) {
    upsertScore.run(conversaId, 0, 'Conversa muito curta para avaliar.', '[]', '[]', '[]', null, 'indefinido');
    return { ok: true };
  }

  const r = await runClaude({ prompt: prompt(conv, msgs), model: 'sonnet', timeoutMs: 180000 });
  if (!r.ok) return { ok: false, error: r.error };
  const json = extractJSON(r.text);
  if (!json) {
    log.warn('scorecard', `JSON invalido conv=${conversaId}`, r.text.slice(0, 200));
    return { ok: false, error: 'json_invalido' };
  }

  const tempo = tempoRespMedio(msgs);
  upsertScore.run(
    conversaId,
    Number(json.nota) || 0,
    String(json.resumo || ''),
    JSON.stringify(json.pontos_fortes || []),
    JSON.stringify(json.falhas || []),
    JSON.stringify(json.sugestoes || []),
    tempo,
    String(json.desfecho_predito || 'indefinido')
  );
  setDesfechoConversa.run(String(json.desfecho_predito || 'indefinido'), conversaId);

  // Se nota baixa ou reclamacao -> cria alerta
  if (Number(json.nota) < 5 || json.desfecho_predito === 'reclamacao') {
    db.prepare(`
      INSERT INTO alertas (tenant_id, tipo, severidade, titulo, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      conv.tenant_id,
      json.desfecho_predito === 'reclamacao' ? 'reclamacao' : 'nota_baixa',
      json.desfecho_predito === 'reclamacao' ? 'critico' : 'warn',
      `Conversa nota ${Number(json.nota).toFixed(1)} com ${conv.contato_nome || conv.phone} (${conv.vendedor_nome || conv.device_apelido})`,
      JSON.stringify({ conversa_id: conversaId, nota: json.nota, resumo: json.resumo })
    );
  }

  return { ok: true };
}

module.exports = { gerarScorecard };
