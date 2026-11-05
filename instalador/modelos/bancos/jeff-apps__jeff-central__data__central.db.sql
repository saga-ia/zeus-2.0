-- estrutura de /opt/jeff-apps/jeff-central/data/central.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, agent_id TEXT, context TEXT, user_email TEXT);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  attachments TEXT,
  status TEXT DEFAULT 'done',
  created_at INTEGER NOT NULL, finished_at INTEGER, feedback INTEGER, feedback_nota TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  kind TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  prompt TEXT,
  icebreakers TEXT,
  skills TEXT,
  warn TEXT,
  model TEXT,
  in_workspace INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, created_by TEXT);
CREATE TABLE agent_files (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  originalname TEXT,
  mime TEXT,
  size INTEGER,
  chars INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'privada',
  orchestrator_prompt TEXT,
  agent_ids TEXT NOT NULL DEFAULT '[]',
  icebreakers TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE team_runs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, user_email TEXT);
CREATE TABLE team_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  agent_id TEXT,
  agent_name TEXT,
  stage INTEGER,
  task TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE pdis (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL,
  role TEXT,
  manager TEXT,
  cycle_start TEXT,
  cycle_end TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  template_id TEXT,
  summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, title TEXT, target_role TEXT, team TEXT, cadence TEXT NOT NULL DEFAULT 'quinzenal');
