// Habilidades: catálogo dinâmico (regras de prompt + skills do Claude Code) com criação e edição pela interface.
//
// Fontes:
//   1. REGRAS do agents-seed.js (regras de prompt padrão)  → editáveis via override no banco; podem ser ocultadas.
//   2. Regras criadas pela interface                        → tabela skills (kind='regra').
//   3. Skills do Claude Code instaladas no servidor         → skills-catalog.js. Nome/grupo/descrição editáveis via
//      override no banco; o SKILL.md só é editável quando a skill fica em ~/.claude/skills/<slug>/ (origem "usuário").
//      Skills novas criadas aqui viram um diretório ~/.claude/skills/<slug>/SKILL.md, prontas pro Claude Code.
const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const catalog = require('./skills-catalog');
const { REGRAS } = require('./agents-seed');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'central.db');
const HOME = process.env.CLAUDE_HOME || '/root/.claude';
const USER_SKILLS_DIR = path.join(HOME, 'skills');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'regra',
  name TEXT,
  grp TEXT,
  instruction TEXT,
  desc TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`);

const stmt = {
  all: db.prepare('SELECT * FROM skills'),
  get: db.prepare('SELECT * FROM skills WHERE id = ?'),
  up: db.prepare(`INSERT INTO skills (id, kind, name, grp, instruction, desc, hidden, created_at, updated_at)
    VALUES (@id, @kind, @name, @grp, @instruction, @desc, @hidden, @now, @now)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = COALESCE(excluded.name, skills.name), grp = COALESCE(excluded.grp, skills.grp),
      instruction = COALESCE(excluded.instruction, skills.instruction), desc = COALESCE(excluded.desc, skills.desc), hidden = excluded.hidden, updated_at = excluded.updated_at`),
  del: db.prepare('DELETE FROM skills WHERE id = ?'),
};

class SkillError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const isUserSkill = (s) => s.kind === 'skill' && s.origem === 'usuário' && s.file && path.resolve(s.file).startsWith(USER_SKILLS_DIR + path.sep);

// ─── Catálogo unificado ───────────────────────────────────────────────────────
function all() {
  const rows = {};
  stmt.all.all().forEach((r) => { rows[r.id] = r; });
  const out = [];

  // 1. regras padrão (com override)
  REGRAS.forEach((r) => {
    const o = rows[r.id];
    if (o && o.hidden) return;
    const instruction = (o && o.instruction) || r.instruction;
    out.push({
      id: r.id, kind: 'regra', group: (o && o.grp) || r.group, name: (o && o.name) || r.name,
      instruction, desc: instruction, slug: '', origem: 'padrão', file: null,
      origin: 'seed', overridden: !!o, editable: true, deletable: true,
    });
  });
  // 2. regras criadas na interface
  Object.values(rows).filter((r) => r.kind === 'regra' && !REGRAS.some((x) => x.id === r.id) && !r.hidden)
    .sort((a, b) => a.created_at - b.created_at)
    .forEach((r) => out.push({
      id: r.id, kind: 'regra', group: r.grp || 'Minhas regras', name: r.name || r.id, instruction: r.instruction || '', desc: r.instruction || '',
      slug: '', origem: 'personalizada', file: null, origin: 'custom', overridden: false, editable: true, deletable: true,
    }));
  // 3. skills do Claude Code no servidor (com override de nome/grupo/descrição)
  catalog.load().forEach((s) => {
    const o = rows[s.id];
    if (o && o.hidden) return;
    const name = (o && o.name) || s.name, group = (o && o.grp) || s.group, desc = (o && o.desc) || s.desc;
    const item = Object.assign({}, s, { name, group, desc, instruction: catalog.instrucao(s.slug, name, desc) });
    const user = isUserSkill(s);
    out.push(Object.assign(item, { origin: user ? 'user-skill' : 'server-skill', overridden: !!o, editable: true, deletable: user }));
  });
  return out;
}
function shape(s, comCorpo) {
  const o = { id: s.id, name: s.name, group: s.group, kind: s.kind, desc: s.desc || '', slug: s.slug || '', origem: s.origem || '',
    instruction: s.instruction || '', origin: s.origin, overridden: !!s.overridden, editable: !!s.editable, deletable: !!s.deletable, file: s.file || null };
  if (comCorpo && s.kind === 'skill' && s.file) {
    try { o.body = fs.readFileSync(s.file, 'utf8'); } catch (_) { o.body = ''; }
  }
  return o;
}
function find(id) { return all().find((s) => s.id === id) || null; }

// ─── SKILL.md ─────────────────────────────────────────────────────────────────
const yamlStr = (s) => JSON.stringify(String(s || '').replace(/\s+/g, ' ').trim());
function skillMd(slug, desc, body) {
  const corpo = String(body || '').replace(/^---[\s\S]*?\n---\r?\n?/, '').trim();
  return `---\nname: ${slug}\ndescription: ${yamlStr(desc)}\n---\n\n${corpo}\n`;
}
function writeUserSkill(slug, desc, body) {
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(slug)) throw new SkillError(400, 'Identificador inválido: use letras minúsculas, números e hífen.');
  if (slug === 'synced') throw new SkillError(400, 'Identificador reservado.');
  const dir = path.join(USER_SKILLS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd(slug, desc, body), 'utf8');
  catalog.load(true);
}

// ─── validação ────────────────────────────────────────────────────────────────
function campos(b) {
  const o = {};
  if (b.name !== undefined) { o.name = String(b.name).trim().slice(0, 120); if (!o.name) throw new SkillError(400, 'Nome obrigatório.'); }
  if (b.group !== undefined) o.group = String(b.group).trim().slice(0, 80);
  if (b.instruction !== undefined) o.instruction = String(b.instruction).trim().slice(0, 4000);
  if (b.desc !== undefined) o.desc = String(b.desc).trim().slice(0, 600);
  if (b.body !== undefined) o.body = String(b.body).slice(0, 200000);
  return o;
}

// ─── rotas ────────────────────────────────────────────────────────────────────
const router = express.Router();
const fail = (res, e) => { const st = e.status || 500; if (st >= 500) console.error('[skills]', e); res.status(st).json({ error: e.message }); };
const idOk = (v) => /^[A-Za-z0-9][A-Za-z0-9:_-]{0,120}$/.test(String(v || ''));

router.get('/', (_req, res) => res.json({ skills: all().map((s) => shape(s)) }));

router.get('/:id', (req, res) => {
  const s = find(req.params.id);
  if (!s) return res.status(404).json({ error: 'habilidade não encontrada' });
  res.json({ skill: shape(s, true) });
});

router.post('/', (req, res) => {
  try {
    const b = req.body || {};
    const c = campos(b);
    if (!c.name) throw new SkillError(400, 'Nome obrigatório.');
    const now = Date.now();
    if (b.kind === 'skill') {
      const slug = slugify(b.slug || c.name);
      if (!slug || slug.length < 2) throw new SkillError(400, 'Identificador inválido.');
      if (find(slug)) throw new SkillError(409, 'Já existe uma habilidade com o identificador "' + slug + '".');
      if (!c.desc) throw new SkillError(400, 'Descreva quando a skill deve ser acionada.');
      if (!c.body || !c.body.trim()) throw new SkillError(400, 'Escreva as instruções da skill (o conteúdo do SKILL.md).');
      writeUserSkill(slug, c.desc, c.body);
      stmt.up.run({ id: slug, kind: 'skill', name: c.name, grp: c.group || 'Minhas skills', instruction: null, desc: c.desc, hidden: 0, now });
      return res.json({ ok: true, skill: shape(find(slug), true) });
    }
    // regra de prompt
    if (!c.instruction) throw new SkillError(400, 'Escreva a instrução da regra.');
    let id = slugify(b.id || c.name) || 'regra';
    if (find(id) || stmt.get.get(id)) { let n = 2; while (find(id + '-' + n) || stmt.get.get(id + '-' + n)) n++; id = id + '-' + n; }
    stmt.up.run({ id, kind: 'regra', name: c.name, grp: c.group || 'Minhas regras', instruction: c.instruction, desc: c.instruction, hidden: 0, now });
    res.json({ ok: true, skill: shape(find(id)) });
  } catch (e) { fail(res, e); }
});

router.put('/:id', (req, res) => {
  try {
    if (!idOk(req.params.id)) throw new SkillError(400, 'id inválido');
    const s = find(req.params.id);
    if (!s) throw new SkillError(404, 'habilidade não encontrada');
    const c = campos(req.body || {});
    const now = Date.now();
    if (s.kind === 'regra') {
      const row = stmt.get.get(s.id);
      stmt.up.run({ id: s.id, kind: 'regra', name: c.name !== undefined ? c.name : (row ? row.name : s.name), grp: c.group !== undefined ? (c.group || s.group) : (row ? row.grp : s.group),
        instruction: c.instruction !== undefined ? (c.instruction || s.instruction) : (row ? row.instruction : s.instruction), desc: null, hidden: 0, now });
    } else {
      if (c.body !== undefined) {
        if (!isUserSkill(s)) throw new SkillError(400, 'O conteúdo dessa skill não pode ser editado aqui: ela vem de ' + s.origem + '. Só nome, grupo e descrição.');
        writeUserSkill(s.slug, c.desc !== undefined ? c.desc : s.desc, c.body);
      } else if (c.desc !== undefined && isUserSkill(s)) {
        let body = ''; try { body = fs.readFileSync(s.file, 'utf8'); } catch (_) {}
        writeUserSkill(s.slug, c.desc, body);
      }
      const row = stmt.get.get(s.id);
      stmt.up.run({ id: s.id, kind: 'skill', name: c.name !== undefined ? c.name : (row ? row.name : null), grp: c.group !== undefined ? (c.group || null) : (row ? row.grp : null),
        instruction: null, desc: c.desc !== undefined ? c.desc : (row ? row.desc : null), hidden: 0, now });
    }
    res.json({ ok: true, skill: shape(find(s.id), true) });
  } catch (e) { fail(res, e); }
});

// Volta ao padrão: apaga o override de uma regra do seed ou de uma skill do servidor
router.post('/:id/restore', (req, res) => {
  try {
    if (!idOk(req.params.id)) throw new SkillError(400, 'id inválido');
    const row = stmt.get.get(req.params.id);
    const isSeed = REGRAS.some((r) => r.id === req.params.id) || catalog.load().some((s) => s.id === req.params.id);
    if (!row || !isSeed) throw new SkillError(400, 'Essa habilidade não tem padrão para restaurar.');
    stmt.del.run(req.params.id);
    res.json({ ok: true, skill: shape(find(req.params.id)) });
  } catch (e) { fail(res, e); }
});

router.delete('/:id', (req, res) => {
  try {
    if (!idOk(req.params.id)) throw new SkillError(400, 'id inválido');
    const s = find(req.params.id);
    if (!s) throw new SkillError(404, 'habilidade não encontrada');
    if (!s.deletable) throw new SkillError(400, 'Essa skill vem de ' + s.origem + ' e não pode ser removida por aqui.');
    const now = Date.now();
    if (s.origin === 'seed') {
      stmt.up.run({ id: s.id, kind: 'regra', name: null, grp: null, instruction: null, desc: null, hidden: 1, now });
    } else if (s.origin === 'custom') {
      stmt.del.run(s.id);
    } else if (s.origin === 'user-skill') {
      const dir = path.dirname(s.file);
      if (!dir.startsWith(USER_SKILLS_DIR + path.sep) || dir === USER_SKILLS_DIR) throw new SkillError(400, 'Caminho inesperado.');
      fs.rmSync(dir, { recursive: true, force: true });
      stmt.del.run(s.id);
      catalog.load(true);
    }
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

// Regras ocultas do seed (pra poder restaurar)
router.get('/_hidden/list', (_req, res) => {
  const hidden = stmt.all.all().filter((r) => r.hidden).map((r) => {
    const base = REGRAS.find((x) => x.id === r.id) || catalog.load().find((x) => x.id === r.id);
    return base ? { id: r.id, name: base.name, group: base.group, kind: base.kind || 'regra' } : null;
  }).filter(Boolean);
  res.json({ hidden });
});

module.exports = { router, all, find };
