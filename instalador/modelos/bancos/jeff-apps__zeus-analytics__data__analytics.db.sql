-- estrutura de /opt/jeff-apps/zeus-analytics/data/analytics.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  gerente_phone TEXT,              -- numero (e164) que recebe alertas; opcional
  alerta_device_id INTEGER,        -- device usado pra enviar alerta (FK adiada)
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  apelido TEXT NOT NULL,           -- "Vendedor 1", "Atendimento SP", etc
  numero TEXT,                     -- preenche apos pareamento
  session_id TEXT NOT NULL UNIQUE, -- diretorio LocalAuth: data/sessions/<session_id>/
  status TEXT NOT NULL DEFAULT 'initializing',
    -- initializing | qr | authenticated | ready | disconnected | auth_failure
  ultimo_qr TEXT,                  -- base64 do QR atual (svg)
  ultimo_qr_em TEXT,
  conectado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE vendedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  apelido TEXT,
  email TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE vendedor_device (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  turno_inicio TEXT,               -- 'HH:MM' ou NULL (always)
  turno_fim TEXT,
  dias_semana TEXT,                -- '1,2,3,4,5' (1=seg) ou NULL
  inicio_validade TEXT,            -- ISO date
  fim_validade TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE contatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,             -- e164 (5511999999999)
  nome TEXT,
  push_name TEXT,
  primeira_msg_em TEXT,
  ultima_msg_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, phone)
);
CREATE TABLE mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  contato_id INTEGER NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  vendedor_id INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  message_id TEXT NOT NULL,        -- ID do WhatsApp
  direction TEXT NOT NULL,         -- 'in' (cliente) | 'out' (vendedor)
  type TEXT,                       -- chat | audio | image | document | ...
  body TEXT,
  audio_transcript TEXT,
  has_media INTEGER DEFAULT 0,
  is_group INTEGER DEFAULT 0,
  ts TEXT NOT NULL,                -- UTC ISO
  processado INTEGER NOT NULL DEFAULT 0,  -- 0 = aguarda triagem
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(device_id, message_id)
);
CREATE TABLE triagem_mensagem (
  mensagem_id INTEGER PRIMARY KEY REFERENCES mensagens(id) ON DELETE CASCADE,
  sentimento TEXT,                 -- positivo | neutro | negativo | duvida | objecao
  intencao TEXT,                   -- saudacao | duvida_produto | preco | fechamento | reclamacao | ...
  sinais_json TEXT,                -- JSON {sinal_compra, urgencia, ...}
  analisado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contato_id INTEGER NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  vendedor_id INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  inicio TEXT NOT NULL,
  fim TEXT,
  total_msgs INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberta',  -- aberta | fechada
  desfecho TEXT,                   -- venda | sem_resposta | abandono_cliente | abandono_vendedor | reclamacao | indefinido
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE scorecard_conversa (
  conversa_id INTEGER PRIMARY KEY REFERENCES conversas(id) ON DELETE CASCADE,
  nota REAL NOT NULL,              -- 0..10
  resumo TEXT,
  pontos_fortes_json TEXT,
  falhas_json TEXT,
  sugestoes_json TEXT,
  tempo_resp_medio_seg INTEGER,
  desfecho_predito TEXT,
  analisado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE scorecard_vendedor_diario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendedor_id INTEGER NOT NULL REFERENCES vendedores(id) ON DELETE CASCADE,
  data TEXT NOT NULL,              -- YYYY-MM-DD (BRT)
  total_conversas INTEGER DEFAULT 0,
  nota_media REAL,
  tempo_resp_medio_seg INTEGER,
  taxa_fechamento REAL,
  UNIQUE(vendedor_id, data)
);
CREATE TABLE scripts_vencedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trecho TEXT NOT NULL,
  contexto TEXT,                   -- "uso quando cliente diz X"
  taxa_conversao_associada REAL,
  exemplo_conversa_id INTEGER REFERENCES conversas(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,              -- lead_sem_resposta | nota_baixa | reclamacao | oportunidade | ...
  severidade TEXT NOT NULL DEFAULT 'info',  -- info | warn | critico
  titulo TEXT NOT NULL,
  payload_json TEXT,
  enviado_em TEXT,
  visualizado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE configuracoes_avaliacao (
  tenant_id INTEGER PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  manual_atendimento_txt TEXT,     -- vazio inicialmente; IA infere
  criterios_json TEXT,
  prazo_resposta_seg INTEGER DEFAULT 600,   -- 10min default
  horario_atendimento_inicio TEXT DEFAULT '08:00',
  horario_atendimento_fim TEXT DEFAULT '20:00',
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE analyzer_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,              -- triagem_msg | scorecard_conversa | agregado_diario
  ref_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,
  prioridade INTEGER DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  tentativas INTEGER DEFAULT 0,
  erro TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  processado_em TEXT
);
CREATE INDEX idx_devices_tenant ON devices(tenant_id);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_vendedores_tenant ON vendedores(tenant_id);
CREATE INDEX idx_vd_vendedor ON vendedor_device(vendedor_id);
CREATE INDEX idx_vd_device ON vendedor_device(device_id);
CREATE INDEX idx_contatos_tenant_phone ON contatos(tenant_id, phone);
CREATE INDEX idx_msg_tenant_ts ON mensagens(tenant_id, ts);
CREATE INDEX idx_msg_contato_ts ON mensagens(contato_id, ts);
CREATE INDEX idx_msg_unproc ON mensagens(processado, id) WHERE processado=0;
CREATE INDEX idx_msg_vendedor ON mensagens(vendedor_id);
CREATE INDEX idx_conv_tenant ON conversas(tenant_id, inicio);
CREATE INDEX idx_conv_status ON conversas(status);
CREATE INDEX idx_scv_tenant_data ON scorecard_vendedor_diario(tenant_id, data);
CREATE INDEX idx_alertas_tenant ON alertas(tenant_id, criado_em);
CREATE INDEX idx_aq_status ON analyzer_queue(status, prioridade, id);
INSERT OR IGNORE INTO "schema_migrations" ("version", "filename", "applied_at") VALUES (1, '001_initial.sql', '2026-06-29 02:11:07');
COMMIT;