CREATE TABLE pdi_goals (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  title TEXT NOT NULL,
  competency TEXT,
  type TEXT NOT NULL DEFAULT 'tecnica',
  description TEXT,
  success_criteria TEXT,
  due_date TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE pdi_actions (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '70',
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
, format TEXT, status TEXT, note TEXT);
CREATE TABLE pdi_checkins (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  date TEXT NOT NULL,
  author TEXT,
  mood INTEGER,
  note TEXT,
  progress INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE pdi_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  role_hint TEXT,
  goals TEXT NOT NULL DEFAULT '[]',
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, trail TEXT, tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE config_kv (
  section TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE TABLE org_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'membro',
  area_id TEXT,
  team_id TEXT,
  cargo_id TEXT,
  leader_id TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, invite_hash TEXT, invite_expires INTEGER, invited_by TEXT, accepted_at INTEGER, last_seen INTEGER, avatar TEXT, whatsapp TEXT);
CREATE TABLE org_units (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  area_id TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE config_audit (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  who TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE w_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prio TEXT NOT NULL DEFAULT 'media',
  due TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE w_tickets (
  id TEXT PRIMARY KEY,
  num INTEGER NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'duvida',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'aberto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE w_ticket_msgs (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'regra',
  name TEXT,
  grp TEXT,
  instruction TEXT,
  desc TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE kb_docs (
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
, folder_id TEXT);
CREATE TABLE kb_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE VIRTUAL TABLE kb_fts USING fts5(text, doc_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE okr_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE okr_objectives (
  id TEXT PRIMARY KEY,
  cycle_id TEXT,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  area_id TEXT,
  team_id TEXT,
  owner TEXT,
  period TEXT NOT NULL DEFAULT 'trimestral',
  start_date TEXT,
  end_date TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE okr_krs (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL,
  title TEXT NOT NULL,
  from_value REAL NOT NULL DEFAULT 0,
  to_value REAL NOT NULL DEFAULT 100,
  current_value REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '%',
  due_date TEXT,
  owner TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE okr_checkins (
  id TEXT PRIMARY KEY,
  kr_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL NOT NULL,
  note TEXT,
  author TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE pdi_competencies (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  name TEXT NOT NULL,
  level_from INTEGER NOT NULL DEFAULT 3,
  level_to INTEGER NOT NULL DEFAULT 5,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE pdi_evidences (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  action_id TEXT,
  title TEXT NOT NULL,
  url TEXT,
  note TEXT,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE pdi_feedback (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  from_who TEXT,
  to_who TEXT,
  message TEXT NOT NULL,
  reply TEXT,
  replied_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE pdi_history (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  who TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE rotinas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  agent_id TEXT,
  skill_id TEXT,
  freq TEXT NOT NULL DEFAULT 'diaria',
  hora TEXT NOT NULL DEFAULT '08:00',
  dias TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  dia_mes INTEGER NOT NULL DEFAULT 1,
  cada_horas INTEGER NOT NULL DEFAULT 6,
  quando TEXT,
  entrega TEXT NOT NULL DEFAULT 'chat',
  destino TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, tools TEXT, restrita INTEGER NOT NULL DEFAULT 0, created_by TEXT);
CREATE TABLE rotina_runs (
  id TEXT PRIMARY KEY,
  rotina_id TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'agenda',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL DEFAULT 'rodando',
  output TEXT,
  error TEXT,
  session_id TEXT,
  entrega TEXT,
  destino TEXT
);
CREATE TABLE agent_shares (agent_id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'todos', users TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);
CREATE TABLE team_shares (team_id TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'todos', users TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);
CREATE TABLE team_reviews (step_id TEXT NOT NULL, idx INTEGER NOT NULL, title TEXT, status TEXT NOT NULL DEFAULT 'pendente', note TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (step_id, idx));
CREATE TABLE team_plans (step_id TEXT PRIMARY KEY, okr_id TEXT, okr_title TEXT, tasks INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE growth_actions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tipo TEXT NOT NULL, nivel TEXT NOT NULL, obj_id TEXT NOT NULL,
  obj_nome TEXT, antes TEXT, depois TEXT, motivo TEXT, user_email TEXT, ok INTEGER NOT NULL, erro TEXT, created_at INTEGER NOT NULL);
CREATE TABLE vendas_diag (chave TEXT PRIMARY KEY, tipo TEXT NOT NULL, de TEXT NOT NULL, ate TEXT NOT NULL, pedido TEXT,
  resumo TEXT, blocos TEXT, texto TEXT, consultas TEXT, gerado_em INTEGER NOT NULL, gerado_por TEXT);
CREATE TABLE vendas_aud (chave TEXT PRIMARY KEY, modo TEXT NOT NULL, alvo TEXT, rotulo TEXT, de TEXT, ate TEXT,
  resultado TEXT NOT NULL, consultas TEXT, gerado_em INTEGER NOT NULL, gerado_por TEXT);
CREATE TABLE vendas_chat (id TEXT PRIMARY KEY, conversa TEXT NOT NULL, pergunta TEXT NOT NULL, resposta TEXT, consultas TEXT,
  status TEXT NOT NULL, criado_em INTEGER NOT NULL, por TEXT);
CREATE TABLE notificacoes (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT,
  link TEXT,
  chave TEXT,
  lida INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE memorias (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  texto TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'conversa',
  session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE kb_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE social_marcas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  logo TEXT,
  refs TEXT NOT NULL DEFAULT '[]',
  completo INTEGER NOT NULL DEFAULT 0,
  por TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE social_criacoes (
  id TEXT PRIMARY KEY,
  marca_id TEXT NOT NULL,
  formato TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  versoes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'rascunho',
  etapa TEXT,
  erro TEXT,
  por TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE team_aprovacoes (step_id TEXT NOT NULL, bloco INTEGER NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', post_id INTEGER, quando TEXT, conta TEXT, note TEXT, erro TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (step_id, bloco, idx));
CREATE TABLE chat_aprovacoes (message_id TEXT NOT NULL, bloco INTEGER NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', post_id INTEGER, quando TEXT, conta TEXT, note TEXT, erro TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (message_id, bloco, idx));
CREATE TABLE ig_agent_kb (agent_id INTEGER PRIMARY KEY, modo TEXT NOT NULL DEFAULT 'nenhuma', pastas TEXT NOT NULL DEFAULT '[]', updated_at INTEGER);
CREATE TABLE ia_imagem_gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  em INTEGER NOT NULL,              -- ms
  origem TEXT NOT NULL,             -- design (Central), ilustra, editar-imagem, historico
  motor TEXT NOT NULL,              -- gemini | openai
  modelo TEXT,
  operacao TEXT,                    -- gerar | editar
  custo_usd REAL NOT NULL,
  estimado INTEGER NOT NULL DEFAULT 1,
  tokens_in INTEGER, tokens_out INTEGER,
  criacao_id TEXT, usuario TEXT, detalhe TEXT
);
CREATE TABLE design_feedback (
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
CREATE TABLE linkedin_posts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'rascunho',
  texto TEXT NOT NULL DEFAULT '',
  imagens TEXT NOT NULL DEFAULT '[]',
  agendado_para INTEGER,
  publicado_em INTEGER,
  urn TEXT,
  url TEXT,
  erro TEXT,
  origem TEXT,
  por TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, pilar TEXT, tipo TEXT NOT NULL DEFAULT 'post', formato TEXT, sugerido_para INTEGER);
CREATE TABLE agent_channels (
  canal TEXT NOT NULL,
  alvo TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  opcoes TEXT NOT NULL DEFAULT '{}',
  antes TEXT,
  sync_at INTEGER,
  erro TEXT,
  por TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (canal, alvo)
);
CREATE TABLE agent_myig (agent_id TEXT PRIMARY KEY, myig_id INTEGER NOT NULL);
CREATE TABLE linkedin_engajamento (post_id TEXT PRIMARY KEY, dados TEXT NOT NULL, erro TEXT, atualizado_em INTEGER NOT NULL);
CREATE TABLE linkedin_estrategia (id INTEGER PRIMARY KEY CHECK (id = 1), dados TEXT NOT NULL, ultimo_auto TEXT, por TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE jarvis_config (chave TEXT PRIMARY KEY, valor TEXT, updated_at INTEGER);
CREATE INDEX idx_msg_session ON messages(session_id, created_at);
CREATE INDEX idx_agent_files ON agent_files(agent_id, created_at);
CREATE INDEX idx_sess_agent ON sessions(agent_id, updated_at);
CREATE INDEX idx_team_runs ON team_runs(team_id, updated_at);
CREATE INDEX idx_team_steps ON team_steps(run_id, turn, seq);
CREATE INDEX idx_pdi_goals ON pdi_goals(pdi_id, sort);
CREATE INDEX idx_pdi_actions ON pdi_actions(goal_id, sort);
CREATE INDEX idx_pdi_checkins ON pdi_checkins(pdi_id, date);
CREATE INDEX idx_config_audit ON config_audit(at);
CREATE INDEX idx_w_ticket_msgs ON w_ticket_msgs(ticket_id, created_at);
CREATE INDEX idx_kb_chunks_doc ON kb_chunks(doc_id, seq);
CREATE INDEX idx_okr_obj_cycle ON okr_objectives(cycle_id, sort);
CREATE INDEX idx_okr_krs ON okr_krs(objective_id, sort);
CREATE INDEX idx_okr_checkins ON okr_checkins(kr_id, date);
CREATE INDEX idx_pdi_comp ON pdi_competencies(pdi_id, sort);
CREATE INDEX idx_pdi_evid ON pdi_evidences(pdi_id, created_at);
CREATE INDEX idx_pdi_fb ON pdi_feedback(pdi_id, created_at);
CREATE INDEX idx_pdi_hist ON pdi_history(pdi_id, at);
CREATE INDEX idx_rotina_runs ON rotina_runs(rotina_id, started_at DESC);
CREATE INDEX vendas_chat_conversa ON vendas_chat (conversa, criado_em);
CREATE INDEX idx_sess_user ON sessions(user_email, agent_id, updated_at);
CREATE INDEX idx_notif_user ON notificacoes(user_email, lida, created_at);
CREATE INDEX idx_notif_chave ON notificacoes(chave);
CREATE INDEX idx_mem_user ON memorias(user_email, updated_at);
CREATE INDEX idx_kb_folders_parent ON kb_folders(parent_id);
CREATE INDEX idx_social_criacoes_marca ON social_criacoes(marca_id, updated_at);
CREATE INDEX idx_ia_gastos_em ON ia_imagem_gastos(em);
CREATE INDEX idx_design_feedback_criacao ON design_feedback(criacao_id, updated_at);
CREATE INDEX idx_li_status ON linkedin_posts(status, agendado_para);
CREATE INDEX idx_agent_channels_agent ON agent_channels(agent_id);
COMMIT;
