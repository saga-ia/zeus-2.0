-- estrutura de /opt/jeff-worker/data/worker.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,
  from_id TEXT,
  to_id TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  type TEXT,
  body TEXT,
  has_media INTEGER DEFAULT 0,
  media_path TEXT,
  from_me INTEGER DEFAULT 0,
  author_name TEXT,
  ack INTEGER DEFAULT 0,
  is_group INTEGER DEFAULT 0,
  timestamp TEXT NOT NULL,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, processed_by_agent INTEGER NOT NULL DEFAULT 1, transcription TEXT, transcription_status TEXT, contact_phone TEXT);
CREATE TABLE chats (
  jid TEXT PRIMARY KEY,
  name TEXT,
  is_group INTEGER DEFAULT 0,
  last_message_ts TEXT,
  unread_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE contacts (
  jid TEXT PRIMARY KEY,
  name TEXT,
  push_name TEXT,
  number TEXT,
  is_business INTEGER DEFAULT 0,
  is_blocked INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE send_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error TEXT,
  scheduled_for TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '*',
  token TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE TABLE api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT,
  path TEXT,
  auth_type TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE contact_aliases (
  phone TEXT PRIMARY KEY,
  lid TEXT,
  c_us TEXT,
  name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE contact_settings (
  phone TEXT PRIMARY KEY,
  api_replies_enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  set_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE api_reply_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,
  chat_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reply_body TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE pqv_referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_phone TEXT NOT NULL,           -- quem indicou (phone canônico, só dígitos)
  referrer_name TEXT,                     -- nome de quem indicou (pode estar em contact_aliases)
  referred_name TEXT,                     -- nome do indicado
  referred_phone TEXT,                    -- telefone do indicado (pode ficar null se só veio nome)
  referred_email TEXT,                    -- opcional
  source_message_id TEXT,                 -- messages.message_id da mensagem original
  campaign TEXT NOT NULL DEFAULT 'pqv',   -- identificador da campanha, extensível pra futuras
  notes TEXT,                             -- observações livres (ex.: "veio com contexto adicional")
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, referrer_email TEXT);
CREATE TABLE google_oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'google',
  user_key TEXT NOT NULL DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT NOT NULL,
  scopes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, user_key)
);
CREATE TABLE mchat_processed_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL,
  ig_user_id TEXT,
  ig_username TEXT,
  text TEXT,
  matched_keyword TEXT,
  reply_sent INTEGER DEFAULT 0,
  reply_id TEXT,
  dm_sent INTEGER DEFAULT 0,
  dm_message_id TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE mchat_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE inscricoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  genero TEXT,
  renda_faixa TEXT,
  cidade TEXT,
  origem TEXT DEFAULT 'inscricao_imersao',
  user_agent TEXT,
  ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE sessoes_individuais_outlier (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  nome TEXT,
  programa TEXT DEFAULT 'outlier',
  sessoes_inclusas INTEGER DEFAULT 2,
  sessoes_usadas INTEGER DEFAULT 0,
  sessoes_extras_pagas INTEGER DEFAULT 0,
  observacao TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE sessoes_individuais_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlier_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  agendada_para TEXT,
  realizada_em TEXT,
  observacao TEXT,
  cobrada INTEGER DEFAULT 0,
  valor_cobrado_centavos INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (outlier_id) REFERENCES sessoes_individuais_outlier(id)
);
CREATE TABLE jeff_team (
  phone TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  tone TEXT DEFAULT 'caloroso',
  notes TEXT,
  added_by TEXT DEFAULT 'jeferson',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE jeff_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_phone TEXT NOT NULL,
  description TEXT NOT NULL,
  due_at TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now')),
  last_chased_at TEXT,
  chase_count INTEGER DEFAULT 0,
  completed_at TEXT,
  notes TEXT
);
CREATE TABLE zapsign_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT,
  doc_id TEXT,
  doc_token TEXT,
  signer_id TEXT,
  signer_email TEXT,
  status TEXT,
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
, crm_matched_lead_id INTEGER);
CREATE TABLE asaas_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT,
  payment_id TEXT,
  customer_id TEXT,
  customer_phone TEXT,
  value REAL,
  due_date TEXT,
  status TEXT,
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  wpp_sent INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE asaas_dunning_sent (
  payment_id TEXT NOT NULL,
  day_offset INTEGER NOT NULL,
  customer_phone TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (payment_id, day_offset)
);
CREATE TABLE ig_keyword_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'contains',
  comment_reply TEXT,
  dm_message TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  media_filter TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT
);
CREATE TABLE ig_processed_comments (
  comment_id TEXT PRIMARY KEY,
  media_id TEXT,
  username TEXT,
  text TEXT,
  matched_keyword_id INTEGER,
  comment_replied INTEGER NOT NULL DEFAULT 0,
  dm_sent INTEGER NOT NULL DEFAULT 0,
  dm_error TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE ig_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object TEXT,
  event_type TEXT,
  ig_user_id TEXT,
  sender_id TEXT,
  message_text TEXT,
  comment_id TEXT,
  media_id TEXT,
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
, processed_at TEXT, response_text TEXT, response_error TEXT);
CREATE TABLE agencia_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,                -- 'cigc', 'farias', 'ebc'
  nome TEXT NOT NULL,                       -- nome do cliente ou empresa
  contato_principal_phone TEXT,             -- E.164 sem + (ex 5511...)
  segmento TEXT,                            -- 'eventos/saude', 'conselho', 'forex'
  fase_funil TEXT NOT NULL DEFAULT 'lead'
    CHECK (fase_funil IN ('lead','qualificado','proposta','contratado','ativo','pausado','encerrado')),
  canal_origem TEXT,                        -- 'indicacao', 'instagram', 'organico'
  dono TEXT NOT NULL DEFAULT 'jeff',        -- quem coordena na Alpha
  contexto TEXT,                            -- briefing inicial, texto livre
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE agencia_interacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  canal TEXT NOT NULL                       -- 'wpp','ig','email','telefone','presencial'
    CHECK (canal IN ('wpp','ig','email','telefone','presencial','outro')),
  direcao TEXT NOT NULL
    CHECK (direcao IN ('in','out')),
  autor TEXT,                               -- 'jeff','zeus','sobral','maicon','icaro','smith' (null se direcao=in)
  mensagem TEXT,                            -- texto da interacao
  ref_externa TEXT,                         -- id em messages (worker), id email, etc
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES agencia_clientes(id)
);
CREATE TABLE agencia_tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,                       -- null se tarefa interna sem cliente
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','em_andamento','bloqueada','concluida','cancelada')),
  prioridade TEXT NOT NULL DEFAULT 'media'
    CHECK (prioridade IN ('baixa','media','alta','critica')),
  dono TEXT,                                -- 'jeff','vinicius','sobral','maicon','icaro','smith'
  vencimento TEXT,                          -- datetime
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  concluida_em TEXT,
  FOREIGN KEY (cliente_id) REFERENCES agencia_clientes(id)
);
CREATE TABLE agencia_entregaveis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,                       -- 'copy','design','landing','campanha','esteira','posicionamento'
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado','em_producao','em_revisao','aprovado','entregue','cancelado')),
  responsavel TEXT,                         -- agente ou humano
  link_drive TEXT,                          -- url Drive/Figma/etc
  prazo TEXT,
  entregue_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES agencia_clientes(id)
);
CREATE TABLE agencia_eventos_externos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fonte TEXT NOT NULL,                      -- 'asaas','zapsign','ig','wpp','gmail','manual'
  tipo TEXT NOT NULL,                       -- 'payment.received','doc.signed','comment.received', etc
  ref_externa TEXT,                         -- id no sistema de origem
  payload_json TEXT NOT NULL,
  processado INTEGER NOT NULL DEFAULT 0
    CHECK (processado IN (0,1)),
  processado_em TEXT,
  agente_destino TEXT,                      -- quem deve/processou
  erro TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE agencia_aprovacoes_pendentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agente TEXT NOT NULL,                     -- quem pediu
  acao TEXT NOT NULL,                       -- descricao curta
  contexto TEXT,                            -- motivo, qual cliente, etc
  payload_json TEXT,                        -- params da execucao
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovada','rejeitada','expirada')),
  aprovado_por TEXT,                        -- 'jeff' ou 'vinicius'
  aprovado_em TEXT,
  resultado TEXT,                           -- apos execucao
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE agencia_acoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agente TEXT NOT NULL,                     -- 'zeus','sobral','maicon','icaro','smith','jeff'
  acao TEXT NOT NULL,                       -- descricao curta
  classe TEXT                               -- 'verde','amarelo','vermelho' (Fase 5)
    CHECK (classe IN ('verde','amarelo','vermelho') OR classe IS NULL),
  motivo TEXT,                              -- porque esse agente fez isso
  cliente_id INTEGER,
  payload_json TEXT,                        -- input/output
  resultado TEXT,                           -- 'sucesso','falha','parcial'
  erro TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cliente_id) REFERENCES agencia_clientes(id)
);
CREATE TABLE clickup_tasks_cache (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  space_id TEXT,
  space_name TEXT,
  folder_id TEXT,
  folder_name TEXT,
  list_id TEXT,
  list_name TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  status_type TEXT,
  priority INTEGER,
  url TEXT,
  date_created INTEGER,
  date_updated INTEGER,
  date_done INTEGER,
  date_closed INTEGER,
  due_date INTEGER,
  start_date INTEGER,
  assignees_json TEXT,
  creator_id TEXT,
  parent_id TEXT,
  raw_json TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE clickup_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  event_payload TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  notified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE clickup_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE clickup_chase_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  assignee_id TEXT,
  recipient_phone TEXT NOT NULL,
  chase_level TEXT NOT NULL,
  due_date INTEGER,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE cigc_leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL,
  telefone        TEXT NOT NULL,
  email           TEXT NOT NULL,
  instagram       TEXT,
  dono_clinica    TEXT,     -- 'sim' ou 'nao'
  nome_clinica    TEXT,
  segmento        TEXT,     -- 'multidisciplinar', 'medica', 'odont'
  origem          TEXT DEFAULT 'cigc_cadastrofirms',
  user_agent      TEXT,
  ip              TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE farias_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT NOT NULL,
  interesse TEXT DEFAULT 'conselheiros',
  origem TEXT DEFAULT 'fariassouza.com.br',
  user_agent TEXT,
  ip TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
, device_type TEXT, platform TEXT, connection_type TEXT, city TEXT, creative_id TEXT, appstore_id TEXT);
CREATE TABLE proximo_ciclo_aplicacoes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                  TEXT NOT NULL,
  linkedin              TEXT,
  whatsapp              TEXT NOT NULL,
  email                 TEXT,
  posicionamento        TEXT,     -- CEO/Diretor/Ex-CEO/Outro
  faturamento           TEXT,     -- faixa para empresários
  experiencia           TEXT,     -- faixa para executivos
  momento_profissional  TEXT,     -- persona: Ricardo/Marcos/André
  decisoes_sozinho      TEXT,
  preocupacao_futuro    TEXT,
  por_que_pronto        TEXT,
  capacidade_financeira TEXT,
  dispositivo           TEXT,
  sistema_op            TEXT,
  navegador             TEXT,
  rede                  TEXT,
  ip                    TEXT,
  cidade_pais           TEXT,
  tempo_preenchimento   INTEGER,  -- segundos
  user_agent            TEXT,
  sheets_synced         INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE central_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT,
        company TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE TABLE wa_instance_meta (
        instance_name TEXT PRIMARY KEY,
        friendly_name TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
CREATE INDEX idx_messages_chat_ts ON messages(chat_id, timestamp);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_queue_status ON send_queue(status, priority, id);
CREATE INDEX idx_queue_created ON send_queue(created_at);
CREATE INDEX idx_deliveries_status ON webhook_deliveries(status, next_retry_at);
CREATE INDEX idx_api_logs_created ON api_logs(created_at);
CREATE INDEX idx_messages_unprocessed
  ON messages(chat_id, timestamp)
  WHERE processed_by_agent = 0;
CREATE INDEX idx_contact_aliases_lid ON contact_aliases(lid);
CREATE INDEX idx_contact_aliases_cus ON contact_aliases(c_us);
CREATE INDEX idx_messages_contact_phone ON messages(contact_phone);
CREATE INDEX idx_api_reply_log_phone ON api_reply_log(phone, created_at DESC);
CREATE INDEX idx_api_reply_log_status ON api_reply_log(status, created_at DESC);
CREATE INDEX idx_pqv_referrals_referrer
  ON pqv_referrals(referrer_phone, created_at DESC);
CREATE INDEX idx_pqv_referrals_campaign
  ON pqv_referrals(campaign, created_at DESC);
CREATE INDEX idx_google_oauth_tokens_provider_user
  ON google_oauth_tokens(provider, user_key);
CREATE INDEX idx_mchat_comment_id ON mchat_processed_comments(comment_id);
CREATE INDEX idx_mchat_username ON mchat_processed_comments(ig_username);
CREATE INDEX idx_inscricoes_phone ON inscricoes(telefone);
CREATE INDEX idx_inscricoes_created ON inscricoes(created_at);
CREATE UNIQUE INDEX idx_sessoes_phone ON sessoes_individuais_outlier(phone);
CREATE INDEX idx_jeff_followups_status ON jeff_followups(status, due_at);
CREATE INDEX idx_zapsign_events_received ON zapsign_events(received_at DESC);
CREATE INDEX idx_zapsign_events_doc ON zapsign_events(doc_id);
CREATE INDEX idx_zapsign_events_event ON zapsign_events(event);
CREATE INDEX idx_asaas_events_received ON asaas_events(received_at DESC);
CREATE INDEX idx_asaas_events_payment ON asaas_events(payment_id);
CREATE INDEX idx_asaas_events_event ON asaas_events(event);
CREATE INDEX idx_ig_processed_media ON ig_processed_comments(media_id);
CREATE INDEX idx_ig_processed_at ON ig_processed_comments(processed_at DESC);
CREATE INDEX idx_ig_webhook_received ON ig_webhook_events(received_at DESC);
CREATE INDEX idx_agencia_clientes_fase  ON agencia_clientes(fase_funil);
CREATE INDEX idx_agencia_clientes_dono  ON agencia_clientes(dono);
CREATE INDEX idx_agencia_interacoes_cliente_ts ON agencia_interacoes(cliente_id, ts DESC);
CREATE INDEX idx_agencia_interacoes_canal      ON agencia_interacoes(canal);
CREATE INDEX idx_agencia_tarefas_status   ON agencia_tarefas(status, vencimento);
CREATE INDEX idx_agencia_tarefas_dono     ON agencia_tarefas(dono, status);
CREATE INDEX idx_agencia_tarefas_cliente  ON agencia_tarefas(cliente_id);
CREATE INDEX idx_agencia_entregaveis_cliente_status ON agencia_entregaveis(cliente_id, status);
CREATE INDEX idx_agencia_entregaveis_responsavel    ON agencia_entregaveis(responsavel);
CREATE INDEX idx_agencia_eventos_pend ON agencia_eventos_externos(processado, fonte, ts);
CREATE INDEX idx_agencia_eventos_ref  ON agencia_eventos_externos(fonte, ref_externa);
CREATE INDEX idx_agencia_aprov_status ON agencia_aprovacoes_pendentes(status, created_at);
CREATE INDEX idx_agencia_log_agente_ts  ON agencia_acoes_log(agente, ts DESC);
CREATE INDEX idx_agencia_log_cliente_ts ON agencia_acoes_log(cliente_id, ts DESC);
CREATE INDEX idx_clickup_tasks_status ON clickup_tasks_cache(status);
CREATE INDEX idx_clickup_tasks_due ON clickup_tasks_cache(due_date);
CREATE INDEX idx_clickup_tasks_list ON clickup_tasks_cache(list_id);
CREATE INDEX idx_clickup_tasks_updated ON clickup_tasks_cache(date_updated);
CREATE INDEX idx_clickup_events_task ON clickup_events(task_id);
CREATE INDEX idx_clickup_events_notified ON clickup_events(notified);
CREATE INDEX idx_clickup_chase_task ON clickup_chase_log(task_id);
CREATE INDEX idx_clickup_chase_sent ON clickup_chase_log(sent_at);
CREATE INDEX idx_cigc_leads_telefone  ON cigc_leads(telefone);
CREATE INDEX idx_cigc_leads_created   ON cigc_leads(created_at DESC);
CREATE INDEX idx_pca_whatsapp  ON proximo_ciclo_aplicacoes(whatsapp);
CREATE INDEX idx_pca_created   ON proximo_ciclo_aplicacoes(created_at DESC);
CREATE INDEX idx_ig_events_unprocessed
  ON ig_webhook_events(event_type, processed_at) WHERE processed_at IS NULL;
CREATE INDEX idx_central_users_email ON central_users(email);
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (1, '001_initial.sql', '2026-04-19 15:31:03');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (2, '002_agent_processing.sql', '2026-04-19 16:39:59');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (3, '003_transcription.sql', '2026-04-19 16:39:59');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (4, '004_contact_aliases.sql', '2026-04-19 16:50:23');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (5, '005_api_reply.sql', '2026-04-19 17:08:24');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (6, '006_pqv_referrals.sql', '2026-04-21 18:02:22');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (7, '007_pqv_referrer_email.sql', '2026-04-21 19:17:20');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (8, '008_google_oauth.sql', '2026-04-24 02:08:25');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (9, '009_mchat.sql', '2026-04-26 01:25:42');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (10, '010_inscricoes.sql', '2026-04-26 16:17:58');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (11, '011_sessoes_outlier.sql', '2026-04-27 01:45:16');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (12, '012_agencia.sql', '2026-05-12 01:21:30');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (13, '013_cigc_leads.sql', '2026-05-17 19:09:53');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (14, '014_clickup.sql', '2026-05-17 19:09:53');
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (15, '015_proximo_ciclo.sql', '2026-06-12 17:13:57');
COMMIT;
