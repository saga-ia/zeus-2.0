# Fase 7: Dashboard â Inbox â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar inbox completo: lista de conversas com filtros, chat em tempo real, takeover humano, atribuiÃ§Ã£o de conversas, notas internas, tags, e mÃ©tricas.

**Architecture:** Lista de conversas e mensagens via Supabase SDK com RLS. Mensagens em tempo real via Supabase Realtime. Envio de mensagens pelo humano via API backend. Takeover e atribuiÃ§Ã£o via Supabase direto.

**Tech Stack:** Next.js 15, Supabase Realtime, shadcn/ui

**Depends on:** Fase 4 (layout, auth), Fase 2 (message send route)

---

### Task 1: Lista de Conversas

**Files:**
- `apps/web/src/components/inbox/conversation-list.tsx`:
  - List com avatar, nome/phone do contato, timestamp, status dot (open=green, waiting=yellow, resolved=blue, closed=gray)
  - Badge "Humano" se `is_human_takeover`
- `apps/web/src/app/(dashboard)/inbox/page.tsx`:
  - Layout: sidebar 80 (lista) + main flex-1 (chat)
  - Filtros: search por nome/phone, select de status
  - `useRealtime` em conversations pra refetch on insert/update
  - URL ?id={conversationId} controla seleÃ§Ã£o

- [ ] Commit: `feat(web): add inbox conversation list with filters and realtime`

---

### Task 2: Chat Panel com Mensagens em Tempo Real

**Files:**
- `apps/web/src/components/inbox/message-bubble.tsx`:
  - Layout diferente para role: contact (left, muted), agent (right, primary), human_agent (right, blue), system (centered, mini)
  - Timestamp + label
- `apps/web/src/components/inbox/chat-panel.tsx`:
  - Header com nome + telefone do contato
  - Mensagens carregadas via Supabase, scroll automÃ¡tico para fim
  - `useRealtime` em messages com `conversation_id=eq.{id}` filter
  - Input + Enter envia via `apiFetch POST /messages/send`

- [ ] Commit: `feat(web): add chat panel with realtime messages and send`

---

### Task 3: Takeover Bar + AtribuiÃ§Ã£o

**Files:** `apps/web/src/components/inbox/takeover-bar.tsx`

- BotÃ£o "Assumir/Devolver" toggla `is_human_takeover` + `human_takeover_at` (now ou null) + `assigned_to` (user atual ou null)
- Select de members da org pra atribuir conversa

- [ ] Commit: `feat(web): add takeover bar with human takeover and assignment`

---

### Task 4: Painel Lateral â Notas + Tags + Status

**Files:**
- `apps/web/src/components/inbox/tags-input.tsx`:
  - Lista badges removÃ­veis
  - Input com Enter pra adicionar tag (update array)
- `apps/web/src/components/inbox/notes-panel.tsx`:
  - Textarea pra nova nota + botÃ£o
  - Lista notes ordem desc, fundo amarelo
  - Insert via Supabase com user_id da auth
- `apps/web/src/components/inbox/side-panel.tsx`:
  - Largura w-72, border-l
  - Sections separadas: Contato â Status (select) â Atendimento (TakeoverBar) â Tags (TagsInput) â Notas Internas (NotesPanel)

- [ ] Commit: `feat(web): add side panel with takeover, tags, notes, and status`

---

### Task 5: Integrar Side Panel no Chat

Modify `apps/web/src/components/inbox/chat-panel.tsx`:
- Wrap em flex; chat + SidePanel lado a lado
- Passar `conversation` carregada e `onUpdate=fetchConversation` pro panel

- [ ] Commit: `feat(web): integrate side panel into chat view`

---

### Task 6: VerificaÃ§Ã£o Final da Fase 7

- [ ] `pnpm build` em apps/web sem erros
