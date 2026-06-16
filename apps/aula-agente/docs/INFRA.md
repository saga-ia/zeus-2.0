# Infra do aula-agente

## Subdomínios

Criar via `scripts/cloudflare.sh` no servidor (proxied=false), apontando para o IP do servidor. SSL automático via NPM Let's Encrypt.

| Subdomínio                          | Aponta para                  | Serviço (Docker)         |
|-------------------------------------|------------------------------|--------------------------|
| `aula.jefersonhenrike.com`          | NPM → container `web:3000`   | dashboard Next.js        |
| `aula-api.jefersonhenrike.com`      | NPM → container `api:3001`   | API Fastify + webhooks   |

**Importante:** apex `jefersonhenrike.com`, `www` e MX **não devem ser tocados** (estão na hospedagem antiga + email ativo).

A Evolution **NÃO recebe subdomínio próprio** — fica isolada na rede docker do compose, acessível só pelos containers `api` e `worker` via `http://evolution:8080`. O webhook que ela dispara também é interno (`http://api:3001/webhooks/evolution`).

## Webhooks externos

A única URL pública necessária da API é o webhook da Evolution, mas ele é **interno** (rede docker). Para receber webhooks de provedores externos no futuro (caso necessário), expor via `aula-api.jefersonhenrike.com/webhooks/...`.

## Variáveis de ambiente do dashboard (Next.js)

```env
NEXT_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
NEXT_PUBLIC_API_URL=https://aula-api.jefersonhenrike.com
```

## Stack do compose

- `api` (3001 → aula-api)
- `worker` (sem porta exposta)
- `web` (3000 → aula)
- `redis` (sem porta exposta)
- `evolution` (sem porta exposta — apenas rede docker)
- `evolution-postgres` (sem porta exposta — banco da Evolution)

Volumes: `redis_data`, `evolution_instances`, `evolution_pg_data`.

## Coexistência com sagazeus

A Evolution deste compose é **isolada** da Evolution do sagazeus (que continua rodando em `https://sagazeus.jefersonhenrike.com/` sem alteração). Bancos, Redis (logical DB), prefix de cache e API key são separados. Ver `docker-compose.yml` para os mapeamentos.

## Deploy inicial

1. Definir `EVOLUTION_API_KEY` e `EVOLUTION_DB_PASSWORD` no `.env` do servidor
2. Criar subdomínios `aula` e `aula-api` no Cloudflare (proxied=false)
3. Criar entries no NPM apontando pra containers, com Let's Encrypt
4. `docker compose up -d --build`
5. Aplicar migrations 00001-00012 no Supabase
6. Criar primeira organização e configurar API keys de LLM via dashboard
