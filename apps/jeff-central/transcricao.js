// Transcreve os áudios dos números que entram nas análises de vendas (cliente e vendedor), do mais recente para o
// mais antigo, e grava em zv.transcricao: a view zv.msg passa a trazer o texto falado, e o Diagnóstico e a
// Auditoria leem o que foi dito em áudio. Baixa o áudio pela Evolution e transcreve com o Whisper (Groq) do chat.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { rows, rowsAsync, pgAsync, lit, sincronizarInstancias } = require('./vendas-dados');
const { transcribeAudio } = require('./chat');

const INTERVALO_MS = 90 * 1000;   // uma rodada a cada 90 s
const POR_RODADA = 12;            // áudios por rodada (o Groq tem limite por minuto)
const MAX_TENTATIVAS = 3;         // áudio antigo pode ter expirado no WhatsApp: desiste depois de 3 falhas
const PAUSA_MS = 2500;
let evo = null, rodando = false, desligado = false;

function pendentes() {
  return rowsAsync(`SELECT m.id, i.name AS instancia, m.key->>'id' AS key_id, COALESCE(m.message->'audioMessage'->>'mimetype', 'audio/ogg') AS mime
    FROM public."Message" m
    JOIN public."Instance" i ON i.id = m."instanceId"
    JOIN zv.instancia z ON z.nome = i.name AND z.ativo
    LEFT JOIN zv.transcricao t ON t.msg_id = m.id
    WHERE m."messageType" IN ('audioMessage', 'pttMessage')
      AND COALESCE(m.message->>'speechToText', '') = ''
      AND (t.msg_id IS NULL OR (t.status = 'erro' AND t.tentativas < ${MAX_TENTATIVAS} AND t.em < now() - interval '10 minutes'))
    ORDER BY m."messageTimestamp" DESC
    LIMIT ${POR_RODADA}`);
}
function gravar(id, status, texto, erro) {
  return pgAsync(`INSERT INTO zv.transcricao (msg_id, texto, status, tentativas, erro, em) VALUES (${lit(id)}, ${lit(texto)}, ${lit(status)}, 1, ${lit(erro)}, now())
    ON CONFLICT (msg_id) DO UPDATE SET texto = excluded.texto, status = excluded.status, erro = excluded.erro, em = now(),
      tentativas = CASE WHEN excluded.status = 'erro' THEN zv.transcricao.tentativas + 1 ELSE zv.transcricao.tentativas END`);
}
async function uma(a) {
  const r = await evo('POST', `/chat/getBase64FromMediaMessage/${encodeURIComponent(a.instancia)}`, { message: { key: { id: a.key_id } }, convertToMp4: false });
  const b64 = r.ok && r.data && (r.data.base64 || (r.data.data && r.data.data.base64));
  if (!b64) throw new Error('áudio indisponível na Evolution' + (r.status ? ' (' + r.status + ')' : ''));
  const ext = /mp4|m4a|aac/.test(a.mime) ? 'm4a' : /mpeg|mp3/.test(a.mime) ? 'mp3' : 'ogg';
  const arq = path.join(os.tmpdir(), `zv-audio-${a.id.replace(/[^\w-]/g, '')}.${ext}`);
  fs.writeFileSync(arq, Buffer.from(b64, 'base64'));
  try { return String(await transcribeAudio(arq) || '').trim(); } finally { fs.rm(arq, { force: true }, () => {}); }
}
async function rodada() {
  if (rodando || desligado) return;
  rodando = true;
  let ok = 0, falha = 0;
  try {
    try { await sincronizarInstancias(); } catch (_) {}
    for (const a of await pendentes()) {
      try { const texto = await uma(a); await gravar(a.id, 'ok', texto || '(áudio sem fala)', null); ok++; }
      catch (e) {
        try { await gravar(a.id, 'erro', null, String(e.message).slice(0, 300)); } catch (_) {} falha++;
        if (/groq_api_key/.test(e.message)) { console.error('[transcricao] sem chave do Groq em Chaves: transcrição pausada'); desligado = true; break; }
        if (/429|rate/i.test(e.message)) break; // limite do Groq: tenta na próxima rodada
      }
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
    if (ok || falha) console.log(`[transcricao] ${ok} áudio(s) transcrito(s)${falha ? `, ${falha} com falha` : ''}`);
  } catch (e) { console.error('[transcricao]', e.message); }
  finally { rodando = false; }
}
function start(evoFn) {
  evo = evoFn;
  setTimeout(rodada, 20000);
  setInterval(rodada, INTERVALO_MS).unref();
}
function status() {
  try { return rows(`SELECT count(*) FILTER (WHERE status = 'ok') AS ok, count(*) FILTER (WHERE status = 'erro') AS erro FROM zv.transcricao`)[0]; } catch (_) { return null; }
}
module.exports = { start, status, _rodada: rodada };
