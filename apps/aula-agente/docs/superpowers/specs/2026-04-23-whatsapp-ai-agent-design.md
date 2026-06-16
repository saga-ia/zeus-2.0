# WhatsApp AI Agent â Design Spec

## Overview

Agente de IA para atendimento ao cliente via WhatsApp, conectado Ã  Evolution API. Sistema multi-tenant com dashboard completo para gestÃ£o de agentes, conversas e instÃ¢ncias WhatsApp.

## DecisÃµes de Arquitetura

| Aspecto | DecisÃ£o |
|---------|---------|
| Caso de uso | Atendimento ao cliente / suporte |
| Arquitetura | Monorepo Turborepo |
| Backend | Fastify + TypeScript |
| Worker | BullMQ (processo separado) |
| Dashboard | Next.js + shadcn/ui + Tailwind |
| LLM | Vercel AI SDK (multi-provider) |
| Agente | Function calling com tools (RAG + FAQs) |
| Knowledge base | Documentos com pgvector + FAQs manuais |
| Banco | Supabase (PostgreSQL + pgvector + RLS + Realtime + Auth) |
| Cache/Filas | Redis + BullMQ |
| Multi-tenancy | Organizations com RLS |
| Inbox | Completo: takeover, atribuiÃ§Ã£o, notas, tags, mÃ©tricas |
| Evolution API | MÃºltiplas instÃ¢ncias por tenant |
| Deploy | Docker Compose em VPS, Supabase Cloud |

## Estrutura do Monorepo

```
aula_agente/
âââ apps/
â   âââ api/          # Fastify server â webhooks, REST endpoints
â   âââ worker/       # BullMQ consumers â LLM, embeddings, envio
â   âââ web/          # Next.js dashboard
âââ packages/
â   âââ shared/       # tipos, constantes, validaÃ§Ãµes (Zod)
â   âââ database/     # Supabase client, queries, tipos gerados
â   âââ queue/        # definiÃ§Ãµes de filas BullMQ compartilhadas
âââ docker-compose.yml
âââ turbo.json
âââ package.json
```

## Fluxo de Dados

### Mensagem Recebida (WhatsApp â Agente)

1. Evolution API recebe mensagem do WhatsApp, dispara webhook para API Server
2. API Server valida, identifica tenant e agente, salva mensagem no Supabase
3. Checagem de idempotÃªncia: verifica `evolution_message_id` Ãºnico para evitar duplicidade (webhook retries)
4. API Server enfileira job `process-message` no BullMQ
5. Worker consome o job com lock por `conversation_id` (apenas 1 job por conversa simultÃ¢neo)
6. Worker carrega contexto, chama AI SDK com tools
7. AI SDK executa tool calling loop (RAG, FAQs)
8. Worker salva resposta no Supabase, enfileira job `send-message`
9. Consumer envia resposta via Evolution API â WhatsApp

### IntervenÃ§Ã£o Humana

1. Operador marca conversa como "assumida" no dashboard
2. Flag `is_human_takeover` setada na conversa + `human_takeover_at` timestamp registrado
3. Novas mensagens do WhatsApp sÃ£o salvas mas Worker ignora (nÃ£o processa com LLM)
4. Operador responde pelo inbox â API Server envia via Evolution API (role: `human_agent`)
5. Operador devolve pro agente â flag removida, prÃ³xima mensagem processada pelo Worker
6. **Timeout automÃ¡tico:** job periÃ³dico verifica conversas com `is_human_takeover` hÃ¡ mais de 30min sem atividade humana e alerta/devolve ao agente

### Tipos de MÃ­dia Suportados

| Tipo | Tratamento |
|------|-----------|
| text | Processado diretamente pelo LLM |
| image | Salvo como media_url, descriÃ§Ã£o enviada ao LLM se model suporta vision |
| audio | Salvo como media_url, transcrito via Whisper antes de enviar ao LLM |
| video | Salvo como media_url, notifica operador (nÃ£o processado pelo agente) |
| document | Salvo como media_url, texto extraÃ­do se PDF/TXT antes de enviar ao LLM |
| sticker/location | Salvo como metadata, agente responde com fallback genÃ©rico |

## Schema do Banco de Dados

### Multi-tenancy

```sql
organizations (
  id uuid PK, name text, slug text UNIQUE,
  plan text, settings jsonb,
  created_at timestamptz, updated_at timestamptz
)
-- API keys dos LLM providers sÃ£o armazenadas no Supabase Vault (pgsodium)
-- Tabela auxiliar: organization_secrets (org_id, provider, encrypted_key)
-- O Worker busca a chave do tenant via vault. Env vars globais servem como fallback
-- para tenants que nÃ£o configuraram chaves prÃ³prias (ex: plano free com chave da plataforma)

organization_members (
  id uuid PK, organization_id uuid FK,
  user_id uuid FK (auth.users),
  role text CHECK (owner|admin|agent),
  created_at timestamptz, updated_at timestamptz
)

organization_invitations (
  id uuid PK, organization_id uuid FK,
  email text, role text CHECK (admin|agent),
  invited_by uuid FK (auth.users),
  status text CHECK (pending|accepted|expired),
  expires_at timestamptz,
  created_at timestamptz
)
```

