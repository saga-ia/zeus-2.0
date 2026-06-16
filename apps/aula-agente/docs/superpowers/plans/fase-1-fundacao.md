# Fase 1: FundaÃ§Ã£o â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar o monorepo Turborepo com todos os packages compartilhados, Docker Compose, schema Supabase completo (tabelas + RLS + vault + pgvector), e conexÃ£o Redis.

**Architecture:** Monorepo com Turborepo gerenciando 3 apps (api, worker, web) e 3 packages (shared, database, queue). Supabase Cloud como banco managed. Redis local via Docker.

**Tech Stack:** TypeScript, Turborepo, pnpm, Docker Compose, Supabase (PostgreSQL + pgvector + pgsodium), Redis 7, Zod, BullMQ

---

### Task 1: Inicializar Monorepo com Turborepo + pnpm

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.nvmrc`

- [ ] **Step 1: Inicializar package.json raiz**

```bash
pnpm init
```

- [ ] **Step 2: Criar configuraÃ§Ã£o do workspace pnpm**

Criar `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Instalar Turborepo como devDependency**

```bash
pnpm add -D turbo
```

- [ ] **Step 4: Criar turbo.json**

Criar `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 5: Atualizar package.json raiz com scripts**

Editar `package.json`:
```json
{
  "name": "aula-agente",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck",
    "dev:api": "turbo dev --filter=@aula-agente/api",
    "dev:worker": "turbo dev --filter=@aula-agente/worker",
    "dev:web": "turbo dev --filter=@aula-agente/web"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

- [ ] **Step 6: Criar .nvmrc**

Criar `.nvmrc`:
```
20
```

- [ ] **Step 7: Criar .gitignore**

Criar `.gitignore`:
```gitignore
node_modules/
dist/
.turbo/
.next/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 8: Criar .env.example**

Criar `.env.example`:
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis
REDIS_URL=redis://localhost:6379

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-api-key

# LLM Providers (fallback global â tenants configuram os seus no dashboard)
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
GOOGLE_AI_API_KEY=your-google-key

# App
API_PORT=3001
WEBHOOK_SECRET=your-webhook-secret
```

- [ ] **Step 9: Criar estrutura de diretÃ³rios**

```bash
mkdir -p apps/api apps/worker apps/web packages/shared packages/database packages/queue
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: initialize monorepo with turborepo and pnpm workspaces"
```

---

### Task 2: Package `@aula-agente/shared` â Tipos, Constantes e ValidaÃ§Ãµes

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types/organization.ts`
- Create: `packages/shared/src/types/agent.ts`
- Create: `packages/shared/src/types/conversation.ts`
- Create: `packages/shared/src/types/message.ts`
- Create: `packages/shared/src/types/contact.ts`
- Create: `packages/shared/src/types/evolution.ts`
- Create: `packages/shared/src/types/knowledge.ts`
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/schemas/organization.ts`
- Create: `packages/shared/src/schemas/agent.ts`
- Create: `packages/shared/src/schemas/conversation.ts`
- Create: `packages/shared/src/schemas/message.ts`
- Create: `packages/shared/src/schemas/contact.ts`
- Create: `packages/shared/src/schemas/evolution.ts`
- Create: `packages/shared/src/schemas/knowledge.ts`
- Create: `packages/shared/src/schemas/index.ts`

- [ ] **Step 1: Criar package.json do shared**

Criar `packages/shared/package.json`:
```json
{
  "name": "@aula-agente/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "echo 'no lint configured'"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

- [ ] **Step 2: Criar tsconfig.json do shared**

Criar `packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Criar tipos de Organization**

Criar `packages/shared/src/types/organization.ts`:
```typescript
export type OrganizationPlan = "free" | "pro" | "enterprise";

export type MemberRole = "owner" | "admin" | "agent";

export type InvitationStatus = "pending" | "accepted" | "expired";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrganizationPlan;
  settings: OrganizationSettings;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSettings {
  max_documents: number;
  max_agents: number;
  max_instances: number;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: Exclude<MemberRole, "owner">;
  invited_by: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
}

export interface OrganizationSecret {
  id: string;
  organization_id: string;
  provider: LLMProvider;
  encrypted_key: string;
  created_at: string;
  updated_at: string;
}

export type LLMProvider = "openai" | "anthropic" | "google";
```

- [ ] **Step 4: Criar tipos de Agent**

Criar `packages/shared/src/types/agent.ts`:
```typescript
import type { LLMProvider } from "./organization";

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  provider: LLMProvider;
  temperature: number;
  max_tokens: number;
  tools_config: ToolsConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ToolsConfig {
  search_knowledge: boolean;
  search_faq: boolean;
}
```

- [ ] **Step 5: Criar tipos de Contact**

Criar `packages/shared/src/types/contact.ts`:
```typescript
export interface Contact {
  id: string;
  organization_id: string;
  phone: string;
  name: string | null;
  photo_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 6: Criar tipos de Conversation**

Criar `packages/shared/src/types/conversation.ts`:
```typescript
export type ConversationStatus = "open" | "waiting" | "resolved" | "closed";

export interface Conversation {
  id: string;
  organization_id: string;
  agent_id: string;
  evolution_instance_id: string;
  contact_id: string;
  status: ConversationStatus;
  is_human_takeover: boolean;
  human_takeover_at: string | null;
  assigned_to: string | null;
  tags: string[];
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationNote {
  id: string;
  conversation_id: string;
  organization_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMetrics {
  id: string;
  conversation_id: string;
  organization_id: string;
  first_response_time_ms: number | null;
  resolution_time_ms: number | null;
  message_count: number;
  human_messages_count: number;
  satisfaction_rating: number | null;
  created_at: string;
}
```

- [ ] **Step 7: Criar tipos de Message**

Criar `packages/shared/src/types/message.ts`:
```typescript
export type MessageRole = "contact" | "agent" | "human_agent" | "system";

export type MediaType = "text" | "image" | "audio" | "video" | "document" | "sticker" | "location";

export interface Message {
  id: string;
  conversation_id: string;
  organization_id: string;
  evolution_message_id: string | null;
  role: MessageRole;
  content: string;
  media_url: string | null;
  media_type: MediaType | null;
  metadata: MessageMetadata | null;
  created_at: string;
}

export interface MessageMetadata {
  model?: string;
  tokens_used?: number;
  latency_ms?: number;
  tool_calls?: string[];
}
```

- [ ] **Step 8: Criar tipos de Evolution**

Criar `packages/shared/src/types/evolution.ts`:
```typescript
export type InstanceStatus = "connected" | "disconnected" | "connecting";

export interface EvolutionInstance {
  id: string;
  organization_id: string;
  instance_name: string;
  instance_id: string;
  status: InstanceStatus;
  phone_number: string | null;
  webhook_url: string | null;
  active_agent_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 9: Criar tipos de Knowledge**

Criar `packages/shared/src/types/knowledge.ts`:
```typescript
export type DocumentStatus = "processing" | "ready" | "error";

export type DocumentFileType = "pdf" | "txt" | "md" | "docx" | "csv";

export interface KnowledgeDocument {
  id: string;
  agent_id: string;
  organization_id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_type: DocumentFileType;
  file_size_bytes: number;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  organization_id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  chunk_index: number;
  created_at: string;
}

export interface KnowledgeFaq {
  id: string;
  agent_id: string;
  organization_id: string;
  question: string;
  answer: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 10: Criar barrel export dos tipos**

Criar `packages/shared/src/types/index.ts`:
```typescript
export * from "./organization";
export * from "./agent";
export * from "./contact";
export * from "./conversation";
export * from "./message";
export * from "./evolution";
export * from "./knowledge";
```

- [ ] **Step 11: Criar constantes**

Criar `packages/shared/src/constants.ts`:
```typescript
export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const ALLOWED_DOCUMENT_TYPES = ["pdf", "txt", "md", "docx", "csv"] as const;

export const ALLOWED_DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
};

export const CONVERSATION_STATUSES = ["open", "waiting", "resolved", "closed"] as const;

export const MESSAGE_ROLES = ["contact", "agent", "human_agent", "system"] as const;

export const MEMBER_ROLES = ["owner", "admin", "agent"] as const;

export const LLM_PROVIDERS = ["openai", "anthropic", "google"] as const;

export const INSTANCE_STATUSES = ["connected", "disconnected", "connecting"] as const;

export const HUMAN_TAKEOVER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const EMBEDDING_DIMENSION = 1536;

export const DEFAULT_AGENT_SETTINGS = {
  temperature: 0.7,
  max_tokens: 1024,
  model: "gpt-4o-mini",
  provider: "openai" as const,
};

export const QUEUE_NAMES = {
  PROCESS_MESSAGE: "process-message",
  SEND_MESSAGE: "send-message",
  PROCESS_DOCUMENT: "process-document",
  TAKEOVER_TIMEOUT: "takeover-timeout",
} as const;
```

- [ ] **Step 12: Criar schemas Zod â Organization**

Criar `packages/shared/src/schemas/organization.ts`:
```typescript
import { z } from "zod";

export const organizationSettingsSchema = z.object({
  max_documents: z.number().int().positive().default(100),
  max_agents: z.number().int().positive().default(5),
  max_instances: z.number().int().positive().default(3),
});

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  plan: z.enum(["free", "pro", "enterprise"]).default("free"),
  settings: organizationSettingsSchema.optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "agent"]),
});
```

- [ ] **Step 13: Criar schemas Zod â Agent**

Criar `packages/shared/src/schemas/agent.ts`:
```typescript
import { z } from "zod";

