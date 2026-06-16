-- DRAFT — Fase 2 da agencia
-- Migration 012_agencia.sql (a aplicar apos OK do Jeff)
-- 7 tabelas + indices, prefixo agencia_
-- Nao altera nada existente; so adiciona.

-- =====================================================
-- 1) agencia_clientes — cadastro vivo de cliente
-- =====================================================
CREATE TABLE IF NOT EXISTS agencia_clientes (
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
CREATE INDEX IF NOT EXISTS idx_agencia_clientes_fase  ON agencia_clientes(fase_funil);
CREATE INDEX IF NOT EXISTS idx_agencia_clientes_dono  ON agencia_clientes(dono);

-- =====================================================
-- 2) agencia_interacoes — toda msg in/out por cliente
-- =====================================================
CREATE TABLE IF NOT EXISTS agencia_interacoes (
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
CREATE INDEX IF NOT EXISTS idx_agencia_interacoes_cliente_ts ON agencia_interacoes(cliente_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_agencia_interacoes_canal      ON agencia_interacoes(canal);

-- =====================================================
-- 3) agencia_tarefas — o que esta em aberto
-- =====================================================
CREATE TABLE IF NOT EXISTS agencia_tarefas (
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
CREATE INDEX IF NOT EXISTS idx_agencia_tarefas_status   ON agencia_tarefas(status, vencimento);
CREATE INDEX IF NOT EXISTS idx_agencia_tarefas_dono     ON agencia_tarefas(dono, status);
CREATE INDEX IF NOT EXISTS idx_agencia_tarefas_cliente  ON agencia_tarefas(cliente_id);

-- =====================================================
-- 4) agencia_entregaveis — pecas que a Alpha entrega
-- =====================================================
CREATE TABLE IF NOT EXISTS agencia_entregaveis (
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
CREATE INDEX IF NOT EXISTS idx_agencia_entregaveis_cliente_status ON agencia_entregaveis(cliente_id, status);
CREATE INDEX IF NOT EXISTS idx_agencia_entregaveis_responsavel    ON agencia_entregaveis(responsavel);

-- =====================================================
-- 5) agencia_eventos_externos — webhooks e gatilhos
-- =====================================================
CREATE TABLE IF NOT EXISTS agencia_eventos_externos (
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
CREATE INDEX IF NOT EXISTS idx_agencia_eventos_pend ON agencia_eventos_externos(processado, fonte, ts);
CREATE INDEX IF NOT EXISTS idx_agencia_eventos_ref  ON agencia_eventos_externos(fonte, ref_externa);

-- =====================================================
-- 6) agencia_aprovacoes_pendentes — fila vermelha (Fase 5)
-- =====================================================
CREATE TABLE IF NOT EXISTS agencia_aprovacoes_pendentes (
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
CREATE INDEX IF NOT EXISTS idx_agencia_aprov_status ON agencia_aprovacoes_pendentes(status, created_at);

-- =====================================================
-- 7) agencia_acoes_log — auditoria de tudo que agente faz (Fase 6)
-- =====================================================
CREATE TABLE IF NOT EXISTS agencia_acoes_log (
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
CREATE INDEX IF NOT EXISTS idx_agencia_log_agente_ts  ON agencia_acoes_log(agente, ts DESC);
CREATE INDEX IF NOT EXISTS idx_agencia_log_cliente_ts ON agencia_acoes_log(cliente_id, ts DESC);