### Secrets (Vault)

```sql
organization_secrets (
  id uuid PK, organization_id uuid FK,
  provider text CHECK (openai|anthropic|google),
  encrypted_key text,  -- via pgsodium transparent column encryption
  created_at timestamptz, updated_at timestamptz
)
-- Prioridade de resoluÃ§Ã£o de API key:
-- 1. organization_secrets (chave do tenant) â se existir, usa
-- 2. Env var global (OPENAI_API_KEY etc.) â fallback da plataforma
```

### Evolution API

```sql
evolution_instances (
  id uuid PK, organization_id uuid FK,
  instance_name text, instance_id text,
  status text CHECK (connected|disconnected|connecting),
  phone_number text,
  webhook_url text,
  active_agent_id uuid FK (agents) NULLABLE,  -- qual agente atende nesta instÃ¢ncia
  created_at timestamptz, updated_at timestamptz
)
-- QR code Ã© efÃªmero â buscado em tempo real da Evolution API, nÃ£o armazenado no banco
-- Constraint: apenas 1 agente ativo por instÃ¢ncia (active_agent_id UNIQUE nÃ£o necessÃ¡rio,
-- pois um agente pode ser desativado e outro ativado)
```

### Contatos

```sql
contacts (
  id uuid PK, organization_id uuid FK,
  phone text, name text, photo_url text,
  metadata jsonb,
  created_at timestamptz, updated_at timestamptz,
  UNIQUE(organization_id, phone)
)
```

### Agentes

```sql
agents (
  id uuid PK, organization_id uuid FK,
  name text, description text,
  system_prompt text, model text, provider text,
  temperature float, max_tokens int,
  tools_config jsonb,
  is_active boolean,
  created_at timestamptz, updated_at timestamptz
)
-- RelaÃ§Ã£o agente â instÃ¢ncia Ã© feita via evolution_instances.active_agent_id
-- Um agente pode nÃ£o estar vinculado a nenhuma instÃ¢ncia (configuraÃ§Ã£o prÃ©via)
-- Uma instÃ¢ncia tem no mÃ¡ximo 1 agente ativo
```

### Base de Conhecimento

```sql
knowledge_documents (
  id uuid PK, agent_id uuid FK, organization_id uuid FK,
  title text, file_name text, file_url text, file_type text,
  file_size_bytes int,
  status text CHECK (processing|ready|error),
  error_message text NULLABLE,
  chunk_count int, created_at timestamptz, updated_at timestamptz
)
-- Limites: max 50MB por arquivo, tipos aceitos: PDF, TXT, MD, DOCX, CSV
-- Quota: configurÃ¡vel por plano da organizaÃ§Ã£o (settings.max_documents)

knowledge_chunks (
  id uuid PK, document_id uuid FK, organization_id uuid FK,
  content text, metadata jsonb,
  embedding vector(1536),
  chunk_index int, created_at timestamptz
)
-- organization_id duplicado aqui para RLS direto (evita JOIN com documents na busca vetorial)
-- DimensÃ£o do embedding: 1536 (OpenAI text-embedding-3-small default)
-- Se necessÃ¡rio suportar outros modelos, criar coluna embedding_model e usar dimensÃ£o variÃ¡vel

knowledge_faqs (
  id uuid PK, agent_id uuid FK, organization_id uuid FK,
  question text, answer text,
  is_active boolean, created_at timestamptz, updated_at timestamptz
)
```

### Conversas & Mensagens

```sql
conversations (
  id uuid PK, organization_id uuid FK,
  agent_id uuid FK, evolution_instance_id uuid FK,
  contact_id uuid FK (contacts),
  status text CHECK (open|waiting|resolved|closed),
  is_human_takeover boolean DEFAULT false,
  human_takeover_at timestamptz NULLABLE,
  assigned_to uuid FK (auth.users) NULLABLE,
  tags text[],
  last_message_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)

messages (
  id uuid PK, conversation_id uuid FK, organization_id uuid FK,
  evolution_message_id text NULLABLE,  -- ID original da Evolution API para idempotÃªncia
  role text CHECK (contact|agent|human_agent|system),
  content text, media_url text, media_type text,
  metadata jsonb,  -- {model, tokens_used, latency_ms, tool_calls}
  created_at timestamptz
)

conversation_notes (
  id uuid PK, conversation_id uuid FK, organization_id uuid FK,
  user_id uuid FK, content text,
  created_at timestamptz, updated_at timestamptz
)

conversation_metrics (
  id uuid PK, conversation_id uuid FK, organization_id uuid FK,
  first_response_time_ms int, resolution_time_ms int,
  message_count int, human_messages_count int,
  satisfaction_rating int,
  created_at timestamptz
)
```

