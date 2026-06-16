# Fase 3: Worker & Agente â Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o Worker BullMQ com processamento de mensagens (AI SDK + tools), pipeline de RAG (chunking + embeddings + pgvector), envio de mensagens via Evolution API, lock por conversa, e vault integration para API keys.

**Architecture:** Worker roda como processo independente consumindo 4 filas BullMQ. process-message adquire lock Redis por conversa, resolve API key do tenant via vault, e chama AI SDK com tools registradas dinamicamente. process-document faz chunking e gera embeddings.

**Tech Stack:** BullMQ, Vercel AI SDK, OpenAI SDK, ioredis, Supabase JS

**Depends on:** Fase 1 (packages), Fase 2 (API server, services)

---

### Task 1: Redis Lock para Processamento Sequencial por Conversa

**Files:** `apps/worker/src/lib/lock.ts`

Implementa lock distribuído via Redis com `SET NX PX` e Lua script atômico para release. TTL de 60s, retry de 500ms até 20 tentativas (10s max wait).

```typescript
import { getRedisConnection } from "@aula-agente/queue";

const LOCK_PREFIX = "lock:conversation:";
const LOCK_TTL_MS = 60_000;
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 20;

export async function acquireConversationLock(conversationId: string): Promise<string | null> {
  const redis = getRedisConnection();
  const lockKey = `${LOCK_PREFIX}${conversationId}`;
  const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const result = await redis.set(lockKey, lockValue, "PX", LOCK_TTL_MS, "NX");
    if (result === "OK") return lockValue;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return null;
}

export async function releaseConversationLock(conversationId: string, lockValue: string) {
  const redis = getRedisConnection();
  const lockKey = `${LOCK_PREFIX}${conversationId}`;
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.call("EVAL", luaScript, "1", lockKey, lockValue);
}
```

- [ ] Commit: `feat(worker): add Redis conversation lock with TTL and retry`

---

### Task 2: Vault Integration â Resolver API Keys do Tenant

**Files:** `apps/worker/src/lib/vault.ts`

Resolução com cache de 5min em memória. Prioridade: organization_secrets â env var fallback. Lança erro se nada disponível.

```typescript
import { getAdminClient } from "@aula-agente/database";
import type { LLMProvider } from "@aula-agente/shared";

const keyCache = new Map<string, { key: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const ENV_FALLBACKS: Record<LLMProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

export async function resolveApiKey(organizationId: string, provider: LLMProvider): Promise<string> {
  const cacheKey = `${organizationId}:${provider}`;
  const cached = keyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const db = getAdminClient();
  const { data } = await db
    .from("organization_secrets")
    .select("encrypted_key")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (data?.encrypted_key) {
    keyCache.set(cacheKey, { key: data.encrypted_key, expiresAt: Date.now() + CACHE_TTL_MS });
    return data.encrypted_key;
  }

  const envKey = process.env[ENV_FALLBACKS[provider]];
  if (!envKey) throw new Error(`No API key for "${provider}" in org "${organizationId}" or env`);
  return envKey;
}
```

- [ ] Commit: `feat(worker): add vault integration for tenant API key resolution`

---

### Task 3: Tool â Search Knowledge (RAG)

**Files:** `apps/worker/src/agents/tools/search-knowledge.ts`

Gera embedding da query via OpenAI text-embedding-3-small e busca top-5 chunks via RPC `search_knowledge_chunks` no pgvector. Retorna texto formatado com similaridade.

- [ ] Commit: `feat(worker): add RAG search knowledge tool with pgvector`

---

### Task 4: Tool â Search FAQ

**Files:** `apps/worker/src/agents/tools/search-faq.ts`

Keyword matching simples: divide query em palavras (>2 chars), conta matches em question+answer, retorna top 3 com score >0.3.

- [ ] Commit: `feat(worker): add FAQ search tool with keyword matching`

---

### Task 5: Tool Registry

**Files:** `apps/worker/src/agents/tools/registry.ts`

Constrói dinamicamente o objeto de tools baseado em `agent.tools_config`. Permite ligar/desligar `searchKnowledge` e `searchFaq` por agente.

