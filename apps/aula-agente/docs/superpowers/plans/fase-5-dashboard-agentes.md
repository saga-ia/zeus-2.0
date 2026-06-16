# Fase 5: Dashboard â GestÃ£o de Agentes â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar CRUD completo de agentes no dashboard: listar, criar, editar (nome, prompt, modelo, provider, temperatura), gerenciar tools, upload de documentos para knowledge base, e CRUD de FAQs.

**Architecture:** PÃ¡ginas Next.js App Router com data fetching via Supabase SDK direto (RLS). Upload de documentos via API backend (precisa enfileirar job). FAQs via Supabase direto.

**Tech Stack:** Next.js 15, Supabase SDK, shadcn/ui, React Hook Form, Zod

**Depends on:** Fase 4 (dashboard layout, auth, org provider)

---

### Task 1: PÃ¡gina de Lista de Agentes

**Files:**
- `apps/web/src/components/agents/agent-card.tsx` â card linkando para /agents/[id], com badge de status, modelo/provider/temp
- `apps/web/src/app/(dashboard)/agents/page.tsx` â lista via Supabase filtrado por org, empty state, botÃ£o "Novo Agente"

- [ ] Commit: `feat(web): add agents list page with agent cards`

---

### Task 2: FormulÃ¡rio de Criar/Editar Agente

`pnpm add react-hook-form @hookform/resolvers`

**Files:**
- `apps/web/src/components/agents/agent-form.tsx` â form com:
  - Card "InformaÃ§Ãµes BÃ¡sicas": name, description, system_prompt (textarea), is_active switch
  - Card "Modelo": provider select (openai/anthropic/google), model select (filtra por provider), temperature range, max_tokens
  - Card "Tools": switches para search_knowledge e search_faq
  - Validation via zodResolver(createAgentSchema)
- `apps/web/src/app/(dashboard)/agents/new/page.tsx` â insere via Supabase, redirect pra /agents
- `apps/web/src/app/(dashboard)/agents/[agentId]/page.tsx` â carrega agent, edit via update, link pra /knowledge, botÃ£o delete

Models por provider:
```typescript
const MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
  google: ["gemini-2.0-flash", "gemini-2.0-flash-lite"],
};
```

- [ ] Commit: `feat(web): add agent create and edit pages with full form`

---

### Task 3: PÃ¡gina de Knowledge Base (Documentos + FAQs)

**Files:**
- `apps/web/src/components/agents/document-upload.tsx`:
  - Upload via FormData para `${API_URL}/organizations/{orgId}/agents/{agentId}/documents` com Bearer token
  - Lista documentos com badge de status (processing/ready/error)
  - Delete via API
- `apps/web/src/components/agents/faq-manager.tsx`:
  - Form inline com question + answer textarea
  - CRUD direto via Supabase (insert/update/delete)
  - Switch para is_active toggle
- `apps/web/src/app/(dashboard)/agents/[agentId]/knowledge/page.tsx`:
  - Carrega documents + faqs via Promise.all
  - Renderiza DocumentUpload + FaqManager com onRefresh

- [ ] Commit: `feat(web): add knowledge base page with document upload and FAQ manager`

---

### Task 4: VerificaÃ§Ã£o Final da Fase 5

- [ ] `pnpm build` em apps/web sem erros
