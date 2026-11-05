-- estrutura de /opt/jeff-apps/jeff-alpha-clientes/data/clientes.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, status TEXT NOT NULL DEFAULT 'active');
CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'ativo',
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  visao_geral_json TEXT,
  estrategia_json TEXT,
  ads_json TEXT,
  site_json TEXT,
  contrato_json TEXT,
  financeiro_json TEXT,
  atendimento_json TEXT,
  tarefas_json TEXT,
  anexos_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, onboarding_slug TEXT, onboarding_session_id TEXT, qa_token TEXT, external_url TEXT);
CREATE TABLE leads (
  id INTEGER PRIMARY KEY,
  business_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  segment TEXT,
  monthly_revenue TEXT,
  current_marketing TEXT,
  goals TEXT,
  notes TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_client_id INTEGER,
  rejected_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  mimetype TEXT,
  size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT,
  target TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE password_resets (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE client_form_tokens (
    id INTEGER PRIMARY KEY,
    client_id INTEGER,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE form_sections (
  id INTEGER PRIMARY KEY,
  ordem INTEGER NOT NULL,
  tag TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE form_questions (
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
CREATE TABLE form_sessions (
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
CREATE TABLE form_responses (
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
CREATE TABLE doc_template (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    blocks_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by INTEGER
  );
CREATE TABLE client_users (
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
CREATE TABLE client_doc_state (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    block_key TEXT NOT NULL,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
  );
CREATE TABLE panel_uploads (
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
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_attachments_client ON attachments(client_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_form_questions_section ON form_questions(section_id, ordem);
CREATE UNIQUE INDEX idx_form_sessions_slug ON form_sessions(slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_form_responses_session ON form_responses(session_id, question_key, version);
CREATE UNIQUE INDEX idx_clients_onboarding_slug ON clients(onboarding_slug) WHERE onboarding_slug IS NOT NULL;
CREATE UNIQUE INDEX idx_clients_qa_token ON clients(qa_token) WHERE qa_token IS NOT NULL;
CREATE UNIQUE INDEX idx_client_users_email_per_client ON client_users(client_id, lower(email));
CREATE UNIQUE INDEX idx_client_doc_state_uniq ON client_doc_state(client_id, kind, block_key);
CREATE INDEX idx_panel_uploads_client_scope ON panel_uploads(client_id, scope);
COMMIT;
