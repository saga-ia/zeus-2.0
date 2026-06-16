# Catálogo de queries — `data/worker.db`

## Mensagens novas (DM whitelist)
```sql
SELECT id, type, body, transcription, transcription_status, media_path, timestamp
FROM messages
WHERE contact_phone = '<PHONE>' AND processed_by_agent = 0
ORDER BY timestamp ASC;
```

## Mensagens novas (grupo)
```sql
SELECT id, type, body, transcription, author_name, timestamp
FROM messages
WHERE chat_id = '<GROUP_JID>' AND processed_by_agent = 0
ORDER BY timestamp ASC;
```

## Histórico recente de um contato
```sql
SELECT direction, from_me, type, body, transcription, timestamp
FROM messages
WHERE contact_phone = '<PHONE>'
ORDER BY timestamp DESC LIMIT 20;
```

Endpoint HTTP equivalente (com metadados extras):
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET "/history?chatId=<CHAT_ID>&limit=50"
```

## Buscar mensagens por palavra
```sql
SELECT contact_phone, body, timestamp
FROM messages
WHERE body LIKE '%palavra%' AND direction='in'
ORDER BY timestamp DESC LIMIT 20;
```

## Atividade últimas 24h
```sql
SELECT contact_phone, count(*) as n
FROM messages
WHERE direction='in' AND datetime(timestamp) > datetime('now','-1 day')
GROUP BY contact_phone ORDER BY n DESC;
```

## Todos chats com pendência
```sql
SELECT contact_phone, chat_id, count(*) as pendentes
FROM messages
WHERE processed_by_agent=0 AND from_me=0
GROUP BY contact_phone, chat_id;
```

## Buscar conversa por nome de contato
```sql
SELECT m.direction, m.from_me, m.type, m.body, m.transcription, m.timestamp
FROM messages m
JOIN contact_aliases ca ON ca.phone = m.contact_phone
WHERE ca.name LIKE '%nome%'
ORDER BY m.timestamp DESC LIMIT 50;
```

## Fila de envio
```sql
SELECT id, chat_id, kind, status, retry_count, created_at, error
FROM send_queue
WHERE status != 'sent'
ORDER BY id DESC LIMIT 20;
```

## Marcar processado (sempre no fim)
```sql
UPDATE messages SET processed_by_agent=1 WHERE id IN (<ID1>, <ID2>, ...);
```

## Phone por nome (`contact_aliases`)
```sql
SELECT phone, name, c_us, lid FROM contact_aliases WHERE name LIKE '%nome%';
```
