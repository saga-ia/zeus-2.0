const { db, getConfig, log } = require('./db');
const wa = require('./wa');

function tsFromBRT(dataStr, horaStr) {
  // dataStr YYYY-MM-DD, horaStr HH:MM (BRT)
  if (!dataStr || !horaStr) return null;
  const [y, m, d] = dataStr.split('-').map(Number);
  const [hh, mm] = horaStr.split(':').map(Number);
  // BRT = UTC-3; convert BRT->UTC by adding 3h
  const utc = Date.UTC(y, m - 1, d, hh + 3, mm, 0);
  return Math.floor(utc / 1000);
}

function parseWhen(cad, evento) {
  // returns unix ts when to send, or null if trigger-based (dispatched on event)
  if (cad.quando_tipo === 'datetime') {
    // quando_valor: YYYY-MM-DDTHH:MM (BRT local)
    const [d, h] = cad.quando_valor.split('T');
    return tsFromBRT(d, h);
  }
  if (cad.quando_tipo === 'evento_offset') {
    // valor: minutos offset relativo ao inicio do evento (pode ser negativo)
    const base = tsFromBRT(evento.data, evento.inicio_hora);
    return base + Number(cad.quando_valor) * 60;
  }
  return null;
}

// materialize envios rows for scheduled cadencias when new participant OR new cadencia is created
function materializeSchedulesForParticipante(partId) {
  const part = db.prepare('SELECT * FROM participantes WHERE id=?').get(partId);
  if (!part) return;
  const evento = db.prepare('SELECT * FROM eventos WHERE id=?').get(part.evento_id);
  if (!evento) return;
  const cads = db.prepare(`SELECT * FROM cadencias WHERE evento_id=? AND ativo=1 AND quando_tipo IN ('datetime','evento_offset')`).all(evento.id);
  for (const c of cads) {
    const ts = parseWhen(c, evento);
    if (!ts) continue;
    try {
      db.prepare(`INSERT OR IGNORE INTO envios(cadencia_id, participante_id, status, enviar_em) VALUES(?,?, 'pendente', ?)`).run(c.id, part.id, ts);
    } catch (e) { log('erro', 'scheduler', 'materialize part ' + e.message); }
  }
}

function materializeSchedulesForCadencia(cadId) {
  const c = db.prepare('SELECT * FROM cadencias WHERE id=?').get(cadId);
  if (!c) return;
  if (!['datetime', 'evento_offset'].includes(c.quando_tipo)) return;
  const evento = db.prepare('SELECT * FROM eventos WHERE id=?').get(c.evento_id);
  if (!evento) return;
  const parts = db.prepare('SELECT * FROM participantes WHERE evento_id=? AND confirmado=1').all(evento.id);
  const ts = parseWhen(c, evento);
  if (!ts) return;
  for (const p of parts) {
    try {
      db.prepare(`INSERT OR IGNORE INTO envios(cadencia_id, participante_id, status, enviar_em) VALUES(?,?, 'pendente', ?)`).run(c.id, p.id, ts);
    } catch {}
  }
}

// Trigger cadencias fire when a specific event happens
async function fireTrigger(triggerName, participanteId) {
  const part = db.prepare('SELECT * FROM participantes WHERE id=?').get(participanteId);
  if (!part) return;
  const cads = db.prepare(`SELECT * FROM cadencias WHERE evento_id=? AND ativo=1 AND quando_tipo='trigger' AND quando_valor=?`).all(part.evento_id, triggerName);
  for (const c of cads) {
    try {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`INSERT OR IGNORE INTO envios(cadencia_id, participante_id, status, enviar_em) VALUES(?,?, 'pendente', ?)`).run(c.id, part.id, now);
    } catch {}
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const ligado = getConfig('sistema_ligado', '1') === '1';
    if (!ligado) { running = false; return; }
    const now = Math.floor(Date.now() / 1000);
    const rows = db.prepare(`
      SELECT e.id AS eid, e.cadencia_id, e.participante_id, e.enviar_em,
             c.mensagem, c.media_path, c.media_tipo, c.fase, c.nome AS cad_nome, c.quando_tipo, c.quando_valor,
             p.telefone, p.nome AS pnome, p.token AS ptoken,
             ev.ativo AS evento_ativo, ev.nome AS evento_nome
      FROM envios e
      JOIN cadencias c ON c.id = e.cadencia_id
      JOIN participantes p ON p.id = e.participante_id
      JOIN eventos ev ON ev.id = p.evento_id
      WHERE e.status='pendente' AND e.enviar_em <= ?
      ORDER BY e.enviar_em ASC LIMIT 30
    `).all(now);
    for (const r of rows) {
      if (!r.evento_ativo) {
        db.prepare(`UPDATE envios SET status='cancelado', erro='evento inativo' WHERE id=?`).run(r.eid);
        continue;
      }
      // template variables
      const baseUrl = getConfig('base_url', 'http://127.0.0.1:3020');
      const checkinLink = `${baseUrl}/checkin/${r.ptoken}`;
      const msg = (r.mensagem || '')
        .replaceAll('{{nome}}', r.pnome || '')
        .replaceAll('{{evento}}', r.evento_nome || '')
        .replaceAll('{{link_checkin}}', checkinLink);
      try {
        const mime = mimeFromPath(r.media_path);
        await wa.send(r.telefone, msg, r.media_path || null, mime);
        db.prepare(`UPDATE envios SET status='enviado', enviado_em=strftime('%s','now') WHERE id=?`).run(r.eid);
        log('info', 'scheduler', `enviado envio ${r.eid} pra ${r.telefone} (cad ${r.cad_nome})`);
      } catch (err) {
        db.prepare(`UPDATE envios SET status='erro', erro=? WHERE id=?`).run(err.message || String(err), r.eid);
        log('erro', 'scheduler', `falha envio ${r.eid}: ${err.message}`);
      }
    }
  } catch (e) {
    log('erro', 'scheduler', 'tick: ' + e.message);
  } finally {
    running = false;
  }
}

function mimeFromPath(p) {
  if (!p) return null;
  const ext = String(p).toLowerCase().split('.').pop();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav', opus: 'audio/ogg'
  };
  return map[ext] || 'application/octet-stream';
}

function start() {
  setInterval(tick, 15000);
  log('info', 'scheduler', 'iniciado (tick 15s)');
}

module.exports = { start, tick, materializeSchedulesForParticipante, materializeSchedulesForCadencia, fireTrigger, mimeFromPath, tsFromBRT };
