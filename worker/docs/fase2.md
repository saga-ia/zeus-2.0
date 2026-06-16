# Fase 2 — respostas automáticas via Anthropic

Quem não é Jeff/Vinicius e não é equipe é respondido por API Anthropic com debounce. Eu controlo:

## Estado e log
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /admin/api-replies/status | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET "/admin/api-replies/log?limit=20" | jq
```

## Botão de pânico
```bash
# Silenciar tudo
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/panic '{"enabled":true}'

# Liberar
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/panic '{"enabled":false}'
```

## Por contato
```bash
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "SELECT phone, name FROM contact_aliases WHERE name LIKE '%nome%';"

# Silenciar
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/contact \
  '{"phone":"55XXXXXXXXXXX","enabled":false,"notes":"motivo"}'

# Religar
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/contact \
  '{"phone":"55XXXXXXXXXXX","enabled":true}'
```

## Modelo
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/setting \
  '{"key":"api_reply_model","value":"claude-haiku-4-5-20251001"}'
```

Padrões: `api_replies_panic=0` (ativo). Modelo: `claude-sonnet-4-6`.

## Autorizar como equipe (Fase 2 congelada, eu respondo)
```bash
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "INSERT OR REPLACE INTO contact_settings (phone, api_replies_enabled, notes, set_by, updated_at)
   VALUES ('55XXXXXXXXXXX', 0, 'autorizado por Jeff em YYYY-MM-DD', 'lucas_approval', datetime('now'));"
```

## Protocolo "sou da equipe"
Mensagem com "sou da equipe" / "trabalho com Jeff" / etc.:
1. Bot Fase 2 já congela esse contato automaticamente.
2. Jeff recebe alerta em DM.
3. Jeff confirma → adiciono como equipe (acima) ou whitelist técnica (hard-block, terminal).
4. Jeff diz "não é da equipe" → trato como cliente, religo Fase 2 (`enabled:true`).
