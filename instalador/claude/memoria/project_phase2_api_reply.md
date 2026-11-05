---
name: Fase 2 — respostas via Anthropic API (estado atual)
description: Infra de resposta automática via Claude API para contatos não-whitelist está pronta e silenciada (panic ON). Você administra panic e opt-outs via endpoints admin quando Jeff pedir.
type: project
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
**Estado em 2026-04-19**: infra construída, **panic ATIVO** (ninguém fora do whitelist é respondido). System prompt baseline está em `src/agent/api-reply.js::systemPromptFor` — conservador, genérico, pronto pra ser refinado depois.

**Seu papel operacional**:
- Quando **Jeff** pedir por WhatsApp:
  - "pare de responder todos" / "botão de pânico" / "silencia tudo" → `POST /admin/api-replies/panic {enabled:true}`
  - "libera as respostas" / "volta a responder" → `POST /admin/api-replies/panic {enabled:false}`
  - "pare de responder fulano" → descubra phone via `contact_aliases`, depois `POST /admin/api-replies/contact {phone, enabled:false, notes}`
  - "volte a responder fulano" → idem com `enabled:true`
  - "status do bot" → `GET /admin/api-replies/status`
- Sempre confirmar execução por WhatsApp ao solicitante.
- Se o nome for ambíguo (0 ou >1 match em `contact_aliases`), pedir desambiguação antes de agir.

**Onde fica o system prompt**:
- Código em `src/agent/api-reply.js::systemPromptFor(phone, displayName)`.
- Mudar jeito de responder = code edit em `src/agent/api-reply.js` + `pm2 restart whatsapp-worker` (pm2 restart passa pela dupla confirmação do §3).
- Se Jeff pedir "muda o tom do bot" ou "ensina o bot sobre X", preparar a spec técnica (diff do system prompt, motivação, antes/depois) e entregar ao Jeff em texto — ele roteia pra quem aplica no servidor.

**Gates automáticos** (em `src/agent/api-reply.js::shouldReply`):
1. panic global.
2. opt-out individual.
3. whitelist-exception (Vinicius/Jeff nunca são respondidos pela API — eles têm você).
4. cooldown 10s por contato (anti-spam).

**Auditoria**: `api_reply_log` table guarda todas as tentativas (skipped, queued, error) com phone, model, tokens, reply. Útil pra responder "quantas mensagens o bot mandou hoje?" ou "por que o bot não respondeu fulano?".

**Modelo e parâmetros** (em `app_settings`):
- `api_reply_model` = `claude-opus-4-7`
- `api_reply_max_tokens` = `512`
- `api_reply_history_limit` = `20`
Alteráveis via `POST /admin/api-replies/setting`, mas só via pedido explícito com justificativa técnica — valores novos propostos vão primeiro em texto ao Jeff pra ele validar antes de aplicar.
