# Fase 2: Backend Core â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o API Server Fastify com webhook da Evolution API (idempotÃªncia inclusa), serviÃ§os de negÃ³cio, middleware de autenticaÃ§Ã£o, e integraÃ§Ã£o com filas BullMQ.

**Architecture:** Fastify server recebe webhooks da Evolution API e requisiÃ§Ãµes autenticadas do dashboard. Valida, processa, e enfileira jobs no BullMQ. NÃ£o faz processamento LLM â apenas orquestra.

**Tech Stack:** Fastify 5, TypeScript, Supabase JS SDK, BullMQ, Zod, @fastify/multipart, @fastify/cors

**Depends on:** Fase 1 (monorepo, packages, schema)

---

### Task 1: Middleware de AutenticaÃ§Ã£o JWT

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/lib/supabase.ts`

- [ ] **Step 1: Criar lib/supabase.ts**

Criar `apps/api/src/lib/supabase.ts`:
```typescript
import { getAdminClient } from "@aula-agente/database";

export function getSupabase() {
  return getAdminClient();
}
```

- [ ] **Step 2: Criar middleware/auth.ts**

Criar `apps/api/src/middleware/auth.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }

  // Fetch user's organizations
  const { data: memberships, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id);

  if (memberError) {
    return reply.status(500).send({ error: "Failed to fetch user memberships" });
  }

  request.user = {
    id: user.id,
    email: user.email!,
    memberships: memberships || [],
  };
}

// Middleware to require specific org access
export function requireOrg(request: FastifyRequest, reply: FastifyReply) {
  const orgId = (request.params as Record<string, string>).organizationId
    || (request.body as Record<string, string>)?.organization_id
    || request.headers["x-organization-id"] as string;

  if (!orgId) {
    return reply.status(400).send({ error: "Missing organization ID" });
  }

  const membership = request.user.memberships.find(
    (m: { organization_id: string }) => m.organization_id === orgId
  );

  if (!membership) {
    return reply.status(403).send({ error: "Not a member of this organization" });
  }

  request.organizationId = orgId;
  request.userRole = membership.role;
}

// Augment Fastify types
declare module "fastify" {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      memberships: Array<{ organization_id: string; role: string }>;
    };
    organizationId: string;
    userRole: string;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/ apps/api/src/lib/