- [ ] Commit: `feat(worker): add tool registry for dynamic agent tool configuration`

---

### Task 6: Agent Runner â Orquestrador AI SDK

**Files:** `apps/worker/src/agents/agent-runner.ts`

`runAgent({agent, messages, currentMessage, apiKey, organizationId})`:
- Cria model via factory (openai/anthropic/google) com apiKey do tenant
- Constrói tools via registry
- `generateText` com history + tools, maxSteps=5 para tool calling loop
- Retorna `{text, model, tokensUsed, latencyMs, toolCalls}`

Nota: AI SDK v6 usa `inputSchema` ao invés de `parameters` e `stopWhen` ao invés de `maxSteps`.

- [ ] Commit: `feat(worker): add agent runner with AI SDK multi-provider and tool calling`

---

### Task 7: Worker â Process Message

**Files:** `apps/worker/src/workers/process-message.ts`

Fluxo:
1. Adquire conversation lock
2. Carrega agent (verifica is_active)
3. Recheca conversation.is_human_takeover (skip se true)
4. Resolve API key via vault
5. Carrega últimas 20 messages como history
6. Roda agent com runAgent
7. Salva agent message + metadata
8. Atualiza conversation (last_message_at, status=waiting)
9. Enfileira send-message
10. Libera lock no finally

Concorrência: 10 jobs paralelos (com lock por conversa garantindo serialização).

- [ ] Commit: `feat(worker): add process-message worker with lock, vault, and agent runner`

---

### Task 8: Worker â Send Message

**Files:** `apps/worker/src/workers/send-message.ts`

Chama Evolution API `POST /message/sendText/{instance}` com number+text. Concorrência 20, rate limit 30/sec.

- [ ] Commit: `feat(worker): add send-message worker with rate limiting`

---

### Task 9: Embeddings Pipeline â Chunker + Embedder

**Files:**
- `apps/worker/src/embeddings/chunker.ts` â CHUNK_SIZE=1000, OVERLAP=200, quebra em paragraph/sentence boundaries
- `apps/worker/src/embeddings/embedder.ts` â `generateEmbedding` (1) e `generateEmbeddings` (batch 100) via OpenAI text-embedding-3-small

- [ ] Commit: `feat(worker): add text chunker and embedding generator`

---

### Task 10: Worker â Process Document

**Files:** `apps/worker/src/workers/process-document.ts`

1. Carrega documento, fetch do file_url
2. Extrai texto (TODO: pdf-parse/mammoth/etc; por ora tudo como text)
3. Chunk → batch embeddings → insert chunks com vector
4. Update document.status = 'ready' / 'error' com mensagem

Concorrência: 3 docs paralelos.

- [ ] Commit: `feat(worker): add process-document worker with chunking and embeddings`

---

### Task 11: Worker â Takeover Timeout

**Files:** `apps/worker/src/workers/takeover-timeout.ts`

Job recorrente (`upsertJobScheduler`, every 5min). Busca conversas com `is_human_takeover=true` e `human_takeover_at < now-30min`, devolve ao agente (flag false, timestamp null).

- [ ] Commit: `feat(worker): add takeover timeout worker with scheduled cleanup`

---

### Task 12: Worker Bootstrap â Registrar Todos os Workers

**Files:** Modify `apps/worker/src/index.ts`

```typescript
import "dotenv/config";
import { startProcessMessageWorker } from "./workers/process-message";
import { startSendMessageWorker } from "./workers/send-message";
import { startProcessDocumentWorker } from "./workers/process-document";
import { startTakeoverTimeoutWorker } from "./workers/takeover-timeout";

async function main() {
  const workers = [
    startProcessMessageWorker(),
    startSendMessageWorker(),
    startProcessDocumentWorker(),
    startTakeoverTimeoutWorker(),
  ];
  console.log(`${workers.length} workers started`);

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Dependências: `pnpm add ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google zod`

- [ ] Commit: `feat(worker): register all workers in bootstrap and add AI SDK dependencies`

---

### Task 13: VerificaÃ§Ã£o Final da Fase 3

- [ ] `pnpm typecheck` â sem erros
- [ ] Worker inicia e loga "4 workers started successfully"
