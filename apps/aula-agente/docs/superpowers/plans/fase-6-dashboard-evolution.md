# Fase 6: Dashboard â Evolution API â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar gestÃ£o de instÃ¢ncias Evolution API no dashboard: listar, criar, conectar via QR code, ver status, vincular agente, desconectar/excluir.

**Architecture:** PÃ¡ginas interagem com o backend API (nÃ£o direto Supabase) para operaÃ§Ãµes Evolution. Status e QR code buscados em tempo real da Evolution API via backend.

**Tech Stack:** Next.js 15, shadcn/ui, API client

**Depends on:** Fase 2 (instance routes), Fase 4 (dashboard layout)

---

### Task 1: PÃ¡gina de Lista de InstÃ¢ncias

**Files:**
- `apps/web/src/components/instances/instance-card.tsx` â card com status badge (connected/disconnected/connecting), telefone, agente vinculado
- `apps/web/src/app/(dashboard)/instances/page.tsx`:
  - Lista via `apiFetch('/organizations/{orgId}/instances')`
  - Dialog "Nova InstÃ¢ncia" com input de nome, POST para criar
  - Empty state com Ã­cone Radio

- [ ] Commit: `feat(web): add instances list page with create dialog`

---

### Task 2: PÃ¡gina de Detalhes da InstÃ¢ncia (QR Code + Status + Vincular Agente)

**Files:**
- `apps/web/src/components/instances/qrcode-dialog.tsx`:
  - Dialog que abre e busca QR via `apiFetch('/instances/{id}/qrcode')`
  - Auto-refresh a cada 20s
  - Renderiza img base64
- `apps/web/src/components/instances/instance-status.tsx`:
  - Badge do status atual
  - BotÃ£o refresh chama `/instances/{id}/status` (sincroniza Evolution â Supabase)
- `apps/web/src/app/(dashboard)/instances/[instanceId]/page.tsx`:
  - Carrega instance via Supabase + agents ativos da org
  - Card "ConexÃ£o" com telefone, QR dialog, botÃ£o desconectar (POST /logout)
  - Card "Agente Vinculado" com Select chamando `apiFetch PATCH /instances/{id}` com `active_agent_id`
  - BotÃ£o destrutivo "Excluir InstÃ¢ncia" (DELETE)

- [ ] Commit: `feat(web): add instance detail page with QR code, status, and agent assignment`

---

### Task 3: VerificaÃ§Ã£o Final da Fase 6

- [ ] `pnpm build` em apps/web sem erros
