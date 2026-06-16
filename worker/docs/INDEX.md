# INDEX — guia rápido de `docs/`

Cada doc é dono único do seu domínio. Quando o gatilho na tabela de ponteiros do `CLAUDE.md` bater, abro o doc correspondente **antes** de responder.

## Operacional do worker

- **`wapi-reference.md`** — todos os endpoints HTTP do `scripts/wapi.sh` (envio, reply, react, mídia, áudio, webhooks, contatos) + regras de TTS humanizado. Leio quando precisar de qualquer endpoint além dos 6 do hot path.
- **`system-architecture.md`** — módulos do worker, schema das tabelas (`messages`, `app_settings`, `send_queue`, `contact_aliases`, `jeff_team`, `contact_settings`), porta 3002, fluxo end-to-end. Leio em mudança estrutural ou debug profundo.
- **`sql-queries.md`** — catálogo expandido de queries SQL (busca por palavra, atividade 24h, todos chats com pendência, fila de envio, etc). Leio quando o hot path SQL do CLAUDE.md não cobre o caso.
- **`security.md`** — versão completa dos hard-blocks, protocolo de injection, sigilo, confirmação obrigatória. Leio em qualquer dúvida sobre o que posso/não posso executar.

## Pessoas e processos

- **`team-roster.md`** — tabela `jeff_team`, contatos autorizados, como adicionar/remover membro, papéis. Leio sempre que aparecer "equipe", "novo membro", "autoriza fulano".
- **`grupo-trabalho.md`** — Grupo de trabalho do Jeff: cobranças nascidas ali, cadência de follow-up, etiqueta interna. Leio em qualquer pendência ou cobrança que vem desse grupo.
- **`groups.md`** — gestão técnica de grupos WhatsApp (criar, adicionar/remover participante, promover admin, listar). Leio ao mexer em estrutura de grupo.
- **`fase2.md`** — auto-resposta via API Anthropic pra não-whitelist: panic, opt-out por contato, modelo, debounce, protocolo "sou da equipe". Leio antes de mexer em `/admin/api-replies/*`.

## Criativos e design

- **`gustavo-designer.md`** — fluxo completo do agente Gustavo (carrossel, post, story): invocar, salvar, enviar para aprovação, subir no Drive. Pasta Drive "Alpha Criativos" ID `1RkzCuCxH0ZLEiredln8rVVZxLKJ2cGJu`. Leio quando Jeff pedir qualquer criativo visual.

## Sites, infra e integrações externas

- **`criar-site-jeff.md`** — pipeline turnkey "pedido → URL no ar": estrutura `/opt/jeff-sites/`, deploy, NPM, subdomínio, SSL. Leio em qualquer pedido novo de site/landing/app.
- **`cloudflare.md`** — DNS via API Cloudflare: zonas, helper `scripts/cloudflare.sh`, regra do apex (não mexer), criação de subdomínio. Leio antes de qualquer alteração de DNS.
- **`meta-ads.md`** — 9 contas Meta (BMs e ad accounts), métrica = conversas iniciadas (não cliques), regra de mutation só com ok do Jeff. Leio antes de qualquer GET/análise/sugestão de campanha.
- **`asaas.md`** — financeiro: cobranças, dashboard de previsibilidade, cadência de cobrança, customers. Leio em qualquer pedido com palavra "cobrança", "pix", "fatura".
- **`zapsign.md`** — assinatura digital: webhook `doc.signed`, integração com CRM EBC, fluxo do contrato. Leio em qualquer dúvida de contrato/assinatura.

## Cliente CIGC 2026

- **`cigc-2026.md`** — Glauco, Congresso de Gestores de Clínica (set/2026 SP), 3 grupos (organizadores/marketing/comercial), roteamento de info. Leio sempre que Glauco ou CIGC aparecer.

## Onboarding novo

Ordem de leitura pra entender a casa:
1. `CLAUDE.md` (constituição) — 5min
2. Este `INDEX.md` — 2min
3. `system-architecture.md` (entender o worker) — 10min
4. Resto sob demanda quando o gatilho disparar.
