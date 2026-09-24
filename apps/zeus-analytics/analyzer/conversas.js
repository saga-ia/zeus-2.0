// Agrupa mensagens em conversas: 24h sem nova msg do mesmo contato/device fecha bloco.
const db = require('../lib/db');
const log = require('../lib/logger');

const WINDOW_HOURS = 24;

const findOrOpenConversa = db.prepare(`
  SELECT id FROM conversas
   WHERE tenant_id=? AND contato_id=? AND device_id=? AND status='aberta'
   ORDER BY inicio DESC LIMIT 1
`);
const openConversa = db.prepare(`
  INSERT INTO conversas (tenant_id, contato_id, device_id, vendedor_id, inicio, total_msgs, status)
  VALUES (?, ?, ?, ?, ?, 1, 'aberta')
`);
const updateConvAddMsg = db.prepare(`
  UPDATE conversas SET total_msgs = total_msgs + 1 WHERE id=?
`);
const fechaConversa = db.prepare(`
  UPDATE conversas SET status='fechada', fim=? WHERE id=?
`);

const novasMensagens = db.prepare(`
  SELECT m.id, m.tenant_id, m.device_id, m.contato_id, m.vendedor_id, m.ts
    FROM mensagens m
   WHERE m.processado=0
   ORDER BY m.id ASC LIMIT 200
`);

const ultimaMsgConversa = db.prepare(`
  SELECT MAX(ts) as ultima FROM mensagens m
   WHERE m.contato_id=? AND m.device_id=? AND m.ts <= ?
     AND m.id <> ?
`);

const marcarProcessado = db.prepare('UPDATE mensagens SET processado=1 WHERE id=?');
const enfileiraTriagem = db.prepare(`
  INSERT INTO analyzer_queue (tipo, ref_id, tenant_id, prioridade)
  VALUES ('triagem_msg', ?, ?, 5)
`);
const enfileiraScorecard = db.prepare(`
  INSERT INTO analyzer_queue (tipo, ref_id, tenant_id, prioridade)
  VALUES ('scorecard_conversa', ?, ?, 3)
`);

const conversasParaFechar = db.prepare(`
  SELECT c.id, c.tenant_id,
         (SELECT MAX(ts) FROM mensagens m WHERE m.contato_id=c.contato_id AND m.device_id=c.device_id) AS ultima
    FROM conversas c
   WHERE c.status='aberta'
`);

function processarBatch() {
  const msgs = novasMensagens.all();
  let processadas = 0;
  const tx = db.transaction(() => {
    for (const m of msgs) {
      // tem conversa aberta?
      let conv = findOrOpenConversa.get(m.tenant_id, m.contato_id, m.device_id);
      if (conv) {
        // checar se ultrapassou janela de 24h desde ultima msg desse contato
        const last = ultimaMsgConversa.get(m.contato_id, m.device_id, m.ts, m.id);
        if (last && last.ultima) {
          const diffMs = new Date(m.ts) - new Date(last.ultima);
          if (diffMs > WINDOW_HOURS * 3600 * 1000) {
            // fecha conversa anterior e abre nova
            fechaConversa.run(last.ultima, conv.id);
            enfileiraScorecard.run(conv.id, m.tenant_id);
            const r = openConversa.run(m.tenant_id, m.contato_id, m.device_id, m.vendedor_id, m.ts);
            conv = { id: r.lastInsertRowid };
          } else {
            updateConvAddMsg.run(conv.id);
          }
        } else {
          updateConvAddMsg.run(conv.id);
        }
      } else {
        const r = openConversa.run(m.tenant_id, m.contato_id, m.device_id, m.vendedor_id, m.ts);
        conv = { id: r.lastInsertRowid };
      }
      marcarProcessado.run(m.id);
      enfileiraTriagem.run(m.id, m.tenant_id);
      processadas++;
    }
  });
  tx();
  return processadas;
}

function fecharInativas() {
  const limiteIso = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  const rows = conversasParaFechar.all();
  let fechadas = 0;
  for (const c of rows) {
    if (!c.ultima) continue;
    if (c.ultima < limiteIso) {
      fechaConversa.run(c.ultima, c.id);
      enfileiraScorecard.run(c.id, c.tenant_id);
      fechadas++;
    }
  }
  if (fechadas) log.info('analyzer', `${fechadas} conversa(s) fechada(s) por inatividade`);
  return fechadas;
}

module.exports = { processarBatch, fecharInativas };
