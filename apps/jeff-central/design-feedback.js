// Feedback por imagem das artes do Agente de Design (chat da Central e qualquer tela que mostre /api/design/arquivo/...).
// Qualquer pessoa logada avalia: 👍/👎 + comentário. O Zeus e os agentes leem antes de criar a próxima arte
// (/opt/jeff-worker/scripts/feedback-arte.sh) pra repetir o que agradou e evitar o que foi reprovado.
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS design_feedback (
  arquivo TEXT NOT NULL,            -- /api/design/arquivo/<criacao>/<nome>.png
  criacao_id TEXT,
  slide INTEGER,
  versao INTEGER,
  usuario TEXT NOT NULL,
  valor INTEGER NOT NULL,           -- 1 gostei, -1 não gostei
  nota TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (arquivo, usuario)
);
CREATE INDEX IF NOT EXISTS idx_design_feedback_criacao ON design_feedback(criacao_id, updated_at);`);

const st = {
  up: db.prepare(`INSERT INTO design_feedback (arquivo, criacao_id, slide, versao, usuario, valor, nota, created_at, updated_at)
    VALUES (@arquivo, @criacao_id, @slide, @versao, @usuario, @valor, @nota, @agora, @agora)
    ON CONFLICT(arquivo, usuario) DO UPDATE SET valor = excluded.valor, nota = excluded.nota, updated_at = excluded.updated_at`),
  del: db.prepare(`DELETE FROM design_feedback WHERE arquivo = ? AND usuario = ?`),
  get: db.prepare(`SELECT valor, nota FROM design_feedback WHERE arquivo = ? AND usuario = ?`),
};

// /api/design/arquivo/<cid>/v3-s2-xxxx.png -> { criacao_id, versao, slide }
function partes(arquivo) {
  const m = /^\/api\/design\/arquivo\/([\w-]+)\/v(\d+)-s(\d+)/.exec(arquivo || '');
  const c = /^\/api\/design\/arquivo\/([\w-]+)\//.exec(arquivo || '');
  return { criacao_id: c ? c[1] : null, versao: m ? +m[2] : null, slide: m ? +m[3] : null };
}
const limpa = (u) => String(u || '').split('?')[0].slice(0, 300);
const quem = (u) => (u && (u.email || u.name)) || 'anon';

const router = express.Router();
router.get('/', (req, res) => {
  const arquivo = limpa(req.query.arquivo);
  if (!arquivo.startsWith('/api/design/arquivo/')) return res.status(400).json({ error: 'arquivo inválido' });
  res.json(st.get.get(arquivo, quem(req.user)) || { valor: 0, nota: null });
});
router.post('/', express.json(), (req, res) => {
  const arquivo = limpa(req.body && req.body.arquivo);
  if (!arquivo.startsWith('/api/design/arquivo/')) return res.status(400).json({ error: 'arquivo inválido' });
  const valor = [1, -1, 0].includes(+req.body.valor) ? +req.body.valor : 0;
  const nota = req.body.nota ? String(req.body.nota).slice(0, 2000) : null;
  if (!valor) { st.del.run(arquivo, quem(req.user)); return res.json({ ok: true, valor: 0 }); }
  st.up.run(Object.assign({ arquivo, usuario: quem(req.user), valor, nota, agora: Date.now() }, partes(arquivo)));
  res.json({ ok: true, valor, nota });
});

module.exports = { router };
