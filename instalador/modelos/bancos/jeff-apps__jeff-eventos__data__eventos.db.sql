-- estrutura de /opt/jeff-apps/jeff-eventos/data/eventos.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE eventos (
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
CREATE TABLE cadencias (
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
CREATE TABLE participantes (
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
CREATE TABLE envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cadencia_id INTEGER NOT NULL REFERENCES cadencias(id) ON DELETE CASCADE,
  participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | enviado | erro | cancelado
  enviar_em INTEGER NOT NULL,                -- unix ts
  enviado_em INTEGER,
  erro TEXT DEFAULT '',
  UNIQUE(cadencia_id, participante_id)
);
CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE wa_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  modo TEXT NOT NULL DEFAULT 'token',       -- token | qr
  worker_url TEXT DEFAULT 'http://127.0.0.1:3002',
  worker_token TEXT DEFAULT '',
  qr_status TEXT DEFAULT 'desconectado',
  qr_payload TEXT DEFAULT '',
  atualizado_em INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  nivel TEXT NOT NULL,
  origem TEXT NOT NULL,
  mensagem TEXT NOT NULL
);
COMMIT;
