-- ZeusChatIG — schema multi-tenant
-- Cada tenant = 1 cliente da Alpha Digital que conectou o IG dele

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Tenants (clientes)
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | onboarding | active | paused
  ig_user_id TEXT UNIQUE,                 -- id retornado por /me quando OAuth completa
  ig_username TEXT,
  ig_account_type TEXT,
  ig_access_token TEXT,                   -- IGAA... long-lived (60d)
  ig_token_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tenants_ig_user ON tenants(ig_user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Contatos (leads do IG que interagiram)
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ig_sender_id TEXT NOT NULL,        -- IGSID do lead
  ig_username TEXT,
  ig_name TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_flow_id INTEGER,
  last_flow_state TEXT,              -- JSON com o estado atual da execução do fluxo
  paused_until TEXT,                 -- se operador humano assumiu, pausa fluxo até esta data
  tags TEXT NOT NULL DEFAULT '[]',   -- JSON array
  attributes TEXT NOT NULL DEFAULT '{}', -- JSON custom fields
  UNIQUE(tenant_id, ig_sender_id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);

-- Fluxos (canvas de nós)
CREATE TABLE IF NOT EXISTS flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  definition TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}', -- React Flow JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flows_tenant ON flows(tenant_id, active);

-- Gatilhos (o que dispara qual fluxo)
CREATE TABLE IF NOT EXISTS triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- keyword | first_message | comment_on_post | referral
  config TEXT NOT NULL DEFAULT '{}', -- JSON: {"keywords":["preço","valor"]} | {"post_id":"..."} | {}
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_triggers_tenant ON triggers(tenant_id, active, priority DESC);

-- Mensagens (histórico do IG in/out)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL, -- in | out
  channel TEXT NOT NULL DEFAULT 'ig_dm',
  ig_message_id TEXT,
  text TEXT,
  media_url TEXT,
  raw_json TEXT,
  sent_by TEXT, -- 'flow' | 'operator' | 'zeus' | 'system'
  flow_id INTEGER REFERENCES flows(id) ON DELETE SET NULL,
  node_id TEXT, -- id do nó que gerou (se automatizado)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id, created_at DESC);

-- Fila de execução de fluxos (async)
CREATE TABLE IF NOT EXISTS flow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  trigger_id INTEGER REFERENCES triggers(id) ON DELETE SET NULL,
  current_node TEXT,
  state TEXT NOT NULL DEFAULT '{}', -- JSON com variáveis do run
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | waiting_reply | done | error
  next_run_at TEXT,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flow_runs_pending ON flow_runs(status, next_run_at) WHERE status IN ('pending','waiting_reply');

-- Webhook events crus (log/replay)
CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  event_type TEXT,
  sender_id TEXT,
  ig_user_id TEXT,
  raw_json TEXT NOT NULL,
  processed_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_unprocessed ON webhook_events(processed_at) WHERE processed_at IS NULL;

-- Admin users (login no dashboard)
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- admin | operator
  tenant_scope INTEGER REFERENCES tenants(id) ON DELETE CASCADE, -- NULL=todos
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessões
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Config global (secrets do app IG, verify token webhook, etc)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- MYIG: Agentes de IA que respondem DMs Instagram via claude -p
-- ============================================================

-- Agentes de IA
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT 'robot',
  color TEXT DEFAULT '#7c3aed',
  system_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'claude-opus-4-7',
  temperature REAL,
  max_turns INTEGER DEFAULT 1,
  timeout_seconds INTEGER DEFAULT 120,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id, active);

-- Regras de roteamento (qual agente atende qual mensagem)
CREATE TABLE IF NOT EXISTS agent_routing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL, -- 'default' | 'keyword' | 'first_message' | 'comment_dm' | 'sender_username'
  rule_value TEXT,         -- keywords separadas por vírgula, username, etc
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_routing_tenant ON agent_routing_rules(tenant_id, active, priority DESC);

-- Threads (conversa entre lead e conta IG). Uma linha por contato.
CREATE TABLE IF NOT EXISTS ig_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_direction TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_threads_tenant ON ig_threads(tenant_id, last_message_at DESC);

-- Runs do claude -p (log de execução, permite live view)
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id INTEGER REFERENCES ig_threads(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  webhook_event_id INTEGER REFERENCES webhook_events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | error | timeout
  input_text TEXT,
  output_text TEXT,
  stdout TEXT,
  stderr TEXT,
  model TEXT,
  duration_ms INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_tenant ON agent_runs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_thread ON agent_runs(thread_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs(status);
