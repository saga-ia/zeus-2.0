---
name: Arquitetura do WhatsApp Worker (resumo pro agente)
description: Referência rápida da estrutura do worker Node/SQLite/PM2 onde você vive — onde ficam messages, contatos, queue, endpoints principais, tabelas novas da Fase 2
type: reference
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
**Runtime**: Node.js 24 + Express + better-sqlite3 + PM2 nativo. Porta 3002 atrás de nginx TLS em `https://agente.propostaebcmkt2026.shop`. CLAUDE.md local tem os detalhes operacionais.

**Módulos que importam pra você**:
- `src/wa/client.js` — cliente whatsapp-web.js; handlers `message`/`message_create`/`message_ack`; orquestra trigger + pipeline de áudio.
- `src/wa/contact-resolver.js` — `resolvePhone(client, jid)`; cache in-memory + persistência em `contact_aliases`.
- `src/agent/notify.js` — utilitários de whitelist por phone (`isWhitelistedPhone`, `isTeamAuthorizedPhone`, `labelForPhone`).
- `src/agent/api-reply.js` — Fase 2: quem responde não-whitelist via Anthropic API. System prompt baseline em `systemPromptFor()`, controles em `setPanic`/`setContactEnabled`/`statusSnapshot`.
- `src/routes/agent.js` — POST `/agent/speak` (TTS → OGG/Opus PTT, só whitelist).
- `src/routes/admin.js` — `/admin/api-replies/{status,panic,contact,setting,log}` pros comandos que Jeff te passa (whitelist administra).
- `src/queue/send-queue.js` — fila anti-ban serializada; `withTimeout` em toda chamada wweb.js.

**Tabelas SQLite em `data/worker.db`**:
- `messages` — toda mensagem in/out; coluna `contact_phone` é o identificador CANÔNICO do interlocutor. `processed_by_agent` (0=você precisa ler, 1=ok). `transcription`+`transcription_status` pra áudios.
- `contact_aliases` — phone PK ↔ lid ↔ c_us ↔ name. Consulta aqui pra descobrir phone de "fulano" por nome.
- `send_queue` — fila outbound; `status` pendente/sending/sent/error.
- `app_settings` — KV pra config dinâmica (panic, model, max_tokens, history_limit da API).
- `contact_settings` — opt-outs por phone (Fase 2).
- `api_reply_log` — auditoria de cada tentativa da API Anthropic.

**Regra de ouro pra consultas**: filtrar por `contact_phone`, **não** por `chat_id`. `chat_id` pode mudar (@c.us ↔ @lid); `contact_phone` é o phone canônico estável.