git commit -m "feat(api): add JWT auth middleware with org-scoped access control"
```

---

### Task 2: Middleware de VerificaÃ§Ã£o de Webhook

**Files:**
- Create: `apps/api/src/middleware/webhook-verify.ts`

- [ ] **Step 1: Criar webhook-verify.ts**

Criar `apps/api/src/middleware/webhook-verify.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from "fastify";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function webhookVerifyMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // If no secret configured, skip verification (dev mode)
  if (!WEBHOOK_SECRET) {
    request.log.warn("WEBHOOK_SECRET not set â skipping webhook verification");
    return;
  }

  const apiKey = request.headers["apikey"] as string
    || request.headers["x-api-key"] as string;

  if (!apiKey || apiKey !== WEBHOOK_SECRET) {
    return reply.status(401).send({ error: "Invalid webhook secret" });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/middleware/webhook-verify.ts
git commit -m "feat(api): add webhook verification middleware"
```

---

### Task 3: Evolution API Service

**Files:**
- Create: `apps/api/src/services/evolution.service.ts`

- [ ] **Step 1: Criar evolution.service.ts**

Criar `apps/api/src/services/evolution.service.ts`:
```typescript
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL!;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY!;

interface SendTextPayload {
  number: string;
  text: string;
}

async function evolutionFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${EVOLUTION_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Evolution API error ${response.status}: ${body}`);
  }

  return response.json();
}

export async function createInstance(instanceName: string, webhookUrl: string) {
  return evolutionFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}

export async function getInstanceStatus(instanceName: string) {
  return evolutionFetch(`/instance/connectionState/${instanceName}`);
}

export async function getInstanceQrCode(instanceName: string) {
  return evolutionFetch(`/instance/connect/${instanceName}`);
}

export async function sendText(instanceName: string, payload: SendTextPayload) {
  return evolutionFetch(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({
      number: payload.number,
      text: payload.text,
    }),
  });
}

export async function deleteInstance(instanceName: string) {
  return evolutionFetch(`/instance/delete/${instanceName}`, {
    method: "DELETE",
  });
}

export async function logoutInstance(instanceName: string) {
  return evolutionFetch(`/instance/logout/${instanceName}`, {
    method: "DELETE",
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/evolution.service.ts
git commit -m "feat(api): add Evolution API service wrapper"
```

---

### Task 4: Conversation & Message Services

**Files:**
- Create: `apps/api/src/services/conversation.service.ts`
- Create: `apps/api/src/services/message.service.ts`

- [ ] **Step 1: Criar conversation.service.ts**

Criar `apps/api/src/services/conversation.service.ts`:
```typescript
import { getAdminClient } from "@aula-agente/database";
import {
  findOpenConversation,
  createConversation,
  updateConversation,
} from "@aula-agente/database";
import { upsertContact } from "@aula-agente/database";

interface EnsureConversationParams {
  organizationId: string;
  agentId: string;
  instanceId: string;
  phone: string;
  contactName: string | null;
  contactPhotoUrl: string | null;
}

export async function ensureConversation(params: EnsureConversationParams) {
  const db = getAdminClient();

  // Upsert contact
  const contact = await upsertContact(
    db,
    params.organizationId,
    params.phone,
    params.contactName,
    params.contactPhotoUrl
  );

  // Find existing open conversation
  const existing = await findOpenConversation(db, contact.id, params.agentId);

  if (existing) {
    return { conversation: existing, contact, isNew: false };
  }

  // Create new conversation
  const conversation = await createConversation(db, {
    organization_id: params.organizationId,
    agent_id: params.agentId,
    evolution_instance_id: params.instanceId,
    contact_id: contact.id,
    status: "open",
    is_human_takeover: false,
    human_takeover_at: null,
    assigned_to: null,
    tags: [],
    last_message_at: new Date().toISOString(),
  });

  return { conversation, contact, isNew: true };
}

export async function setHumanTakeover(conversationId: string, takeover: boolean) {
  const db = getAdminClient();
  return updateConversation(db, conversationId, {
    is_human_takeover: takeover,
    human_takeover_at: takeover ? new Date().toISOString() : null,
  });
}
```

- [ ] **Step 2: Criar message.service.ts**

Criar `apps/api/src/services/message.service.ts`:
```typescript
import { getAdminClient } from "@aula-agente/database";
import { createMessage, messageExistsByEvolutionId } from "@aula-agente/database";
import { updateConversation } from "@aula-agente/database";
import type { MessageRole, MediaType } from "@aula-agente/shared";

interface SaveMessageParams {
  conversationId: string;
  organizationId: string;
  evolutionMessageId: string | null;
  role: MessageRole;
  content: string;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  metadata?: Record<string, unknown> | null;
}

export async function saveMessage(params: SaveMessageParams) {
  const db = getAdminClient();

  // Idempotency check
  if (params.evolutionMessageId) {
    const exists = await messageExistsByEvolutionId(db, params.evolutionMessageId);
    if (exists) {
      return null; // Already processed
    }
  }

  const message = await createMessage(db, {
    conversation_id: params.conversationId,
    organization_id: params.organizationId,
    evolution_message_id: params.evolutionMessageId,
    role: params.role,
    content: params.content,
    media_url: params.mediaUrl || null,
    media_type: params.mediaType || null,
    metadata: params.metadata || null,
  });

  // Update conversation last_message_at
  await updateConversation(db, params.conversationId, {
    last_message_at: new Date().toISOString(),
  });

  return message;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/conversation.service.ts apps/api/src/services/message.service.ts
git commit -m "feat(api): add conversation and message services"
```

---

### Task 5: Knowledge Service

**Files:**
- Create: `apps/api/src/services/knowledge.service.ts`

- [ ] **Step 1: Criar knowledge.service.ts**

Criar `apps/api/src/services/knowledge.service.ts`:
```typescript
import { getAdminClient } from "@aula-agente/database";
import { createDocument } from "@aula-agente/database";
import { getProcessDocumentQueue } from "@aula-agente/queue";
import { MAX_DOCUMENT_SIZE_BYTES, ALLOWED_DOCUMENT_TYPES } from "@aula-agente/shared";
import type { DocumentFileType } from "@aula-agente/shared";

interface UploadDocumentParams {
  organizationId: string;
  agentId: string;
  title: string;
  fileName: string;
  fileBuffer: Buffer;
  fileType: DocumentFileType;
}

export async function uploadDocument(params: UploadDocumentParams) {
  const { organizationId, agentId, title, fileName, fileBuffer, fileType } = params;

  // Validate file type
  if (!ALLOWED_DOCUMENT_TYPES.includes(fileType as any)) {
    throw new Error(`Invalid file type: ${fileType}. Allowed: ${ALLOWED_DOCUMENT_TYPES.join(", ")}`);
  }

  // Validate file size
  if (fileBuffer.length > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(`File too large. Max size: ${MAX_DOCUMENT_SIZE_BYTES / 1024 / 1024}MB`);
  }

  const db = getAdminClient();

  // Upload to Supabase Storage
  const storagePath = `${organizationId}/${agentId}/${Date.now()}-${fileName}`;
  const { error: storageError } = await db.storage
    .from("knowledge-documents")
    .upload(storagePath, fileBuffer, {
      contentType: `application/${fileType}`,
      upsert: false,
    });

  if (storageError) throw storageError;

  const { data: urlData } = db.storage
    .from("knowledge-documents")
    .getPublicUrl(storagePath);

  // Create document record
  const document = await createDocument(db, {
    organization_id: organizationId,
    agent_id: agentId,
    title,
    file_name: fileName,
    file_url: urlData.publicUrl,
    file_type: fileType,
    file_size_bytes: fileBuffer.length,
    status: "processing",
  });

  // Enqueue processing job
  const queue = getProcessDocumentQueue();
  await queue.add("process-document", {
    documentId: document.id,
    organizationId,
    agentId,
  });

  return document;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/services/knowledge.service.ts
git commit -m "feat(api): add knowledge service with document upload and queue integration"
```

---

### Task 6: Webhook Route â Evolution API

**Files:**
- Create: `apps/api/src/routes/webhooks/evolution.ts`
- Create: `apps/api/src/lib/queue.ts`

- [ ] **Step 1: Criar lib/queue.ts**

Criar `apps/api/src/lib/queue.ts`:
```typescript
import { getProcessMessageQueue, getSendMessageQueue } from "@aula-agente/queue";

export function enqueueProcessMessage(data: {
  conversationId: string;
  messageId: string;
  agentId: string;
  organizationId: string;
}) {
  const queue = getProcessMessageQueue();
  return queue.add("process-message", data);
}

export function enqueueSendMessage(data: {
  conversationId: string;
  messageId: string;
  instanceId: string;
  phone: string;
  content: string;
  organizationId: string;
}) {
  const queue = getSendMessageQueue();
  return queue.add("send-message", data);
}
```

- [ ] **Step 2: Criar routes/webhooks/evolution.ts**

Criar `apps/api/src/routes/webhooks/evolution.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { evolutionWebhookPayloadSchema } from "@aula-agente/shared";
import { getAdminClient, getInstanceByInstanceId } from "@aula-agente/database";
import { webhookVerifyMiddleware } from "../../middleware/webhook-verify";
import { ensureConversation } from "../../services/conversation.service";
import { saveMessage } from "../../services/message.service";
import { enqueueProcessMessage } from "../../lib/queue";

function extractMessageContent(data: Record<string, unknown>): { content: string; mediaType: string | null } {
  const message = data.message as Record<string, unknown> | undefined;
  const messageType = data.messageType as string;

  if (!message) return { content: "", mediaType: null };

  switch (messageType) {
    case "conversation":
      return { content: (message.conversation as string) || "", mediaType: null };
    case "imageMessage":
      return {
        content: (message.imageMessage as Record<string, string>)?.caption || "[imagem]",
        mediaType: "image",
      };
    case "audioMessage":
      return { content: "[audio]", mediaType: "audio" };
    case "videoMessage":
      return {
        content: (message.videoMessage as Record<string, string>)?.caption || "[video]",
        mediaType: "video",
      };
    case "documentMessage":
      return {
        content: (message.documentMessage as Record<string, string>)?.fileName || "[documento]",
        mediaType: "document",
      };
    case "stickerMessage":
      return { content: "[sticker]", mediaType: "sticker" };
    case "locationMessage": {
      const loc = message.locationMessage as Record<string, number> | undefined;
      return {
        content: `[location: ${loc?.degreesLatitude}, ${loc?.degreesLongitude}]`,
        mediaType: "location",
      };
    }
    default:
      return { content: "", mediaType: null };
  }
}

export default async function evolutionWebhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/evolution", {
    preHandler: [webhookVerifyMiddleware],
    handler: async (request, reply) => {
      const parseResult = evolutionWebhookPayloadSchema.safeParse(request.body);

      if (!parseResult.success) {
        request.log.warn({ errors: parseResult.error.issues }, "Invalid webhook payload");
        return reply.status(400).send({ error: "Invalid payload" });
      }

      const payload = parseResult.data;

      // Ignore messages from us
      if (payload.data.key.fromMe) {
        return reply.status(200).send({ ok: true, skipped: "fromMe" });
      }

      const instanceId = payload.instance;
      const evolutionMessageId = payload.data.key.id;
      const phone = payload.data.key.remoteJid.replace("@s.whatsapp.net", "");
      const contactName = payload.data.pushName || null;

      // Look up instance
      let instance;
      try {
        instance = await getInstanceByInstanceId(getAdminClient(), instanceId);
      } catch {
        request.log.warn({ instanceId }, "Unknown Evolution instance");
        return reply.status(200).send({ ok: true, skipped: "unknown_instance" });
      }

      // Check if instance has an active agent
      if (!instance.active_agent_id) {
        request.log.warn({ instanceId }, "Instance has no active agent");
        return reply.status(200).send({ ok: true, skipped: "no_agent" });
      }

      const organizationId = instance.organization_id;
      const agentId = instance.active_agent_id;

      // Ensure conversation exists
      const { conversation } = await ensureConversation({
        organizationId,
        agentId,
        instanceId: instance.id,
        phone,
        contactName,
        contactPhotoUrl: null,
      });

      // Extract message content
      const { content, mediaType } = extractMessageContent(payload.data as Record<string, unknown>);

      // Save message (with idempotency)
      const message = await saveMessage({
        conversationId: conversation.id,
        organizationId,
        evolutionMessageId,
        role: "contact",
        content,
        mediaType: mediaType as any,
      });

      // If message was already processed (duplicate webhook), skip
      if (!message) {
        return reply.status(200).send({ ok: true, skipped: "duplicate" });
      }

      // If human takeover is active, don't enqueue for LLM processing
      if (conversation.is_human_takeover) {
        return reply.status(200).send({ ok: true, skipped: "human_takeover" });
      }

      // Enqueue for LLM processing
      await enqueueProcessMessage({
        conversationId: conversation.id,
        messageId: message.id,
        agentId,
        organizationId,
      });

      return reply.status(200).send({ ok: true, messageId: message.id });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/webhooks/ apps/api/src/lib/queue.ts
git commit -m "feat(api): add Evolution webhook route with idempotency and queue integration"
```

---

### Task 7: Message Send Route (Human Agent)

**Files:**
- Create: `apps/api/src/routes/messages/send.ts`

- [ ] **Step 1: Criar routes/messages/send.ts**

Criar `apps/api/src/routes/messages/send.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { sendMessageSchema } from "@aula-agente/shared";
import { getAdminClient, getConversationById } from "@aula-agente/database";
import { getInstanceById } from "@aula-agente/database";
import { authMiddleware, requireOrg } from "../../middleware/auth";
import { saveMessage } from "../../services/message.service";
import { enqueueSendMessage } from "../../lib/queue";

export default async function messageSendRoutes(app: FastifyInstance) {
  app.post("/messages/send", {
    preHandler: [authMiddleware],
    handler: async (request, reply) => {
      const parseResult = sendMessageSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: parseResult.error.issues });
      }

      const { conversation_id, content } = parseResult.data;
      const db = getAdminClient();

      // Get conversation
      const conversation = await getConversationById(db, conversation_id);
      if (!conversation) {
        return reply.status(404).send({ error: "Conversation not found" });
      }

      // Check user has access to this org
      const membership = request.user.memberships.find(
        (m) => m.organization_id === conversation.organization_id
      );
      if (!membership) {
        return reply.status(403).send({ error: "Access denied" });
      }

      // Save human agent message
      const message = await saveMessage({
        conversationId: conversation_id,
        organizationId: conversation.organization_id,
        evolutionMessageId: null,
        role: "human_agent",
        content,
      });

      if (!message) {
        return reply.status(500).send({ error: "Failed to save message" });
      }

      // Get instance for sending
      const instance = await getInstanceById(db, conversation.evolution_instance_id);

      // Get contact phone from conversation
      const contact = conversation.contacts;

      // Enqueue send
      await enqueueSendMessage({
        conversationId: conversation_id,
        messageId: message.id,
        instanceId: instance.id,
        phone: contact.phone,
        content,
        organizationId: conversation.organization_id,
      });

      return reply.status(200).send({ ok: true, messageId: message.id });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/messages/
git commit -m "feat(api): add message send route for human agents"
```

---

### Task 8: Instances Routes (CRUD + Evolution API)

**Files:**
- Create: `apps/api/src/routes/instances/index.ts`

Implementação completa: rotas autenticadas para listar, criar, status, QR code, atribuir agente, deletar e logout de instâncias Evolution. Integra com `evolution.service.ts` e sincroniza estado entre Evolution API e Supabase. Ver código no repo para referência.

- [ ] Commit: `feat(api): add instance management routes with Evolution API integration`

---

### Task 9: Knowledge Routes (Upload + FAQs)

**Files:**
- Create: `apps/api/src/routes/knowledge/documents.ts` â upload via @fastify/multipart, listagem por agente, delete
- Create: `apps/api/src/routes/knowledge/faqs.ts` â CRUD de FAQs com validação Zod

Implementação completa no repo. Limites: 50MB upload, validação de extensão, RBAC (admin+ pode upload/delete).

- [ ] Commit: `feat(api): add knowledge routes for document upload and FAQ management`

---

### Task 10: Register All Routes in Server

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Atualizar server.ts com registro de todas as rotas**

Substituir conteÃºdo de `apps/api/src/server.ts`:
```typescript
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import evolutionWebhookRoutes from "./routes/webhooks/evolution";
import messageSendRoutes from "./routes/messages/send";
import instanceRoutes from "./routes/instances/index";
import knowledgeDocumentRoutes from "./routes/knowledge/documents";
import knowledgeFaqRoutes from "./routes/knowledge/faqs";

const server = Fastify({ logger: true });

// Plugins
server.register(cors, { origin: true });

// Health check
server.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Routes
server.register(evolutionWebhookRoutes);
server.register(messageSendRoutes);
server.register(instanceRoutes);
server.register(knowledgeDocumentRoutes);
server.register(knowledgeFaqRoutes);

// Start
const start = async () => {
  const port = parseInt(process.env.API_PORT || "3001", 10);
  await server.listen({ port, host: "0.0.0.0" });
  server.log.info(`API server running on port ${port}`);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verificar tipagem**

```bash
cd apps/api && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): register all routes in server bootstrap"
```

---

### Task 11: VerificaÃ§Ã£o Final da Fase 2

- [ ] **Step 1: Verificar tipagem do monorepo inteiro**

```bash
pnpm typecheck
```

Esperado: sem erros.

- [ ] **Step 2: Testar API server inicia**

```bash
pnpm dev:api
# Em outro terminal: curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"..."}
```

- [ ] **Step 3: Commit final se houver ajustes**

```bash
git add -A && git status
# Se houver mudanÃ§as:
git commit -m "chore: phase 2 final adjustments"
```
