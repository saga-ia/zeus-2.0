// Base de conhecimento da empresa: documentos (arquivo ou texto), extração, chunking e busca (FTS5/BM25).
// Serve a tela /conhecimento e alimenta o RAG do chat (ZEUS e agentes) via retrieve().
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const Database = require('better-sqlite3');
const { extractText } = require('./agents');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const KB_ROOT = path.join(DATA_DIR, 'knowledge');
const DB_PATH = path.join(DATA_DIR, 'central.db');
const CHUNK_CHARS = parseInt(process.env.KB_CHUNK_CHARS || '1200', 10);
const CHUNK_OVERLAP = parseInt(process.env.KB_CHUNK_OVERLAP || '150', 10);
const MAX_TEXT = 4 * 1024 * 1024; // 4 MB de texto por documento
const SOURCES = ['upload', 'texto', 'link'];
const STATUS = { queued: 'Na fila', indexing: 'Indexando', indexed: 'Indexado', error: 'Erro', notext: 'Sem texto' };

if (!fs.existsSync(KB_ROOT)) fs.mkdirSync(KB_ROOT, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS kb_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'Geral',
  source TEXT NOT NULL DEFAULT 'texto',
  tags TEXT,
  notes TEXT,
  content TEXT,
  url TEXT,
  filename TEXT,
  originalname TEXT,
  mime TEXT,
  size INTEGER,
  chars INTEGER,
  chunks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  indexed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kb_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(doc_id, seq);
CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(text, doc_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
`);

const stmt = {
  list: db.prepare(`SELECT * FROM kb_docs ORDER BY updated_at DESC`),
  get: db.prepare(`SELECT * FROM kb_docs WHERE id = ?`),
  ins: db.prepare(`INSERT INTO kb_docs (id, title, scope, source, tags, notes, content, url, filename, originalname, mime, size, chars, chunks, status, enabled, created_at, updated_at)
    VALUES (@id, @title, @scope, @source, @tags, @notes, @content, @url, @filename, @originalname, @mime, @size, @chars, 0, @status, 1, @now, @now)`),
  del: db.prepare(`DELETE FROM kb_docs WHERE id = ?`),
  chunksDel: db.prepare(`DELETE FROM kb_chunks WHERE doc_id = ?`),
  ftsDel: db.prepare(`DELETE FROM kb_fts WHERE doc_id = ?`),
  chunkIns: db.prepare(`INSERT INTO kb_chunks (doc_id, seq, text) VALUES (?, ?, ?)`),
  ftsIns: db.prepare(`INSERT INTO kb_fts (rowid, text, doc_id) VALUES (?, ?, ?)`),
  chunksOf: db.prepare(`SELECT seq, text FROM kb_chunks WHERE doc_id = ? ORDER BY seq`),
  setIndex: db.prepare(`UPDATE kb_docs SET chars = ?, chunks = ?, status = ?, error = ?, indexed_at = ?, updated_at = ? WHERE id = ?`),
  setStatus: db.prepare(`UPDATE kb_docs SET status = ?, error = ?, updated_at = ? WHERE id = ?`),
  stats: db.prepare(`SELECT COUNT(*) AS docs, COALESCE(SUM(chunks), 0) AS chunks, COALESCE(SUM(chars), 0) AS chars, MAX(indexed_at) AS last,
    SUM(status = 'indexed') AS indexed, SUM(status IN ('queued','indexing')) AS pending, SUM(status = 'error') AS errors FROM kb_docs`),
  search: db.prepare(`SELECT f.doc_id, f.rowid AS chunk_id, bm25(kb_fts) AS score, snippet(kb_fts, 0, '[[', ']]', '…', 24) AS snip, c.text, c.seq
    FROM kb_fts f JOIN kb_chunks c ON c.id = f.rowid JOIN kb_docs d ON d.id = f.doc_id
    WHERE kb_fts MATCH ? AND d.enabled = 1 ORDER BY score LIMIT ?`),
};

const newId = () => crypto.randomBytes(6).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
function docDir(id) { return path.join(KB_ROOT, id); }
function textPath(d) { return path.join(docDir(d.id), 'texto.txt'); }

function shape(d) {
  if (!d) return null;
  return {
    id: d.id, title: d.title, scope: d.scope || 'Geral', source: d.source, tags: parseJSON(d.tags, []),
    notes: d.notes || '', url: d.url || '', hasContent: !!(d.content && d.content.trim()),
    file: d.filename ? { name: d.originalname, mime: d.mime, size: d.size } : null,
    chars: d.chars || 0, chunks: d.chunks || 0, status: d.status, statusLabel: STATUS[d.status] || d.status, error: d.error || null,
    enabled: !!d.enabled, indexedAt: d.indexed_at, createdAt: d.created_at, updatedAt: d.updated_at,
  };
}

// ─── Chunking ─────────────────────────────────────────────────────────────────
function chunkText(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const paras = clean.split(/\n\s*\n/);
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); };
  for (let p of paras) {
    p = p.trim();
    if (!p) continue;
    // Parágrafo maior que o chunk: fatia por frases
    if (p.length > CHUNK_CHARS) {
      push(); cur = '';
      const sents = p.split(/(?<=[.!?;:])\s+/);
      let buf = '';
      for (const s of sents) {
        if ((buf + ' ' + s).length > CHUNK_CHARS && buf) {
          out.push(buf.trim());
          buf = buf.slice(-CHUNK_OVERLAP) + ' ' + s;
        } else buf = (buf ? buf + ' ' : '') + s;
      }
      cur = buf;
      continue;
    }
    if ((cur + '\n\n' + p).length > CHUNK_CHARS && cur) {
      push();
      cur = cur.slice(-CHUNK_OVERLAP) + '\n\n' + p;
    } else cur = cur ? cur + '\n\n' + p : p;
  }
  push();
  return out;
}

// ─── Indexação ────────────────────────────────────────────────────────────────
// Texto de um documento = conteúdo digitado + texto extraído do arquivo (quando houver).
async function fullText(d) {
  const parts = [];
  if (d.content && d.content.trim()) parts.push(d.content.trim());
  if (d.filename) {
    const orig = path.join(docDir(d.id), d.filename);
    if (fs.existsSync(orig)) {
      const t = await extractText(orig, d.originalname, d.mime);
      if (t && t.trim()) parts.push(t.trim());
    }
  }
  return parts.join('\n\n').slice(0, MAX_TEXT);
}

const indexing = new Set();
async function indexDoc(id) {
  const d = stmt.get.get(id);
  if (!d || indexing.has(id)) return;
  indexing.add(id);
  stmt.setStatus.run('indexing', null, Date.now(), id);
  try {
    const text = await fullText(d);
    const dir = docDir(id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (text) fs.writeFileSync(textPath(d), text); else if (fs.existsSync(textPath(d))) fs.rmSync(textPath(d));
    const chunks = chunkText(text);
    db.transaction(() => {
      stmt.ftsDel.run(id);
      stmt.chunksDel.run(id);
      chunks.forEach((c, i) => {
        const r = stmt.chunkIns.run(id, i, c);
        stmt.ftsIns.run(r.lastInsertRowid, c, id);
      });
      const st = chunks.length ? 'indexed' : 'notext';
      stmt.setIndex.run(text.length, chunks.length, st, null, Date.now(), Date.now(), id);
    })();
  } catch (e) {
    console.error('[knowledge] indexação falhou', id, e.message);
    stmt.setStatus.run('error', String(e.message || e).slice(0, 300), Date.now(), id);
  } finally {
    indexing.delete(id);
  }
}

let queue = Promise.resolve();
function enqueue(id) {
  stmt.setStatus.run('queued', null, Date.now(), id);
  queue = queue.then(() => indexDoc(id)).catch(() => {});
  return queue;
}

// ─── Busca (RAG lexical) ──────────────────────────────────────────────────────
const STOP = new Set(('a o os as um uma uns umas de do da dos das em no na nos nas por para pra com sem sob sobre e ou mas que se não nao sim ' +
  'ao aos à às é são ser foi era está estao estão tem têm ter como qual quais quando onde quem porque porquê isso isto aquilo ele ela eles elas ' +
  'eu tu nós voce você vocês me te lhe nos seu sua seus suas meu minha meus minhas nosso nossa dele dela já ja mais menos muito pouco também tambem ' +
  'só so até ate depois antes então entao aqui ali lá la esse essa esses essas este esta estes estas aquele aquela the of and to in is for on with').split(/\s+/));
function terms(q) {
  return String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));
}
function ftsQuery(q, mode) {
  const t = [...new Set(terms(q))].slice(0, 24);
  if (!t.length) return null;
  const quoted = t.map(w => '"' + w + '"');
  return mode === 'and' ? quoted.join(' AND ') : quoted.join(' OR ');
}
function search(q, limit) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  let rows = [];
  const qa = ftsQuery(q, 'and');
  if (qa) { try { rows = stmt.search.all(qa, lim); } catch (_) { rows = []; } }
  if (rows.length < lim) {
    const qo = ftsQuery(q, 'or');
    if (qo) {
      try {
        const seen = new Set(rows.map(r => r.chunk_id));
        stmt.search.all(qo, lim * 2).forEach(r => { if (!seen.has(r.chunk_id) && rows.length < lim) { seen.add(r.chunk_id); rows.push(r); } });
      } catch (_) {}
    }
  }
  const docs = {};
  return rows.map(r => {
    const d = docs[r.doc_id] || (docs[r.doc_id] = shape(stmt.get.get(r.doc_id)));
    return { docId: r.doc_id, title: d ? d.title : r.doc_id, scope: d ? d.scope : '', seq: r.seq, score: r.score, snippet: r.snip, text: r.text };
  });
}

// Bloco de contexto pro prompt do chat: trechos mais relevantes pra mensagem do usuário.
function retrieve(query, opts) {
  opts = opts || {};
  const hits = search(query, opts.limit || 6);
  if (!hits.length) return '';
  const max = opts.maxChars || 9000;
  const lines = ['=== Base de conhecimento da empresa (trechos relevantes, cite o documento quando usar) ==='];
  let used = 0;
  for (const h of hits) {
    const body = h.text.length > 1800 ? h.text.slice(0, 1800) + '…' : h.text;
    if (used + body.length > max) break;
    used += body.length;
    lines.push(`--- [${h.title}] (${h.scope}, trecho ${h.seq + 1}) ---`);
    lines.push(body);
  }
  lines.push('=== Fim da base de conhecimento ===');
  return lines.join('\n');
}

function stats() {
  const s = stmt.stats.get();
  return { docs: s.docs || 0, chunks: s.chunks || 0, chars: s.chars || 0, lastIndexedAt: s.last || null, indexed: s.indexed || 0, pending: s.pending || 0, errors: s.errors || 0 };
}
function scopes() {
  const base = ['Geral', 'Empresa', 'Comercial', 'Marketing', 'Produto', 'Pessoas', 'Financeiro', 'Customer Success', 'Diretoria'];
  const used = db.prepare(`SELECT DISTINCT scope FROM kb_docs`).all().map(r => r.scope).filter(Boolean);
  return [...new Set(base.concat(used))];
}

// ─── Upload ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const id = req.params.id || (req._kbNewId = req._kbNewId || newId());
      const dir = docDir(id);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.\w]/g, '');
      cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
});
function fixName(f) {
  // multer entrega o nome em latin1 quando o navegador manda UTF-8
  try { const u = Buffer.from(f.originalname, 'latin1').toString('utf8'); if (!/�/.test(u)) f.originalname = u; } catch (_) {}
  return f.originalname;
}

function cleanInput(b) {
  const o = {};
  if (b.title !== undefined) o.title = String(b.title).trim().slice(0, 200);
  if (b.scope !== undefined) o.scope = String(b.scope).trim().slice(0, 60) || 'Geral';
  if (b.source !== undefined) o.source = SOURCES.includes(b.source) ? b.source : undefined;
  if (b.tags !== undefined) {
    const arr = Array.isArray(b.tags) ? b.tags : String(b.tags).split(',');
    o.tags = JSON.stringify([...new Set(arr.map(s => String(s).trim()).filter(Boolean))].slice(0, 20));
  }
  if (b.notes !== undefined) o.notes = String(b.notes).slice(0, 2000);
  if (b.content !== undefined) o.content = String(b.content).slice(0, MAX_TEXT);
  if (b.url !== undefined) o.url = String(b.url).trim().slice(0, 1000);
  if (b.enabled !== undefined) o.enabled = (b.enabled === true || b.enabled === 'true' || b.enabled === 1 || b.enabled === '1') ? 1 : 0;
  Object.keys(o).forEach(k => { if (o[k] === undefined) delete o[k]; });
  return o;
}

// ─── Router ───────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ docs: stmt.list.all().map(shape), stats: stats(), scopes: scopes(), sources: [['upload', 'Upload'], ['texto', 'Texto'], ['link', 'Link']] });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ hits: [] });
  res.json({ hits: search(q, req.query.limit || 12) });
});

router.post('/reindex', async (_req, res) => {
  const ids = stmt.list.all().map(d => d.id);
  ids.forEach(enqueue);
  res.json({ ok: true, queued: ids.length });
});

// Criar: JSON (texto/link) ou multipart (arquivo + campos). Vários arquivos = um documento por arquivo.
router.post('/', upload.array('files', 20), async (req, res) => {
  const b = req.body || {};
  const o = cleanInput(b);
  const files = req.files || [];
  const now = Date.now();
  const created = [];
  try {
    if (files.length) {
      // O primeiro arquivo fica na pasta já criada pelo multer (req._kbNewId); os demais vão pra pastas próprias
      files.forEach((f, i) => {
        fixName(f);
        const id = i === 0 && req._kbNewId ? req._kbNewId : newId();
        const dir = docDir(id);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (path.dirname(f.path) !== dir) { fs.renameSync(f.path, path.join(dir, f.filename)); }
        const title = files.length === 1 && o.title ? o.title : f.originalname.replace(/\.[^.]+$/, '');
        stmt.ins.run({ id, title, scope: o.scope || 'Geral', source: 'upload', tags: o.tags || '[]', notes: o.notes || '',
          content: files.length === 1 ? (o.content || '') : '', url: o.url || '', filename: f.filename, originalname: f.originalname,
          mime: f.mimetype, size: f.size, chars: 0, status: 'queued', now });
        created.push(id);
      });
    } else {
      if (!o.title) return res.status(400).json({ error: 'título obrigatório' });
      if (!(o.content || '').trim() && !(o.url || '').trim()) return res.status(400).json({ error: 'escreva o conteúdo ou anexe um arquivo' });
      const id = newId();
      stmt.ins.run({ id, title: o.title, scope: o.scope || 'Geral', source: o.source || (o.url && !o.content ? 'link' : 'texto'), tags: o.tags || '[]',
        notes: o.notes || '', content: o.content || '', url: o.url || '', filename: null, originalname: null, mime: null, size: null, chars: 0, status: 'queued', now });
      created.push(id);
    }
    created.forEach(enqueue);
    if (req.query.wait === '1' || created.length === 1) await queue;
    res.json({ ok: true, ids: created, docs: created.map(id => shape(stmt.get.get(id))) });
  } catch (e) {
    console.error('[knowledge] criar', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  const d = stmt.get.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'documento não encontrado' });
  const out = shape(d);
  out.content = d.content || '';
  const tp = textPath(d);
  out.text = fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8').slice(0, 200000) : '';
  if (req.query.chunks === '1') out.chunkList = stmt.chunksOf.all(d.id);
  res.json({ doc: out });
});

router.patch('/:id', async (req, res) => {
  const cur = stmt.get.get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'documento não encontrado' });
  const o = cleanInput(req.body || {});
  if (o.title === '') return res.status(400).json({ error: 'título obrigatório' });
  const keys = Object.keys(o);
  if (keys.length) {
    db.prepare(`UPDATE kb_docs SET ${keys.map(k => k + ' = @' + k).join(', ')}, updated_at = @now WHERE id = @id`)
      .run(Object.assign({ id: cur.id, now: Date.now() }, o));
  }
  const reindex = o.content !== undefined && o.content !== (cur.content || '');
  if (reindex) { enqueue(cur.id); await queue; }
  res.json({ doc: shape(stmt.get.get(cur.id)) });
});

// Anexar/trocar o arquivo de um documento existente
router.post('/:id/file', (req, res, next) => {
  if (!stmt.get.get(req.params.id)) return res.status(404).json({ error: 'documento não encontrado' });
  next();
}, upload.single('file'), async (req, res) => {
  const cur = stmt.get.get(req.params.id);
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'nenhum arquivo enviado' });
  fixName(f);
  if (cur.filename) { const old = path.join(docDir(cur.id), cur.filename); if (fs.existsSync(old)) fs.rmSync(old, { force: true }); }
  db.prepare(`UPDATE kb_docs SET filename = ?, originalname = ?, mime = ?, size = ?, source = CASE WHEN source = 'texto' THEN 'upload' ELSE source END, updated_at = ? WHERE id = ?`)
    .run(f.filename, f.originalname, f.mimetype, f.size, Date.now(), cur.id);
  enqueue(cur.id); await queue;
  res.json({ doc: shape(stmt.get.get(cur.id)) });
});

router.delete('/:id/file', async (req, res) => {
  const cur = stmt.get.get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'documento não encontrado' });
  if (cur.filename) { const old = path.join(docDir(cur.id), cur.filename); if (fs.existsSync(old)) fs.rmSync(old, { force: true }); }
  db.prepare(`UPDATE kb_docs SET filename = NULL, originalname = NULL, mime = NULL, size = NULL, source = CASE WHEN source = 'upload' THEN (CASE WHEN url != '' AND (content IS NULL OR content = '') THEN 'link' ELSE 'texto' END) ELSE source END, updated_at = ? WHERE id = ?`).run(Date.now(), cur.id);
  enqueue(cur.id); await queue;
  res.json({ doc: shape(stmt.get.get(cur.id)) });
});

router.get('/:id/file', (req, res) => {
  const d = stmt.get.get(req.params.id);
  if (!d || !d.filename) return res.status(404).end();
  res.download(path.join(docDir(d.id), d.filename), d.originalname || d.filename);
});

router.post('/:id/reindex', async (req, res) => {
  if (!stmt.get.get(req.params.id)) return res.status(404).json({ error: 'documento não encontrado' });
  enqueue(req.params.id); await queue;
  res.json({ doc: shape(stmt.get.get(req.params.id)) });
});

router.delete('/:id', (req, res) => {
  const cur = stmt.get.get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'documento não encontrado' });
  db.transaction(() => { stmt.ftsDel.run(cur.id); stmt.chunksDel.run(cur.id); stmt.del.run(cur.id); })();
  const dir = docDir(cur.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

// Retoma o que ficou na fila/indexando de uma queda do processo
stmt.list.all().filter(d => d.status === 'queued' || d.status === 'indexing').forEach(d => enqueue(d.id));

module.exports = { router, search, retrieve, stats, chunkText };
