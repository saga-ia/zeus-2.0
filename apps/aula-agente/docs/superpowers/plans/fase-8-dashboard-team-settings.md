# Fase 8: Dashboard â Team & Settings â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar pÃ¡ginas de gestÃ£o de equipe (membros, convites, roles) e configuraÃ§Ãµes da organizaÃ§Ã£o (nome, plano, API keys dos providers LLM via vault).

**Architecture:** CRUD de membros e convites via Supabase SDK direto com RLS. API keys salvas na tabela organization_secrets (vault). Settings de org via Supabase direto.

**Tech Stack:** Next.js 15, Supabase SDK, shadcn/ui

**Depends on:** Fase 4 (layout, auth, org provider)

---

### Task 1: PÃ¡gina de Equipe â Membros

**Files:**
- `apps/web/src/components/team/members-list.tsx`:
  - Lista members com avatar fallback (initials do user_id)
  - Marca "(vocÃª)" no membro atual
  - Owner read-only; admin pode mudar role admin/agent ou remover (se for owner/admin gerenciando)
  - Badge para owner; Select para admin/agent
- `apps/web/src/components/team/invite-dialog.tsx`:
  - Dialog com email + role select (admin/agent)
  - Insert em `organization_invitations` com `expires_at = now + 7 days`, `status = pending`, `invited_by = user.id`
- `apps/web/src/app/(dashboard)/team/page.tsx`:
  - Carrega members + invitations pendentes via Promise.all
  - Detecta role do user atual pra controlar UI
  - Card "Membros" + Card "Convites Pendentes" com email, expires_at, role badge

- [ ] Commit: `feat(web): add team page with members, roles, and invitations`

---

### Task 2: PÃ¡gina de ConfiguraÃ§Ãµes

**Files:** `apps/web/src/app/(dashboard)/settings/page.tsx`

- Card "OrganizaÃ§Ã£o":
  - Input nome (editÃ¡vel) + botÃ£o salvar (update na tabela organizations + refetch context)
  - Input slug (read-only)
  - Badge plano
- Card "API Keys dos Providers":
  - 3 providers (openai, anthropic, google) com input password type=password
  - Toggle eye/eye-off pra mostrar/esconder
  - BotÃ£o "Salvar" por provider â upsert em `organization_secrets` (ou delete se vazio)

```typescript
// Snippet do save com invalidaÃ§Ã£o de cache de vault
const handleSaveApiKey = async (provider: LLMProvider) => {
  if (!currentOrg) return;
  setSavingKeys(true);
  const supabase = createClient();
  const key = apiKeys[provider];

  if (!key) {
    await supabase.from("organization_secrets").delete()
      .eq("organization_id", currentOrg.id).eq("provider", provider);
  } else {
    await supabase.from("organization_secrets").upsert(
      { organization_id: currentOrg.id, provider, encrypted_key: key },
      { onConflict: "organization_id,provider" }
    );
  }

  // Invalida cache de chaves nos workers via pubsub.
  try {
    await apiFetch(`/organizations/${currentOrg.id}/secrets/invalidate`, {
      method: "POST",
      body: JSON.stringify({ provider }),
    });
  } catch {
    // nÃ£o bloqueia: cache expira em 60s de qualquer forma
  }

  setSavingKeys(false);
};
```

- [ ] Commit: `feat(web): add settings page with org config and API key management`

---

### Task 3: VerificaÃ§Ã£o Final da Fase 8

- [ ] `pnpm build` em apps/web sem erros
- [ ] `pnpm typecheck` em todo monorepo sem erros
- [ ] `docker compose config --quiet` â compose vÃ¡lido

---

## Checklist Final do Projeto

Ao concluir todas as 8 fases:

- [ ] Monorepo compila (`pnpm typecheck`)
- [ ] Dashboard builda (`cd apps/web && pnpm build`)
- [ ] Docker Compose vÃ¡lido (`docker compose config --quiet`)
- [ ] Docker Compose sobe (`docker compose up --build`)
- [ ] API responde health (`curl localhost:3001/health`)
- [ ] Worker conecta Redis e inicia 4 workers
- [ ] Dashboard abre e redireciona pra /login
- [ ] Migrations aplicadas no Supabase
- [ ] RLS ativo em todas as tabelas