### Ãndices

- `conversations(organization_id, last_message_at DESC)`
- `conversations(organization_id, status)`
- `conversations(contact_id)`
- `contacts(organization_id, phone)` â UNIQUE
- `messages(conversation_id, created_at)`
- `messages(evolution_message_id)` â UNIQUE WHERE NOT NULL (idempotÃªncia)
- `knowledge_chunks(organization_id)` â para RLS
- `knowledge_chunks(embedding)` â HNSW ou IVFFlat
- `conversation_notes(organization_id)` â para RLS
- `conversation_metrics(organization_id)` â para RLS
- RLS em TODAS as tabelas filtrando por `organization_id` (coluna presente em cada tabela)

## Backend â API Server (`apps/api`)

### Estrutura

```
apps/api/src/
âââ server.ts
âââ routes/
â   âââ webhooks/evolution.ts
â   âââ messages/send.ts
â   âââ instances/index.ts
â   âââ agents/index.ts
â   âââ knowledge/
â       âââ documents.ts        â upload + CRUD documentos
â       âââ faqs.ts             â CRUD FAQs
âââ services/
â   âââ evolution.service.ts
â   âââ conversation.service.ts
â   âââ message.service.ts
â   âââ knowledge.service.ts   â upload â storage â enfileira process-document
âââ lib/
â   âââ supabase.ts
â   âââ redis.ts
â   âââ queue.ts
âââ middleware/
    âââ auth.ts
    âââ webhook-verify.ts
```

### Responsabilidades

- Receber webhooks da Evolution API e enfileirar processamento
- Endpoints para aÃ§Ãµes do dashboard (enviar msg manual, gerenciar instÃ¢ncias)
- Endpoints de knowledge base (upload documentos â Supabase Storage â enfileira `process-document`)
- AutenticaÃ§Ã£o via JWT Supabase
- NÃ£o processa LLM â apenas enfileira

### Webhook Flow

1. Valida assinatura/origin do webhook
2. Extrai: instanceId, phone, message, messageType, evolutionMessageId
3. **IdempotÃªncia:** checa se `evolution_message_id` jÃ¡ existe em `messages` â se sim, ignora (200 OK)
4. Busca `evolution_instance` â `organization_id` + `active_agent_id`
5. Upsert contato na tabela `contacts` (por phone + organization_id)
6. Upsert conversa (busca conversa aberta com mesmo contact_id + agent_id, cria se nÃ£o existe)
7. Salva mensagem no Supabase (role: 'contact', evolution_message_id setado)
8. Checa `is_human_takeover` â se sim, para aqui
9. Enfileira `process-message` com `{ conversationId, messageId, agentId }`

### Knowledge Upload Flow

1. Dashboard envia arquivo via `POST /knowledge/documents` (multipart)
2. API valida tipo e tamanho (max 50MB, tipos: PDF/TXT/MD/DOCX/CSV)
3. Upload para Supabase Storage (bucket por org)
4. Cria registro em `knowledge_documents` com status `processing`
5. Enfileira job `process-document` com `{ documentId, organizationId, agentId }`
6. Retorna documento com status `processing` â dashboard mostra progresso

## Worker BullMQ (`apps/worker`)

### Estrutura

```
apps/worker/src/
âââ index.ts
âââ workers/
â   âââ process-message.ts
â   âââ send-message.ts
â   âââ process-document.ts
â   âââ takeover-timeout.ts     â job periÃ³dico: verifica takeovers expirados
âââ agents/
â   âââ agent-runner.ts
â   âââ tools/
â       âââ search-knowledge.ts
â       âââ search-faq.ts
â       âââ registry.ts
âââ embeddings/
â   âââ chunker.ts
â   âââ embedder.ts
âââ lib/
    âââ supabase.ts
    âââ redis.ts
    âââ vault.ts                â busca API keys do tenant via Supabase Vault
    âââ queue.ts
```

### Filas

| Fila | Trigger | AÃ§Ã£o |
|------|---------|------|
| `process-message` | Webhook recebe msg | Carrega contexto, chama LLM, salva resposta, enfileira envio |
| `send-message` | LLM responde ou humano envia | Chama Evolution API |
| `process-document` | Upload via API `/knowledge/documents` | Chunking â embedding â pgvector |
| `takeover-timeout` | Cron job (a cada 5min) | Verifica conversas com takeover > 30min sem atividade, alerta operador ou devolve ao agente |

