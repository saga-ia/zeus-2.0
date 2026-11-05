-- ZEUS Central · base de vendas só de leitura (schema zv) no Postgres da Evolution.
-- Não altera nenhuma tabela da Evolution: só cria views por cima delas e duas tabelas próprias.
-- Reaplicável: rode de novo depois de mudar qualquer view.
CREATE SCHEMA IF NOT EXISTS zv;

-- Números de WhatsApp da empresa que entram na análise, e de qual vendedor/setor é cada um (a Central mantém)
CREATE TABLE IF NOT EXISTS zv.instancia (
  nome      text PRIMARY KEY,
  vendedor  text,
  setor     text,
  ativo     boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Leads e negócios importados de planilha ou CRM (a Central grava; cada importação é um lote)
CREATE TABLE IF NOT EXISTS zv.lead_import (
  id           bigserial PRIMARY KEY,
  lote         text NOT NULL,
  fonte        text NOT NULL,
  importado_em timestamptz NOT NULL DEFAULT now(),
  data         timestamptz,
  nome         text,
  telefone     text,
  origem       text,
  etapa        text,
  status       text,
  valor        numeric,
  vendedor     text,
  produto      text,
  motivo_perda text,
  data_fechamento timestamptz,
  extra        jsonb
);
CREATE INDEX IF NOT EXISTS lead_import_lote ON zv.lead_import (lote);

-- Transcrição dos áudios (a Central transcreve com Whisper e grava aqui; ver transcricao.js)
CREATE TABLE IF NOT EXISTS zv.transcricao (
  msg_id     text PRIMARY KEY,
  texto      text,
  status     text NOT NULL,           -- ok | erro
  tentativas integer NOT NULL DEFAULT 1,
  erro       text,
  em         timestamptz NOT NULL DEFAULT now()
);

-- Uma linha por mensagem dos números da empresa, com o texto já extraído (áudio: a transcrição)
CREATE OR REPLACE VIEW zv.msg AS
SELECT m.id,
       i.name                                         AS instancia,
       zi.vendedor, zi.setor,
       (to_timestamp(m."messageTimestamp") AT TIME ZONE 'America/Sao_Paulo') AS ts,
       COALESCE((m.key->>'fromMe')::boolean, false)   AS from_me,
       m.key->>'remoteJid'                            AS jid,
       (m.key->>'remoteJid') LIKE '%@g.us'            AS is_group,
       (m.key->>'remoteJid') LIKE '%@lid'             AS jid_sem_telefone,
       CASE WHEN (m.key->>'remoteJid') LIKE '%@s.whatsapp.net' THEN split_part(m.key->>'remoteJid', '@', 1) END AS telefone,
       m."messageType"                                AS tipo,
       m."pushName"                                   AS push_name,
       NULLIF(COALESCE(m.message->>'conversation',
                m.message->'extendedTextMessage'->>'text',
                m.message->'imageMessage'->>'caption',
                m.message->'videoMessage'->>'caption',
                m.message->'documentMessage'->>'caption',
                m.message->>'speechToText', t.texto), '') AS texto,
       m."messageType" IN ('imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage','ptvMessage','documentWithCaptionMessage') AS is_midia,
       m."messageType" = 'audioMessage'               AS is_audio,
       (m."messageType" IN ('protocolMessage','reactionMessage','senderKeyDistributionMessage','messageContextInfo','pollUpdateMessage','editedMessage','keepInChatMessage','pinInChatMessage')
         OR (m.key->>'remoteJid') = 'status@broadcast' OR (m.key->>'remoteJid') LIKE '%@newsletter') AS is_sistema,
       (t.status = 'ok')                              AS transcrito
FROM public."Message" m
JOIN public."Instance" i ON i.id = m."instanceId"
JOIN zv.instancia zi ON zi.nome = i.name AND zi.ativo
LEFT JOIN zv.transcricao t ON t.msg_id = m.id;

-- Uma linha por conversa (instância + contato)
CREATE OR REPLACE VIEW zv.conversa AS
WITH b AS (SELECT * FROM zv.msg WHERE NOT is_sistema)
SELECT b.instancia, max(b.vendedor) AS vendedor, max(b.setor) AS setor, b.jid,
       bool_or(b.is_group) AS is_group, bool_or(b.jid_sem_telefone) AS jid_sem_telefone, max(b.telefone) AS telefone,
       COALESCE(max(c.name), max(b.push_name) FILTER (WHERE NOT b.from_me)) AS nome,
       min(b.ts) AS primeira_msg, max(b.ts) AS ultima_msg,
       max(b.ts) FILTER (WHERE NOT b.from_me) AS ultima_msg_cliente,
       max(b.ts) FILTER (WHERE b.from_me)     AS ultima_msg_nossa,
       count(*) AS total_msgs,
       count(*) FILTER (WHERE NOT b.from_me) AS msgs_cliente,
       count(*) FILTER (WHERE b.from_me)     AS msgs_nossas,
       count(*) FILTER (WHERE b.is_midia)    AS msgs_midia,
       count(*) FILTER (WHERE b.is_audio)    AS msgs_audio,
       count(DISTINCT b.ts::date)            AS dias_ativos,
       (max(b.ts) FILTER (WHERE NOT b.from_me)) > COALESCE(max(b.ts) FILTER (WHERE b.from_me), '-infinity') AS aguardando_resposta
FROM b
LEFT JOIN public."Instance" i ON i.name = b.instancia
LEFT JOIN public."Chat" c ON c."instanceId" = i.id AND c."remoteJid" = b.jid
GROUP BY b.instancia, b.jid;

-- Um turno de atendimento por linha: quando o cliente escreveu e quanto demorou a resposta
-- (minutos NULL = o cliente escreveu e nunca foi respondido)
CREATE OR REPLACE VIEW zv.resposta AS
WITH m AS (
  SELECT instancia, vendedor, setor, jid, ts, from_me,
         lag(from_me) OVER (PARTITION BY instancia, jid ORDER BY ts) AS anterior_nossa,
         min(CASE WHEN from_me THEN ts END) OVER (PARTITION BY instancia, jid ORDER BY ts ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS proxima_nossa
  FROM zv.msg WHERE NOT is_sistema AND NOT is_group
)
SELECT instancia, vendedor, setor, jid, ts AS ts_pergunta, proxima_nossa AS ts_resposta,
       round((extract(epoch FROM (proxima_nossa - ts)) / 60)::numeric, 1) AS minutos,
       extract(isodow FROM ts)::int AS dia_semana, extract(hour FROM ts)::int AS hora
FROM m
WHERE NOT from_me AND (anterior_nossa IS NULL OR anterior_nossa);

-- Leads importados, com a mesma cara para a IA
CREATE OR REPLACE VIEW zv.lead AS
SELECT id, lote, fonte, importado_em, data, nome, telefone, origem, etapa, status, valor, vendedor, produto, motivo_perda, data_fechamento, extra
FROM zv.lead_import;

-- Papel só de leitura usado pela IA: enxerga apenas o schema zv, sempre em transação somente leitura
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zeus_ro') THEN CREATE ROLE zeus_ro LOGIN; END IF;
END $$;
ALTER ROLE zeus_ro SET default_transaction_read_only = on;
ALTER ROLE zeus_ro SET statement_timeout = '25s';
ALTER ROLE zeus_ro SET idle_in_transaction_session_timeout = '30s';
REVOKE ALL ON SCHEMA public FROM zeus_ro;
GRANT USAGE ON SCHEMA zv TO zeus_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA zv TO zeus_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA zv GRANT SELECT ON TABLES TO zeus_ro;
