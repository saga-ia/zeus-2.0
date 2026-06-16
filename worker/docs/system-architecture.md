# Arquitetura do worker

```
Node 24 + Express + better-sqlite3 + PM2
Porta: 3002
Nginx Proxy Manager (Docker) → https://agente.propostaebcmkt2026.shop
```

## Módulos-chave
- `src/wa/client.js` — cliente whatsapp-web.js, watchdog, handlers de mensagem/grupo, pipeline áudio/mídia.
- `src/queue/send-queue.js` — fila anti-ban serializada, rate limiting (30 msgs/5min), retry com backoff.
- `src/agent/notify.js` — utilitários whitelist por phone (`isWhitelistedPhone`, `isTeamAuthorizedPhone`, `labelForPhone`).
- `src/agent/api-reply.js` — Fase 2: respostas Anthropic para não-whitelist com debounce.
- `src/audio/tts.js` — TTS Edge (pt-BR-AntonioNeural) → OGG/Opus. Fallback ElevenLabs.
- `src/audio/transcribe.js` — Groq Whisper (`whisper-large-v3`).
- `src/wa/contact-resolver.js` — resolve phone ↔ JID, cache em `contact_aliases`.
- `data/worker.db` — SQLite WAL. Único armazenamento.

## Schema `messages`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER PK | use em `WHERE id IN (...)` para marcar processado |
| `message_id` | TEXT | ID do WhatsApp |
| `chat_id` | TEXT | JID da conversa (usar **só** para enviar resposta) |
| `contact_phone` | TEXT | **identificador estável** — sempre filtre por aqui |
| `direction` | TEXT | `in` / `out` |
| `from_me` | INTEGER | 1 = worker/eu; 0 = usuário |
| `type` | TEXT | `chat`, `ptt`, `audio`, `image`, `document`, `sticker`, `video` |
| `body` | TEXT | texto |
| `transcription` | TEXT | áudio transcrito |
| `transcription_status` | TEXT | `ok` / `failed` / null |
| `media_path` | TEXT | caminho absoluto do arquivo |
| `author_name` | TEXT | remetente (útil em grupos) |
| `is_group` | INTEGER | 1 se grupo |
| `processed_by_agent` | INTEGER | 0 não processado; 1 tratado |
| `timestamp` | TEXT | ISO 8601 |

## Configurações dinâmicas (`app_settings`)
Lidas/escritas direto no SQLite, sem reiniciar:
```bash
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "SELECT key, value FROM app_settings WHERE key='<chave>';"

sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "INSERT OR REPLACE INTO app_settings (key, value, updated_at)
   VALUES ('<chave>', '<valor>', datetime('now'));"
```

| Chave | Descrição |
|---|---|
| `internal_team_group_jid` | JID grupo oficial da equipe (auto-autoriza entradas) |
| `worker_lid_user` | LID do número conectado (detecção de menções em grupos) |
| `api_replies_panic` | `1` = pânico (ninguém recebe resposta automática) |
| `api_reply_model` | modelo Fase 2 (ex: `claude-sonnet-4-6`) |
| `api_reply_max_tokens` | limite tokens Fase 2 |
| `api_reply_history_limit` | quantas msgs do histórico no contexto |
| `api_reply_debounce_ms` | janela de debounce (padrão 8000) |

## Health/admin
```bash
curl -s http://127.0.0.1:3002/health | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /admin/stats | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /admin/queue | jq
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /admin/queue/flush
/opt/labastia/whatsapp-worker/scripts/wapi.sh GET /status | jq
pm2 status whatsapp-worker
pm2 logs whatsapp-worker --lines 50 --nostream
pm2 restart whatsapp-worker   # confirmar com Jeff/Vinicius
```

## Sessão WhatsApp
```bash
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /session/logout    # gera QR novo
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /session/restart   # reinicia cliente sem logout
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /session/read '{"chatId":"<CHAT_ID>"}'
```