### Fluxo process-message

1. **Lock por conversa:** adquire lock Redis por `conversation_id` (garante processamento sequencial por conversa)
2. Busca conversa + agente + config
3. **Resolve API key:** busca chave do tenant via vault â fallback para env var global
4. Carrega histÃ³rico recente como contexto
5. Monta system prompt
6. Registra tools habilitadas (via registry)
7. Chama AI SDK com tools â tool calling loop automÃ¡tico
8. Salva resposta no Supabase (role: 'agent', metadata: {model, tokens, latency, tool_calls})
9. Enfileira `send-message`
10. Atualiza `conversation.last_message_at`
11. **Libera lock** da conversa

### ResiliÃªncia

- **Lock por conversa:** Redis lock com TTL (previne deadlock). Se mensagem chega durante processamento, job aguarda lock ser liberado (processamento sequencial por conversa)
- Retry: 3 tentativas com backoff exponencial
- Dead letter queue para falhas persistentes
- Concurrency configurÃ¡vel por fila (ex: `process-message` = 10, `send-message` = 20)
- Rate limiting no `send-message` para respeitar limites da Evolution API

## Dashboard Next.js (`apps/web`)

### Estrutura de Rotas

```
app/
âââ (auth)/login, register
âââ (dashboard)/
â   âââ inbox/
â   â   âââ [conversationId]/
â   âââ agents/
â   â   âââ new/
â   â   âââ [agentId]/knowledge/
â   âââ instances/
â   â   âââ [instanceId]/
â   âââ team/
â   âââ settings/
```

### PÃ¡ginas

| PÃ¡gina | Funcionalidade |
|--------|---------------|
| Inbox | Lista conversas com filtros (status). Chat realtime. Painel lateral: contato, notas, tags. Assumir/devolver conversa. Atribuir a atendente. |
| Agentes | CRUD. Config: nome, prompt, modelo, provider, temperatura. Tools. Upload docs + FAQs. |
| InstÃ¢ncias | Lista instÃ¢ncias Evolution. Conectar via QR code (buscado em tempo real da API, nÃ£o do banco). Status, telefone, logs. Vincular agente Ã  instÃ¢ncia. |
| Team | Membros, convidar por email (tabela invitations), roles (owner/admin/agent). |
| Settings | Config org, API keys providers LLM (salvas via vault). |

### Realtime

- `messages` â novas mensagens no chat instantaneamente
- `conversations` â status muda, nova conversa na lista
- Via `supabase.channel().on('postgres_changes', ...)`

### ComunicaÃ§Ã£o

- CRUD direto no Supabase via SDK + RLS
- AÃ§Ãµes que passam pelo backend (envio de msg, instÃ¢ncias Evolution, upload docs) via API routes como BFF

## Infraestrutura

### Docker Compose

```yaml
services:
  api:
    build: ./apps/api
    ports: ["3001:3001"]
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
  worker:
    build: ./apps/worker
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
volumes:
  redis_data:
```

### VariÃ¡veis de Ambiente

- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Redis: `REDIS_URL`
- Evolution API: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`
- LLM Providers (fallback global): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
- App: `API_PORT`, `WEBHOOK_SECRET`, `JWT_SECRET`

### Deploy

- VPS com Docker Compose
- Supabase Cloud (managed)
- Evolution API rodando separadamente
- Nginx/Caddy como reverse proxy (SSL)
- Worker escala com `--scale worker=N` (seguro: lock Redis garante 1 job por conversa)

## Fases de ImplementaÃ§Ã£o

1. **FundaÃ§Ã£o** â Monorepo, Docker Compose, Supabase schema (todas as tabelas + RLS + vault), Redis, packages compartilhados
2. **Backend Core** â API Server, webhook Evolution (com idempotÃªncia), serviÃ§os, filas BullMQ
3. **Worker & Agente** â Worker BullMQ (com lock por conversa), AI SDK, tools, RAG pipeline, embeddings, vault integration
4. **Dashboard Auth & Layout** â Next.js setup, Supabase Auth, multi-tenancy, layout base, org switcher
5. **Dashboard: GestÃ£o de Agentes** â CRUD agentes, config, upload docs (via API), FAQs, vincular agente a instÃ¢ncia
6. **Dashboard: Evolution API** â GestÃ£o instÃ¢ncias, QR code (realtime da API), status, logs
7. **Dashboard: Inbox** â Lista conversas, chat realtime, takeover (com timeout), atribuiÃ§Ã£o, notas, tags, mÃ©tricas
8. **Dashboard: Team & Settings** â Membros, convites (invitations), roles, config org, API keys (vault)