export const toolsConfigSchema = z.object({
  search_knowledge: z.boolean().default(true),
  search_faq: z.boolean().default(true),
});

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  system_prompt: z.string().min(1).max(10000),
  model: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "google"]),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(16384).default(1024),
  tools_config: toolsConfigSchema.default({ search_knowledge: true, search_faq: true }),
});

export const updateAgentSchema = createAgentSchema.partial();
```

- [ ] **Step 14: Criar schemas Zod â Conversation**

Criar `packages/shared/src/schemas/conversation.ts`:
```typescript
import { z } from "zod";

export const updateConversationSchema = z.object({
  status: z.enum(["open", "waiting", "resolved", "closed"]).optional(),
  is_human_takeover: z.boolean().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const createConversationNoteSchema = z.object({
  content: z.string().min(1).max(5000),
});
```

- [ ] **Step 15: Criar schemas Zod â Message**

Criar `packages/shared/src/schemas/message.ts`:
```typescript
import { z } from "zod";

export const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  content: z.string().min(1).max(10000),
});
```

- [ ] **Step 16: Criar schemas Zod â Contact**

Criar `packages/shared/src/schemas/contact.ts`:
```typescript
import { z } from "zod";

export const upsertContactSchema = z.object({
  phone: z.string().min(10).max(20),
  name: z.string().max(200).nullable().default(null),
  photo_url: z.string().url().nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
});
```

- [ ] **Step 17: Criar schemas Zod â Evolution**

Criar `packages/shared/src/schemas/evolution.ts`:
```typescript
import { z } from "zod";

