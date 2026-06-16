'use strict';
// Aplica schema do form dinâmico no DB já aberto. Idempotente.
module.exports = function migrate(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS form_sections (
    id INTEGER PRIMARY KEY,
    ordem INTEGER NOT NULL,
    tag TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS form_questions (
    id INTEGER PRIMARY KEY,
    section_id INTEGER NOT NULL,
    ordem INTEGER NOT NULL,
    qkey TEXT NOT NULL,
    label TEXT NOT NULL,
    hint TEXT,
    qtype TEXT NOT NULL DEFAULT 'text',
    required INTEGER NOT NULL DEFAULT 0,
    min_length INTEGER NOT NULL DEFAULT 0,
    big INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (section_id) REFERENCES form_sections(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS form_sessions (
    id TEXT PRIMARY KEY,
    slug TEXT,
    client_id INTEGER,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    last_section INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT,
    user_agent TEXT,
    ip TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS form_responses (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    section INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    question_label TEXT,
    value TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES form_sessions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_form_questions_section ON form_questions(section_id, ordem);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_form_sessions_slug ON form_sessions(slug) WHERE slug IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_form_responses_session ON form_responses(session_id, question_key, version);
  `);

  const clientCols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
  if (!clientCols.includes('onboarding_slug')) {
    db.exec("ALTER TABLE clients ADD COLUMN onboarding_slug TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_onboarding_slug ON clients(onboarding_slug) WHERE onboarding_slug IS NOT NULL");
  }
  if (!clientCols.includes('onboarding_session_id')) {
    db.exec("ALTER TABLE clients ADD COLUMN onboarding_session_id TEXT");
  }
  if (!clientCols.includes('qa_token')) {
    db.exec("ALTER TABLE clients ADD COLUMN qa_token TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_qa_token ON clients(qa_token) WHERE qa_token IS NOT NULL");
  }
  if (!clientCols.includes('external_url')) {
    db.exec("ALTER TABLE clients ADD COLUMN external_url TEXT");
  }

  // Uploads de documentos do painel (Estratégia, Início, etc)
  db.exec(`
  CREATE TABLE IF NOT EXISTS panel_uploads (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT,
    mimetype TEXT,
    size INTEGER,
    uploaded_by_kind TEXT,
    uploaded_by_id INTEGER,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_panel_uploads_client_scope ON panel_uploads(client_id, scope);
  `);
  // backfill qa_token pra clientes sem token
  const need = db.prepare("SELECT id FROM clients WHERE qa_token IS NULL OR qa_token = ''").all();
  if (need.length) {
    const upd = db.prepare('UPDATE clients SET qa_token = ? WHERE id = ?');
    const crypto = require('crypto');
    for (const c of need) upd.run(crypto.randomBytes(16).toString('hex'), c.id);
  }

  // Painel personalizado por cliente — template padrão + login do cliente + state
  db.exec(`
  CREATE TABLE IF NOT EXISTS doc_template (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    blocks_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS client_users (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_client_users_email_per_client ON client_users(client_id, lower(email));
  CREATE TABLE IF NOT EXISTS client_doc_state (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    block_key TEXT NOT NULL,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_client_doc_state_uniq ON client_doc_state(client_id, kind, block_key);
  `);

  // garante 1 row em doc_template
  const tpl = db.prepare("SELECT id FROM doc_template WHERE id = 1").get();
  if (!tpl) db.prepare("INSERT INTO doc_template (id, blocks_json) VALUES (1, '[]')").run();
};
