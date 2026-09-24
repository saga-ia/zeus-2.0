const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'eventos.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  local TEXT DEFAULT '',
  data TEXT NOT NULL,
  checkin_hora TEXT NOT NULL,
  inicio_hora TEXT NOT NULL,
  almoco_hora TEXT DEFAULT '',
  intervalo_hora TEXT DEFAULT '',
  final_hora TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS cadencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  fase TEXT NOT NULL,               -- pre | evento | pos
  nome TEXT NOT NULL,
  mensagem TEXT DEFAULT '',
  media_path TEXT DEFAULT '',
  media_tipo TEXT DEFAULT '',       -- text | image | audio | video
  quando_tipo TEXT NOT NULL,        -- datetime | evento_offset | trigger
  quando_valor TEXT NOT NULL,       -- ISO datetime OU minutos OU trigger name (checkin, no_checkin, apos_almoco, no_checkin_almoco, boas_vindas)
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT DEFAULT '',
  confirmado INTEGER NOT NULL DEFAULT 1,
  checkin_status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | ok
  checkin_at INTEGER,
  checkin_almoco_status TEXT NOT NULL DEFAULT 'pendente',
  checkin_almoco_at INTEGER,
  token TEXT NOT NULL,
  origem TEXT DEFAULT 'manual',                       -- manual | planilha | form
  criado_em INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(evento_id, telefone)
);

CREATE TABLE IF NOT EXISTS envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadencia_id INTEGER NOT NULL REFERENCES cadencias(id) ON DELETE CASCADE,
  participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | enviado | erro | cancelado
  enviar_em INTEGER NOT NULL,                -- unix ts
  enviado_em INTEGER,
  erro TEXT DEFAULT '',
  UNIQUE(cadencia_id, participante_id)
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS wa_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  modo TEXT NOT NULL DEFAULT 'token',       -- token | qr
  worker_url TEXT DEFAULT 'http://127.0.0.1:3002',
  worker_token TEXT DEFAULT '',
  qr_status TEXT DEFAULT 'desconectado',
  qr_payload TEXT DEFAULT '',
  atualizado_em INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

INSERT OR IGNORE INTO wa_state (id, modo) VALUES (1, 'token');

CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  nivel TEXT NOT NULL,
  origem TEXT NOT NULL,
  mensagem TEXT NOT NULL
);
`);

function getConfig(chave, def = '') {
  const row = db.prepare('SELECT valor FROM config WHERE chave=?').get(chave);
  return row ? row.valor : def;
}
function setConfig(chave, valor) {
  db.prepare(`INSERT INTO config(chave,valor) VALUES(?,?)
              ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor, atualizado_em=strftime('%s','now')`).run(chave, String(valor));
}
function log(nivel, origem, mensagem) {
  try { db.prepare('INSERT INTO log(nivel,origem,mensagem) VALUES(?,?,?)').run(nivel, origem, String(mensagem).slice(0, 4000)); } catch {}
  const t = new Date().toISOString();
  console.log(`[${t}] [${nivel}] [${origem}] ${mensagem}`);
}

// defaults
if (!getConfig('sistema_ligado')) setConfig('sistema_ligado', '1');
if (!getConfig('estilo_msg')) setConfig('estilo_msg', 'amigavel');
if (!getConfig('assinatura')) setConfig('assinatura', '');
if (!getConfig('base_url')) setConfig('base_url', 'http://127.0.0.1:3030');

module.exports = { db, getConfig, setConfig, log };
