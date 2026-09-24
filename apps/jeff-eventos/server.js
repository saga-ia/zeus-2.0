const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const qrcode = require('qrcode');

const { db, getConfig, setConfig, log } = require('./src/db');
const wa = require('./src/wa');
const sched = require('./src/scheduler');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const UPLOADS = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const upload = multer({ dest: UPLOADS, limits: { fileSize: 100 * 1024 * 1024 } });

// ---------- helpers ----------
function newToken() { return crypto.randomBytes(9).toString('base64url'); }
function ok(res, data) { res.json({ ok: true, ...data }); }
function err(res, code, msg) { res.status(code).json({ ok: false, error: msg }); }

// ---------- EVENTOS ----------
app.get('/api/eventos', (req, res) => {
  const rows = db.prepare('SELECT * FROM eventos ORDER BY data DESC, id DESC').all();
  for (const r of rows) {
    r.total_participantes = db.prepare('SELECT COUNT(*) c FROM participantes WHERE evento_id=?').get(r.id).c;
    r.checkin_ok = db.prepare(`SELECT COUNT(*) c FROM participantes WHERE evento_id=? AND checkin_status='ok'`).get(r.id).c;
  }
  ok(res, { eventos: rows });
});

app.get('/api/eventos/:id', (req, res) => {
  const e = db.prepare('SELECT * FROM eventos WHERE id=?').get(req.params.id);
  if (!e) return err(res, 404, 'evento nao encontrado');
  e.cadencias = db.prepare('SELECT * FROM cadencias WHERE evento_id=? ORDER BY fase, ordem, id').all(e.id);
  e.participantes = db.prepare('SELECT * FROM participantes WHERE evento_id=? ORDER BY criado_em DESC').all(e.id);
  e.envios = db.prepare(`
    SELECT en.*, c.nome AS cadencia_nome, p.nome AS participante_nome, p.telefone
    FROM envios en
    JOIN cadencias c ON c.id=en.cadencia_id
    JOIN participantes p ON p.id=en.participante_id
    WHERE p.evento_id=? ORDER BY en.enviar_em DESC LIMIT 500
  `).all(e.id);
  ok(res, { evento: e });
});