export const createInstanceSchema = z.object({
  instance_name: z.string().min(1).max(100),
});

export const updateInstanceSchema = z.object({
  active_agent_id: z.string().uuid().nullable().optional(),
});

export const evolutionWebhookPayloadSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string(),
    }),
    message: z.object({
      conversation: z.string().optional(),
      imageMessage: z.object({ caption: z.string().optional() }).optional(),
      audioMessage: z.object({}).optional(),
      videoMessage: z.object({ caption: z.string().optional() }).optional(),
      documentMessage: z.object({ fileName: z.string().optional() }).optional(),
      stickerMessage: z.object({}).optional(),
      locationMessage: z.object({
        degreesLatitude: z.number().optional(),
        degreesLongitude: z.number().optional(),
      }).optional(),
    }).passthrough().optional(),
    messageType: z.string(),
    pushName: z.string().optional(),
    messageTimestamp: z.number().optional(),
  }),
});
```

- [ ] **Step 18: Criar schemas Zod â Knowledge**

Criar `packages/shared/src/schemas/knowledge.ts`:
```typescript
import { z } from "zod";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE_BYTES } from "../constants";

export const uploadDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  agent_id: z.string().uuid(),
});

export const validateDocumentFile = z.object({
  file_name: z.string().min(1),
  file_size_bytes: z.number().int().positive().max(MAX_DOCUMENT_SIZE_BYTES),
  file_type: z.enum(ALLOWED_DOCUMENT_TYPES),
});

export const createFaqSchema = z.object({
  agent_id: z.string().uuid(),
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(5000),
});

