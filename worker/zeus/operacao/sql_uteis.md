# Operação — Consultas SQL úteis

Lazy-load. Carregue quando precisar de queries além das do ciclo padrão (mensagens não processadas / histórico).

DB: `/opt/labastia/whatsapp-worker/data/worker.db`

## Buscar mensagens por conteúdo
```sql
SELECT contact_phone, body, timestamp
FROM messages
WHERE body LIKE '%palavra%' AND direction='in'
ORDER BY timestamp DESC LIMIT 20;
```

## Mensagens recebidas nas últimas 24h (por contato)
```sql
SELECT contact_phone, count(*) AS n
FROM messages
WHERE direction='in' AND datetime(timestamp) > datetime('now','-1 day')
GROUP BY contact_phone ORDER BY n DESC;
```

## Todos os chats com pendências
```sql
SELECT contact_phone, chat_id, count(*) AS pendentes
FROM messages
WHERE processed_by_agent=0 AND from_me=0
GROUP BY contact_phone, chat_id;
```

## Verificar fila de envio (anti-ban)
```sql
SELECT id, chat_id, kind, status, retry_count, created_at, error
FROM send_queue
WHERE status != 'sent'
ORDER BY id DESC LIMIT 20;
```

## Conversa de qualquer contato por nome (parcial)
```sql
SELECT m.direction, m.from_me, m.type, m.body, m.transcription, m.timestamp
FROM messages m
JOIN contact_aliases ca ON ca.phone = m.contact_phone
WHERE ca.name LIKE '%nome%'
ORDER BY m.timestamp DESC LIMIT 50;
```

## Conversa por phone direto
```sql
SELECT direction, from_me, type, body, transcription, timestamp
FROM messages
WHERE contact_phone LIKE '%55219%'
ORDER BY timestamp DESC LIMIT 50;
```