app.post('/api/eventos', (req, res) => {
  const b = req.body || {};
  if (!b.nome || !b.data || !b.checkin_hora || !b.inicio_hora || !b.final_hora) return err(res, 400, 'campos obrigatorios: nome, data, checkin_hora, inicio_hora, final_hora');
  const info = db.prepare(`INSERT INTO eventos(nome,descricao,local,data,checkin_hora,inicio_hora,almoco_hora,intervalo_hora,final_hora,ativo)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(b.nome, b.descricao || '', b.local || '', b.data, b.checkin_hora, b.inicio_hora, b.almoco_hora || '', b.intervalo_hora || '', b.final_hora, b.ativo == null ? 1 : (b.ativo ? 1 : 0));
  ok(res, { id: info.lastInsertRowid });
});

app.put('/api/eventos/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM eventos WHERE id=?').get(req.params.id);
  if (!cur) return err(res, 404, 'nao encontrado');
  const m = { ...cur, ...b };
  db.prepare(`UPDATE eventos SET nome=?, descricao=?, local=?, data=?, checkin_hora=?, inicio_hora=?, almoco_hora=?, intervalo_hora=?, final_hora=?, ativo=? WHERE id=?`)
    .run(m.nome, m.descricao || '', m.local || '', m.data, m.checkin_hora, m.inicio_hora, m.almoco_hora || '', m.intervalo_hora || '', m.final_hora, m.ativo ? 1 : 0, req.params.id);
  ok(res);
});

app.delete('/api/eventos/:id', (req, res) => {
  db.prepare('DELETE FROM eventos WHERE id=?').run(req.params.id);
  ok(res);
});

// ---------- CADENCIAS ----------
app.post('/api/eventos/:id/cadencias', upload.single('media'), (req, res) => {
  const b = req.body || {};
  const eventoId = Number(req.params.id);
  const evento = db.prepare('SELECT * FROM eventos WHERE id=?').get(eventoId);
  if (!evento) return err(res, 404, 'evento nao encontrado');
  if (!b.fase || !b.quando_tipo || !b.quando_valor || !b.nome) return err(res, 400, 'campos: nome, fase, quando_tipo, quando_valor');
  let mediaPath = '', mediaTipo = 'text';
  if (req.file) {
    const finalPath = path.join(UPLOADS, req.file.filename + path.extname(req.file.originalname || ''));
    fs.renameSync(req.file.path, finalPath);
    mediaPath = finalPath;
    const mt = (req.file.mimetype || '').split('/')[0];
    mediaTipo = ['image', 'audio', 'video'].includes(mt) ? mt : 'text';
  }
  const info = db.prepare(`INSERT INTO cadencias(evento_id,fase,nome,mensagem,media_path,media_tipo,quando_tipo,quando_valor,ordem,ativo)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(eventoId, b.fase, b.nome, b.mensagem || '', mediaPath, mediaTipo, b.quando_tipo, b.quando_valor, Number(b.ordem || 0), b.ativo == null ? 1 : (b.ativo ? 1 : 0));
  sched.materializeSchedulesForCadencia(info.lastInsertRowid);
  ok(res, { id: info.lastInsertRowid });
});

app.put('/api/cadencias/:id', upload.single('media'), (req, res) => {
  const cur = db.prepare('SELECT * FROM cadencias WHERE id=?').get(req.params.id);
  if (!cur) return err(res, 404, 'nao encontrado');
  const b = req.body || {};
  let mediaPath = cur.media_path, mediaTipo = cur.media_tipo;
  if (req.file) {
    const finalPath = path.join(UPLOADS, req.file.filename + path.extname(req.file.originalname || ''));
    fs.renameSync(req.file.path, finalPath);
    mediaPath = finalPath;
    const mt = (req.file.mimetype || '').split('/')[0];
    mediaTipo = ['image', 'audio', 'video'].includes(mt) ? mt : 'text';
  }
  if (b.remove_media === '1') { mediaPath = ''; mediaTipo = 'text'; }
  const m = { ...cur, ...b };
  db.prepare(`UPDATE cadencias SET nome=?, fase=?, mensagem=?, media_path=?, media_tipo=?, quando_tipo=?, quando_valor=?, ordem=?, ativo=? WHERE id=?`)
    .run(m.nome, m.fase, m.mensagem || '', mediaPath, mediaTipo, m.quando_tipo, m.quando_valor, Number(m.ordem || 0), (m.ativo == 1 || m.ativo === '1' || m.ativo === true) ? 1 : 0, req.params.id);
  // reset pendentes desta cadencia e re-materializa
  db.prepare(`DELETE FROM envios WHERE cadencia_id=? AND status='pendente'`).run(req.params.id);
  sched.materializeSchedulesForCadencia(Number(req.params.id));
  ok(res);
});

app.delete('/api/cadencias/:id', (req, res) => {
  db.prepare('DELETE FROM cadencias WHERE id=?').run(req.params.id);
  ok(res);
});

// ---------- PARTICIPANTES ----------
app.post('/api/eventos/:id/participantes', (req, res) => {
  const b = req.body || {};
  if (!b.nome || !b.telefone) return err(res, 400, 'nome + telefone obrigatorios');
  const phone = wa.normalizePhone(b.telefone);
  try {
    const info = db.prepare(`INSERT INTO participantes(evento_id,nome,telefone,email,confirmado,token,origem)
      VALUES(?,?,?,?,?,?,?)`).run(req.params.id, b.nome, phone, b.email || '', b.confirmado == null ? 1 : (b.confirmado ? 1 : 0), newToken(), b.origem || 'manual');
    sched.materializeSchedulesForParticipante(info.lastInsertRowid);
    ok(res, { id: info.lastInsertRowid });
  } catch (e) {
    err(res, 400, e.message);
  }
});

app.delete('/api/participantes/:id', (req, res) => {
  db.prepare('DELETE FROM participantes WHERE id=?').run(req.params.id);
  ok(res);
});

// Upload planilha CSV (colunas: nome,telefone,email opcional)
app.post('/api/eventos/:id/participantes/upload', upload.single('arquivo'), (req, res) => {
  if (!req.file) return err(res, 400, 'arquivo faltando');
  const evId = Number(req.params.id);
  const raw = fs.readFileSync(req.file.path, 'utf8');
  fs.unlinkSync(req.file.path);
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return err(res, 400, 'planilha vazia');
  const header = lines.shift().toLowerCase().split(/[;,\t]/).map(s => s.trim());
  const idxNome = header.findIndex(h => /nome|name/.test(h));
  const idxTel = header.findIndex(h => /tel|phone|whats/.test(h));
  const idxMail = header.findIndex(h => /mail/.test(h));
  if (idxNome < 0 || idxTel < 0) return err(res, 400, 'header precisa ter coluna nome e telefone');
  let inseridos = 0, dup = 0;
  const stmt = db.prepare(`INSERT OR IGNORE INTO participantes(evento_id,nome,telefone,email,confirmado,token,origem)
    VALUES(?,?,?,?,1,?,'planilha')`);
  const newIds = [];
  for (const l of lines) {
    const cols = l.split(/[;,\t]/).map(s => s.trim());
    const nome = cols[idxNome], phone = wa.normalizePhone(cols[idxTel]), email = idxMail >= 0 ? cols[idxMail] : '';
    if (!nome || !phone) continue;
    const info = stmt.run(evId, nome, phone, email, newToken());
    if (info.changes) { inseridos++; newIds.push(info.lastInsertRowid); } else dup++;
  }
  for (const pid of newIds) sched.materializeSchedulesForParticipante(pid);
  ok(res, { inseridos, duplicados: dup });
});

// ---------- CHECK-IN ----------
app.get('/checkin/:token', async (req, res) => {
  const p = db.prepare('SELECT * FROM participantes WHERE token=?').get(req.params.token);
  if (!p) return res.status(404).send(pageWrap('token invalido', '<h1>Link invalido</h1>'));
  const ev = db.prepare('SELECT * FROM eventos WHERE id=?').get(p.evento_id);
  // Decidir se check-in de manha ou de almoço: se ja tem checkin_status=ok, cai no almoço
  const fase = p.checkin_status === 'ok' ? 'almoco' : 'inicio';
  res.send(pageWrap('Check-in', `
    <div class="checkin-card">
      <div class="badge">${fase === 'inicio' ? 'Check-in de entrada' : 'Check-in pos almoco'}</div>
      <h1>${escapeHtml(ev.nome)}</h1>
      <div class="who">Ola <b>${escapeHtml(p.nome)}</b>!</div>
      <form method="POST" action="/checkin/${p.token}/confirmar">
        <button class="btn-big">Confirmar meu check-in</button>
      </form>
      ${p.checkin_status === 'ok' ? `<p class="ok">Voce ja tinha feito check-in de entrada.</p>` : ''}
    </div>
  `, 'checkin'));
});

app.post('/checkin/:token/confirmar', async (req, res) => {
  const p = db.prepare('SELECT * FROM participantes WHERE token=?').get(req.params.token);
  if (!p) return res.status(404).send(pageWrap('erro', '<h1>Link invalido</h1>'));
  const now = Math.floor(Date.now() / 1000);
  let msg;
  if (p.checkin_status !== 'ok') {
    db.prepare(`UPDATE participantes SET checkin_status='ok', checkin_at=? WHERE id=?`).run(now, p.id);
    await sched.fireTrigger('checkin', p.id);
    msg = 'Check-in de entrada confirmado. Bom evento!';
  } else {
    db.prepare(`UPDATE participantes SET checkin_almoco_status='ok', checkin_almoco_at=? WHERE id=?`).run(now, p.id);
    await sched.fireTrigger('apos_almoco', p.id);
    msg = 'Check-in pos almoco confirmado. Boa segunda metade!';
  }
  res.send(pageWrap('Confirmado', `<div class="checkin-card"><h1>Feito</h1><p class="ok">${msg}</p></div>`, 'checkin'));
});

// Rota para gerar QR PNG do link de check-in de um participante (para imprimir/exibir)
app.get('/api/participantes/:id/qrcode.png', async (req, res) => {
  const p = db.prepare('SELECT * FROM participantes WHERE id=?').get(req.params.id);
  if (!p) return err(res, 404, 'nao encontrado');
  const link = `${getConfig('base_url', 'http://127.0.0.1:3020')}/checkin/${p.token}`;
  res.setHeader('content-type', 'image/png');
  const buf = await qrcode.toBuffer(link, { width: 400, margin: 1 });
  res.end(buf);
});

// Rota para gerar QR geral do check-in (impressao para o evento - almoço, por exemplo)
// O QR generico redireciona a quem faz sozinho login: nao aplicavel, cada pessoa tem seu QR individual acima.
// Placeholder: pagina de instrucao com todos os QRs impressao
app.get('/api/eventos/:id/qrs.html', (req, res) => {
  const ev = db.prepare('SELECT * FROM eventos WHERE id=?').get(req.params.id);
  if (!ev) return res.status(404).end();
  const parts = db.prepare('SELECT * FROM participantes WHERE evento_id=?').all(req.params.id);
  const items = parts.map(p => `
    <div class="qr-cell">
      <img src="/api/participantes/${p.id}/qrcode.png" width="220" height="220"/>
      <div class="qr-nome">${escapeHtml(p.nome)}</div>
      <div class="qr-fone">${escapeHtml(p.telefone)}</div>
    </div>`).join('');
  res.send(pageWrap('QRs — ' + ev.nome, `
    <h1 style="text-align:center;margin:20px 0">${escapeHtml(ev.nome)} — QRs de check-in</h1>
    <div class="qr-grid">${items}</div>
    <style>.qr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}.qr-cell{border:1px solid #223;padding:12px;text-align:center;border-radius:12px;background:#fff;color:#000}.qr-nome{font-weight:700;margin-top:6px}.qr-fone{color:#666;font-size:13px}@media print{.qr-cell{page-break-inside:avoid}}</style>
  `, 'checkin'));
});

// ---------- CONFIG ----------
app.get('/api/config', (req, res) => {
  const s = wa.state();
  ok(res, {
    sistema_ligado: getConfig('sistema_ligado') === '1',
    estilo_msg: getConfig('estilo_msg', 'amigavel'),
    assinatura: getConfig('assinatura', ''),
    base_url: getConfig('base_url', 'http://127.0.0.1:3020'),
    wa: { modo: s.modo, worker_url: s.worker_url, worker_token: s.worker_token ? '***' : '', qr_status: s.qr_status, qr_payload: s.qr_payload }
  });
});

app.post('/api/config', (req, res) => {
  const b = req.body || {};
  if ('sistema_ligado' in b) setConfig('sistema_ligado', b.sistema_ligado ? '1' : '0');
  if ('estilo_msg' in b) setConfig('estilo_msg', b.estilo_msg);
  if ('assinatura' in b) setConfig('assinatura', b.assinatura);
  if ('base_url' in b) setConfig('base_url', b.base_url);
  if (b.wa) {
    const patch = {};
    if (b.wa.modo) patch.modo = b.wa.modo;
    if (b.wa.worker_url != null) patch.worker_url = b.wa.worker_url;
    if (b.wa.worker_token != null && b.wa.worker_token !== '***') patch.worker_token = b.wa.worker_token;
    wa.updateState(patch);
  }
  ok(res);
});

app.post('/api/wa/qr/iniciar', async (req, res) => { try { const r = await wa.startQR(); ok(res, r); } catch (e) { err(res, 500, e.message); } });
app.post('/api/wa/qr/parar', async (req, res) => { try { const r = await wa.stopQR(); ok(res, r); } catch (e) { err(res, 500, e.message); } });
app.get('/api/wa/qr', (req, res) => ok(res, wa.state()));

app.post('/api/toggle', (req, res) => {
  const cur = getConfig('sistema_ligado') === '1';
  const novo = !cur;
  setConfig('sistema_ligado', novo ? '1' : '0');
  ok(res, { sistema_ligado: novo });
});

// Enviar msg de teste
app.post('/api/wa/teste', async (req, res) => {
  const b = req.body || {};
  if (!b.telefone || !b.mensagem) return err(res, 400, 'telefone + mensagem');
  try { const r = await wa.send(b.telefone, b.mensagem); ok(res, { r }); } catch (e) { err(res, 500, e.message); }
});

// ---------- Form publico de cadastro (para o link que Jeff colocar em algum lugar) ----------
app.get('/inscricao/:eventoId', (req, res) => {
  const ev = db.prepare('SELECT * FROM eventos WHERE id=?').get(req.params.eventoId);
  if (!ev) return res.status(404).send('evento nao encontrado');
  res.send(pageWrap('Inscricao — ' + ev.nome, `
    <div class="checkin-card">
      <div class="badge">Inscricao</div>
      <h1>${escapeHtml(ev.nome)}</h1>
      <p class="sub">${escapeHtml(ev.descricao || '')}</p>
      <p class="sub"><b>Data:</b> ${escapeHtml(ev.data)} — <b>Local:</b> ${escapeHtml(ev.local || '-')}</p>
      <form method="POST" action="/inscricao/${ev.id}">
        <input required name="nome" placeholder="Seu nome completo"/>
        <input required name="telefone" placeholder="Telefone com DDD (ex: 11987654321)"/>
        <input name="email" placeholder="E-mail (opcional)"/>
        <button class="btn-big">Confirmar presenca</button>
      </form>
    </div>
  `, 'checkin'));
});
app.post('/inscricao/:eventoId', express.urlencoded({ extended: true }), (req, res) => {
  const b = req.body || {};
  const evId = Number(req.params.eventoId);
  if (!b.nome || !b.telefone) return res.status(400).send('faltam dados');
  const phone = wa.normalizePhone(b.telefone);
  try {
    const info = db.prepare(`INSERT INTO participantes(evento_id,nome,telefone,email,confirmado,token,origem)
      VALUES(?,?,?,?,1,?,'form')`).run(evId, b.nome, phone, b.email || '', newToken());
    sched.materializeSchedulesForParticipante(info.lastInsertRowid);
    sched.fireTrigger('boas_vindas', info.lastInsertRowid);
    res.send(pageWrap('Confirmado', '<div class="checkin-card"><h1>Presenca confirmada</h1><p class="ok">Voce vai receber as instrucoes no WhatsApp.</p></div>', 'checkin'));
  } catch (e) {
    res.status(400).send(pageWrap('Erro', `<div class="checkin-card"><h1>Erro</h1><p class="ok">${escapeHtml(e.message)}</p></div>`, 'checkin'));
  }
});

// ---------- MEDIA ----------
app.get('/media/:id', (req, res) => {
  const c = db.prepare('SELECT media_path FROM cadencias WHERE id=?').get(req.params.id);
  if (!c || !c.media_path || !fs.existsSync(c.media_path)) return res.status(404).end();
  res.sendFile(c.media_path);
});

// ---------- LOGS ----------
app.get('/api/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM log ORDER BY id DESC LIMIT 200').all();
  ok(res, { logs: rows });
});

// ---------- HEALTH ----------
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- static ----------
app.use('/', express.static(path.join(__dirname, 'public')));

// utils
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pageWrap(title, body, mode = 'app') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><link rel="stylesheet" href="/styles.css"/></head><body class="${mode}"><main>${body}</main></body></html>`;
}

app.listen(PORT, '0.0.0.0', () => {
  log('info', 'server', `jeff-eventos ouvindo na :${PORT}`);
  sched.start();
});