export const updateFaqSchema = z.object({
  question: z.string().min(1).max(1000).optional(),
  answer: z.string().min(1).max(5000).optional(),
  is_active: z.boolean().optional(),
});
```

- [ ] **Step 19: Criar barrel export dos schemas**

Criar `packages/shared/src/schemas/index.ts`:
```typescript
export * from "./organization";
export * from "./agent";
export * from "./conversation";
export * from "./message";
export * from "./contact";
export * from "./evolution";
export * from "./knowledge";
```

- [ ] **Step 20: Criar index.ts principal**

Criar `packages/shared/src/index.ts`:
```typescript
export * from "./types/index";
export * from "./schemas/index";
export * from "./constants";
```

- [ ] **Step 21: Instalar dependÃªncias e verificar tipagem**

```bash
cd packages/shared && pnpm install && pnpm typecheck
```

- [ ] **Step 22: Commit**

```bash
git add packages/shared/
git commit -m "feat: add @aula-agente/shared package with types, schemas, and constants"
```

---

### Task 3: Package `@aula-agente/database` â Supabase Client + Queries

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/admin.ts`
- Create: `packages/database/src/queries/organizations.ts`
- Create: `packages/database/src/queries/agents.ts`
- Create: `packages/database/src/queries/contacts.ts`
- Create: `packages/database/src/queries/conversations.ts`
- Create: `packages/database/src/queries/messages.ts`
- Create: `packages/database/src/queries/evolution-instances.ts`
- Create: `packages/database/src/queries/knowledge.ts`
- Create: `packages/database/src/queries/index.ts`

- [ ] **Step 1: Criar package.json**

Criar `packages/database/package.json`:
```json
{
  "name": "@aula-agente/database",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint configured'"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "@aula-agente/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Criar tsconfig.json**

Criar `packages/database/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Criar client.ts (browser/anon)**

Criar `packages/database/src/client.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient(url: string, anonKey: string) {
  return createClient(url, anonKey);
}
```

- [ ] **Step 4: Criar admin.ts (service_role)**

Criar `packages/database/src/admin.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}
```

- [ ] **Step 5-12: Criar queries/*.ts**

Conteúdo completo das queries (organizations, agents, contacts, conversations, messages, evolution-instances, knowledge) + barrel exports e index.ts. Ver `packages/database/src/queries/` no repo para implementação atual.

- [ ] **Step 13: Instalar dependÃªncias e verificar tipagem**

```bash
cd packages/database && pnpm install && pnpm typecheck
```

- [ ] **Step 14: Commit**

```bash
git add packages/database/
git commit -m "feat: add @aula-agente/database package with supabase client and queries"
```

---

### Task 4: Package `@aula-agente/queue` â DefiniÃ§Ãµes BullMQ

**Files:**
- Create: `packages/queue/package.json`
- Create: `packages/queue/tsconfig.json`
- Create: `packages/queue/src/index.ts`
- Create: `packages/queue/src/connection.ts`
- Create: `packages/queue/src/queues.ts`
- Create: `packages/queue/src/types.ts`

Implementação: BullMQ Queues para `process-message`, `send-message`, `process-document`, `takeover-timeout` com retry exponencial e configurações de remoção de jobs concluídos. Ver `packages/queue/src/` para detalhes.

- [ ] Commit: `feat: add @aula-agente/queue package with BullMQ queue definitions`

---

### Task 5: Supabase Schema â Migrations SQL

**Files:**
- `supabase/migrations/00001_enable_extensions.sql` â uuid-ossp, vector, pgsodium
- `supabase/migrations/00002_organizations.sql` â organizations, members, invitations, secrets + triggers updated_at
- `supabase/migrations/00003_contacts.sql`
- `supabase/migrations/00004_agents.sql`
- `supabase/migrations/00005_evolution_instances.sql`
- `supabase/migrations/00006_knowledge.sql` â documents, chunks (vector 1536 com HNSW), faqs
- `supabase/migrations/00007_conversations.sql` â conversations, messages (com idx UNIQUE evolution_message_id), notes, metrics
- `supabase/migrations/00008_rls_policies.sql` â RLS em todas tabelas + helper `get_user_org_ids()` + policies por tabela
- `supabase/migrations/00009_functions.sql` â `search_knowledge_chunks` (RPC pgvector) + `accept_invitation`

- [ ] Commit: `feat: add supabase migrations with full schema, RLS policies, and functions`

---

### Task 6: Docker Compose + App Bootstraps

**Files:**
- `docker-compose.yml` â api, worker, redis (em Fase 1; evolution + evolution-postgres adicionados depois)
- `apps/api/{package.json, tsconfig.json, Dockerfile, src/server.ts}` â Fastify health-check
- `apps/worker/{package.json, tsconfig.json, Dockerfile, src/index.ts, healthcheck.js}` â conexão Redis com graceful shutdown

- [ ] Commit: `feat: add docker-compose, api server bootstrap, and worker bootstrap`

---

### Task 7: VerificaÃ§Ã£o Final da Fase 1

- [ ] `pnpm typecheck` â sem erros
- [ ] `docker compose config --quiet` â compose válido
- [ ] Estrutura de arquivos verificada
