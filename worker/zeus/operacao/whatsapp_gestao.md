# Operação — WhatsApp: grupos, contatos, webhooks, admin, Fase 2

Lazy-load. Carregue quando o tema for: gerenciar grupos/participantes, listar contatos, configurar webhooks, status do worker, controle das respostas automáticas (Fase 2 Anthropic), equipe autorizada, app_settings.

## Gestão de grupos

```bash
# Listar grupos
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /groups | jq '.groups[] | {id, name, participants}'

# Participantes
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /groups/<GROUP_JID>/participants | jq

# Adicionar / remover
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups/<GROUP_JID>/participants '{"participants":["55XXXXXXXXXXX"]}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh DELETE /groups/<GROUP_JID>/participants/55XXXXXXXXXXX@c.us

# Promover / rebaixar admin
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups/<GROUP_JID>/participants/55XXXXXXXXXXX@c.us/promote
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups/<GROUP_JID>/participants/55XXXXXXXXXXX@c.us/demote

# Criar / renomear / entrar por convite
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups '{"name":"Nome","participants":["55XXXXXXXXXXX","55YYYYYYYYYYY"]}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh PATCH /groups/<GROUP_JID>/name '{"name":"Novo nome"}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /groups/join '{"invite":"https://chat.whatsapp.com/CODIGO"}'
```

**Grupo oficial da equipe (`internal_team_group_jid`)**: quem entra é auto-autorizado (Fase 2 congelada); quem sai perde a autorização. Quando worker entra num grupo novo, Jeff recebe DM; ele responde "esse é o grupo da equipe" e o JID grava em `app_settings`. Manual: `UPDATE app_settings SET value='<GROUP_JID>' WHERE key='internal_team_group_jid';`

## Gestão de contatos

```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /contacts | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /contacts/check '{"number":"55XXXXXXXXXXX"}'
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db "SELECT phone, name, c_us, lid FROM contact_aliases WHERE name LIKE '%nome%';"
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /session/read '{"chatId":"<CHAT_ID>"}'
```

## Controle das respostas automáticas (Fase 2 Anthropic)

Quem não é Jeff/Vinicius/equipe é respondido automaticamente pela API Anthropic.

```bash
# Status / log
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /admin/api-replies/status | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET "/admin/api-replies/log?limit=20" | jq

# Botão de pânico
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/panic '{"enabled":true}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/panic '{"enabled":false}'

# Silenciar / religar contato
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/contact '{"phone":"55XXXXXXXXXXX","enabled":false,"notes":"motivo"}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/contact '{"phone":"55XXXXXXXXXXX","enabled":true}'

# Trocar modelo
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/api-replies/setting '{"key":"api_reply_model","value":"claude-haiku-4-5-20251001"}'
```

Padrão: `api_replies_panic=0`, modelo `claude-sonnet-4-6`.

## Equipe autorizada (protocolo)

"Sou da equipe" / "trabalho com Jefferson" → bot Fase 2 congela, Jeff recebe alerta. Confirmação dele:
- Sim → autorizar (linha abaixo).
- Não → re-habilitar Fase 2 (`enabled:true`).

```bash
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "INSERT OR REPLACE INTO contact_settings (phone, api_replies_enabled, notes, set_by, updated_at)
   VALUES ('55XXXXXXXXXXX', 0, 'autorizado por Jefferson em YYYY-MM-DD', 'jeff_approval', datetime('now'));"
```

Whitelist técnica (trigger automático pra mim) é via `AGENT_WHITELIST` no `.env` — hard-block, terminal direto.

## Webhooks

```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /webhooks | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /webhooks '{"url":"https://endpoint","events":"*","token":"opcional"}'
/opt/labastia/whatsapp-worker/scripts/wapi.sh DELETE /webhooks/<ID>
```

Eventos: `message.received`, `message.sent`, `message.ack`, `message.edit`.

## Administração do worker

```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /admin/stats | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /admin/queue | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/queue/flush
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /status | jq
curl -s http://127.0.0.1:3002/health | jq
pm2 status whatsapp-worker
pm2 logs whatsapp-worker --lines 50 --nostream
pm2 restart whatsapp-worker        # confirmar com Jeff antes
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /session/logout    # gera novo QR
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /session/restart   # restart sem logout
```

## Configurações dinâmicas (`app_settings`)

Lidas/escritas direto no SQLite, sem reiniciar.

```bash
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db "SELECT key, value FROM app_settings WHERE key='<chave>';"
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('<chave>', '<valor>', datetime('now'));"
```

Chaves principais:
- `internal_team_group_jid` — JID do grupo da equipe (auto-autoriza)
- `worker_lid_user` — LID do número conectado (detecta menções em grupos)
- `api_replies_panic` — `1` = silencia tudo da Fase 2
- `api_reply_model` — modelo Anthropic
- `api_reply_max_tokens` — limite de tokens por resposta
- `api_reply_history_limit` — quantas msgs do histórico no contexto
- `api_reply_debounce_ms` — janela de debounce (padrão 8000)
