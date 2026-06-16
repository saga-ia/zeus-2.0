-- Métricas operacionais por conversa, populadas via triggers para que
-- inserts feitos por qualquer caminho (API, worker, RPC) sejam capturados.

-- Garante uma linha em conversation_metrics para cada nova conversation.
CREATE OR REPLACE FUNCTION ensure_conversation_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO conversation_metrics (
    conversation_id, organization_id, message_count, human_messages_count
  )
  VALUES (NEW.id, NEW.organization_id, 0, 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversations_init_metrics
  AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION ensure_conversation_metrics();

-- A cada mensagem inserida:
--   - incrementa message_count
--   - incrementa human_messages_count se role='human_agent'
--   - se é a primeira resposta (agent ou human_agent) e first_response_time_ms
--     ainda é NULL, calcula contra a created_at da conversation
CREATE OR REPLACE FUNCTION update_metrics_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conv conversations%ROWTYPE;
BEGIN
  SELECT * INTO conv FROM conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE conversation_metrics
     SET message_count = message_count + 1,
         human_messages_count = human_messages_count
           + CASE WHEN NEW.role = 'human_agent' THEN 1 ELSE 0 END,
         first_response_time_ms = COALESCE(
           first_response_time_ms,
           CASE
             WHEN NEW.role IN ('agent', 'human_agent')
               THEN GREATEST(0, EXTRACT(EPOCH FROM (NEW.created_at - conv.created_at))::int * 1000)
             ELSE NULL
           END
         )
   WHERE conversation_id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_update_metrics
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_metrics_on_message();

-- Quando a conversa transiciona para resolved/closed, registra o tempo
-- total de resolução.
CREATE OR REPLACE FUNCTION update_metrics_on_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('resolved', 'closed')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE conversation_metrics
       SET resolution_time_ms = COALESCE(
             resolution_time_ms,
             GREATEST(0, EXTRACT(EPOCH FROM (now() - NEW.created_at))::int * 1000)
           )
     WHERE conversation_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversations_update_resolution
  AFTER UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_metrics_on_resolution();
