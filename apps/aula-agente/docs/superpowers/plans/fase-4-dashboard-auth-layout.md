# Fase 4: Dashboard Auth & Layout â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Configurar o dashboard Next.js com Supabase Auth, multi-tenancy (org switcher), layout base com sidebar, e middleware de autenticaÃ§Ã£o.

**Architecture:** Next.js App Router com Supabase Auth. Middleware protege rotas. Layout com sidebar responsiva. Org switcher permite trocar de organizaÃ§Ã£o. RLS garante isolamento de dados.

**Tech Stack:** Next.js 15, Supabase Auth, shadcn/ui, Tailwind CSS 4, Lucide Icons

**Depends on:** Fase 1 (monorepo, database package)

---

### Task 1: Inicializar Next.js App

```bash
cd apps/web && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Atualizar `apps/web/package.json` com nome `@aula-agente/web` e dependÃªncias do workspace + `@supabase/ssr`.

shadcn init e adicionar componentes: button, input, label, card, dialog, dropdown-menu, avatar, separator, sheet, sidebar, tooltip, badge, select, textarea, tabs, form, toast, sonner.

`pnpm add lucide-react`

- [ ] Commit: `feat(web): initialize Next.js app with shadcn/ui and tailwind`

---

### Task 2: Supabase Client Setup (Browser + Server + Middleware)

**Files:**
- `apps/web/src/lib/supabase/client.ts` â `createBrowserClient` para componentes "use client"
- `apps/web/src/lib/supabase/server.ts` â `createServerClient` async com cookies() do Next 15
- `apps/web/src/lib/supabase/middleware.ts` â `updateSession` valida user, redireciona pra /login ou /inbox conforme estado
- `apps/web/src/middleware.ts` â matcher excluindo _next/static, _next/image, favicon, imagens

`apps/web/.env.local.example`:
```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:3001
```

- [ ] Commit: `feat(web): add Supabase auth with SSR middleware`

---

### Task 3: PÃ¡ginas de Login e Registro

**Files:**
- `apps/web/src/app/(auth)/layout.tsx` â wrapper centralizado
- `apps/web/src/app/(auth)/auth-form.tsx` â componente com email/password, modos login/register, signUp/signInWithPassword via Supabase, redirect pra /inbox
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/register/page.tsx`

- [ ] Commit: `feat(web): add login and register pages with Supabase Auth`

---

### Task 4: Organization Provider + Hook

**Files:** `apps/web/src/providers/organization-provider.tsx`

Context com `organizations`, `currentOrg`, `setCurrentOrg`, `loading`, `refetch`. Busca memberships via Supabase, persiste org selecionada em localStorage. Hook `useOrganization()` exporta tudo.

- [ ] Commit: `feat(web): add organization provider with multi-tenancy context`

---

### Task 5: Dashboard Layout com Sidebar

**Files:**
- `apps/web/src/components/layout/org-switcher.tsx` â DropdownMenu mostrando orgs do user, troca via setCurrentOrg
- `apps/web/src/components/layout/user-nav.tsx` â Avatar + Logout
- `apps/web/src/components/layout/app-sidebar.tsx` â nav com Inbox, Agentes, InstÃ¢ncias, Equipe, ConfiguraÃ§Ãµes (com active state via pathname)
- `apps/web/src/app/(dashboard)/layout.tsx` â wraps com OrganizationProvider, sidebar + header + main, redirect pra /login se nÃ£o autenticado
- `apps/web/src/app/(dashboard)/inbox/page.tsx` â placeholder
- `apps/web/src/app/page.tsx` â redirect pra /inbox

- [ ] Commit: `feat(web): add dashboard layout with sidebar, org switcher, and user nav`

---

### Task 6: Create Organization Flow

**Files:** `apps/web/src/app/(dashboard)/onboarding/page.tsx`

Form criando organization + organization_member (role owner). Slug auto-gerado a partir do nome. ChamarefetchOrgs depois de criar.

- [ ] Commit: `feat(web): add onboarding page for creating first organization`

---

### Task 7: API Client Helper

**Files:** `apps/web/src/lib/api.ts`

`apiFetch(path, options)`: injeta `Authorization: Bearer <session.access_token>` automaticamente, retorna json ou null para 204.

```typescript
import { createClient } from "@/lib/supabase/client";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || `API error: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}
```

- [ ] Commit: `feat(web): add API client helper with auth token injection`

---

### Task 8: Realtime Hook Base

**Files:** `apps/web/src/lib/realtime.ts`

`useRealtime({table, filter, event, onInsert, onUpdate, onDelete})` com `supabase.channel().on('postgres_changes', ...)`. Cleanup via removeChannel.

- [ ] Commit: `feat(web): add realtime subscription hook for Supabase`

---

### Task 9: VerificaÃ§Ã£o Final da Fase 4

- [ ] `pnpm build` em apps/web sem erros
- [ ] Dev server roda, /redireciona para /login
