// Grava no histórico do Direct o que o webhook entrega e o resto do myIG ignorava:
//   - ecos (is_echo): mensagens que a própria conta mandou pelo app do Instagram (ou por outra ferramenta, como o
//     ManyChat). Entram como saída, sent_by 'instagram'. Eco de mensagem que o myIG mandou pela API (agente, fluxo,
//     operador) é reconhecido pelo mid (= ig_message_id gravado no envio) e não duplica.
//   - mensagens sem texto que a pessoa mandou: áudio, foto, vídeo, reel/post compartilhado, menção em story.
// Horário = timestamp da Meta (não a hora do processamento). Recibos de leitura, reações e cliques não são mensagem.
// Roda no dispatcher antes dos fluxos e dos agentes; backfill({ desde: 0 }) reprocessa o histórico (idempotente pelo mid).
const { db } = require('./db');

const ROTULO = {
  audio: '🎤 Áudio', image: '📷 Imagem', video: '🎬 Vídeo', file: '📎 Arquivo', ig_reel: '↪ Compartilhou um reel', reel: '↪ Compartilhou um reel',
  ig_post: '↪ Compartilhou um post', share: '↪ Compartilhou um link', story_mention: '📣 Mencionou a conta nos stories', ig_story: '↪ Compartilhou um story',
  ephemeral: '⏱ Mídia temporária', unsupported_type: '(conteúdo que a API do Instagram não mostra)', like_heart: '❤️',
};
const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const sqlData = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

let workerDb = null, _cursor = null;
function init(wdb) { workerDb = wdb; }

// Texto e mídia de uma mensagem do webhook
function conteudo(msg) {
  const anexos = Array.isArray(msg.attachments) ? msg.attachments : [];
  let texto = msg.text ? String(msg.text) : '';
  let media = null;
  for (const a of anexos) {
    const p = a.payload || {};
    if (!media && p.url) media = p.url;
    if (a.type === 'template') {
      const el = p.generic && p.generic.elements && p.generic.elements[0];
      const t = (el && (el.title || el.subtitle)) || (p.text) || 'Mensagem com botões';
      const bts = el && Array.isArray(el.buttons) ? el.buttons.map(b => b.title).filter(Boolean) : [];
      if (!texto) texto = t + (bts.length ? '\n[' + bts.join(' | ') + ']' : '');
      continue;
    }
    if (!texto) texto = ROTULO[a.type] || ('[' + (a.type || 'anexo') + ']');
    if (p.title && !msg.text) texto += ': ' + String(p.title).slice(0, 200);
  }
  if (!texto && msg.reply_to && msg.reply_to.story) texto = '↪ Respondeu um story';
  return { texto: texto.slice(0, 4000), media };
}

// Processa um evento. Devolve 'eco' | 'midia' | null (não é algo a gravar). marcar: atualiza processed_at no worker.db
function gravar(ev, deps, marcar) {
  const raw = json(ev.raw_json, {});
  const msg = raw.message;
  if (!msg || !msg.mid || msg.is_deleted) return null;
  const eco = !!msg.is_echo;
  if (!eco && (msg.text || raw.postback || (msg.quick_reply && msg.quick_reply.payload))) return null; // texto normal: fluxos/agentes cuidam
  const tenant = deps.getTenantForIgUserId(ev.ig_user_id || (eco ? raw.sender && raw.sender.id : raw.recipient && raw.recipient.id));
  if (!tenant) return null;
  const pessoa = eco ? raw.recipient && raw.recipient.id : raw.sender && raw.sender.id;
  if (!pessoa || pessoa === tenant.ig_user_id) return null;
  const { texto, media } = conteudo(msg);
  if (!texto && !media) return null;
  const ja = db.prepare('SELECT id FROM messages WHERE ig_message_id = ?').get(msg.mid);
  const marcarComo = r => { if (marcar) workerDb.prepare(`UPDATE ig_webhook_events SET processed_at=datetime('now'), response_text=? WHERE id=? AND processed_at IS NULL`).run(r, ev.id); };
  if (ja) { marcarComo('eco de envio da Central (já no histórico)'); return null; }
  const contactId = deps.upsertContact(tenant.id, pessoa);
  deps.upsertThread(tenant.id, contactId);
  const quando = sqlData(raw.timestamp || Date.now());
  db.prepare(`INSERT INTO messages(tenant_id, contact_id, direction, text, media_url, ig_message_id, raw_json, sent_by, created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(tenant.id, contactId, eco ? 'out' : 'in', texto || null, media, msg.mid, ev.raw_json.slice(0, 8000), eco ? 'instagram' : 'user', quando);
  // a conversa sobe na lista só se esta mensagem for a mais recente dela
  db.prepare(`UPDATE ig_threads SET last_message_at=?, last_direction=?${eco ? ', unread_count=0' : ', unread_count=unread_count+1'}
    WHERE tenant_id=? AND contact_id=? AND (last_message_at IS NULL OR last_message_at <= ?)`).run(quando, eco ? 'out' : 'in', tenant.id, contactId, quando);
  marcarComo(eco ? 'eco gravado no histórico' : 'mídia gravada no histórico');
  return eco ? 'eco' : 'midia';
}

// Volta do dispatcher: eventos novos (cursor só avança; ao subir, olha os últimos 10 min)
function tick(deps) {
  if (_cursor == null) _cursor = (workerDb.prepare(`SELECT MAX(id) m FROM ig_webhook_events WHERE received_at < ?`).get(sqlData(Date.now() - 600000)) || {}).m || 0;
  const evs = workerDb.prepare(`SELECT id, ig_user_id, sender_id, raw_json FROM ig_webhook_events
    WHERE id > ? AND event_type='message' ORDER BY id ASC LIMIT 200`).all(_cursor);
  let n = 0;
  for (const ev of evs) { _cursor = ev.id; try { if (gravar(ev, deps, true)) n++; } catch (e) { console.error('[ecos] evento', ev.id, e.message); } }
  return n;
}

// Reprocessa o histórico inteiro (não mexe em processed_at de eventos já resolvidos)
function backfill(deps) {
  const evs = workerDb.prepare(`SELECT id, ig_user_id, sender_id, raw_json FROM ig_webhook_events WHERE event_type='message' ORDER BY id ASC`).all();
  const out = { lidos: evs.length, eco: 0, midia: 0, erros: 0 };
  const tx = db.transaction(() => { for (const ev of evs) { try { const r = gravar(ev, deps, true); if (r) out[r]++; } catch (e) { out.erros++; } } });
  tx();
  // Conversa nova criada aqui nasce com a hora de agora: a data da conversa passa a ser a da mensagem mais recente
  out.conversas = db.prepare(`UPDATE ig_threads SET
      last_message_at = (SELECT MAX(m.created_at) FROM messages m WHERE m.contact_id = ig_threads.contact_id),
      last_direction = (SELECT m.direction FROM messages m WHERE m.contact_id = ig_threads.contact_id ORDER BY m.created_at DESC, m.id DESC LIMIT 1)
    WHERE EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = ig_threads.contact_id)`).run().changes;
  return out;
}

module.exports = { init, tick, backfill, conteudo, gravar };
