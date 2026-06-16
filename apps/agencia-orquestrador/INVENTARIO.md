# Inventario da operacao — 2026-05-12

Marco zero da Fase 0 do plano "agencia orquestrada por agentes".
Reflete realidade observada no servidor; partes anotadas com `?` precisam confirmacao do Jeff.

## 1. PM2 (17 online, 1 stopped)

| Id | Servico | Funcao | Status |
|----|---------|--------|--------|
| 1  | whatsapp-worker          | cliente WPP (whatsapp-web.js)                   | online 35h |
| 2  | agent-runner             | daemon que dispara o agente em msgs novas       | online 35h |
| 3  | zeus-contacts            | API/painel de contatos                          | online 6D  |
| 4  | jeff-ads-dashboard       | painel Meta/Google Ads                          | online 19m |
| 5  | jeff-vps-monitor         | monitor de recursos da VPS                      | online 5D  |
| 7  | jeff-asaas-dashboard     | painel financeiro Asaas                         | online 5D  |
| 8  | jeff-zapsign-webhook     | recebe webhook ZapSign                          | **STOPPED, 531 restarts** |
| 9  | jeff-onboarding          | fluxo de onboarding de cliente                  | online 6D  |
| 10 | jeff-sistemas            | catalogo/painel de sistemas internos            | online 5D  |
| 12 | jeff-google-oauth        | OAuth Google (Drive/Gmail/Calendar/Sheets)      | online 6D  |
| 13 | jeff-instagram-webhook   | webhook IG (DM/coments)                         | online 5D  |
| 14 | jeff-alpha-clientes      | painel cliente Alpha                            | online 47h |
| 15 | jeff-cigc-clientarea     | area do cliente CIGC                            | online 5D  |
| 16 | jeff-cigc-comercial      | comercial CIGC                                  | online 5D  |
| 19 | jeff-farias-clientarea   | area do cliente Farias                          | online 2D  |
| 20 | jeff-disparador          | disparador de mensagens                         | online 3D  |
| 21 | jeff-meta-dashboard      | painel Meta Ads                                 | online 2h  |

**Bug aberto:** jeff-zapsign-webhook esta parado desde 2026-05-06; ultimo log so diz "listening on :3014". Provavel: porta dupla (start em :3014 e depois 127.0.0.1:3014). Investigar na Fase 4.

## 2. Crontab root (5 jobs)

| Cron          | Script                              | Funcao |
|---------------|-------------------------------------|--------|
| `*/5 * * * *` | scripts/ig-comment-poller.sh        | varre comentarios IG novos |
| `0 12 * * *`  | scripts/daily-chase.sh              | follow-ups diarios as 12h UTC (09h BRT) |
| `0 9 * * *`   | scripts/asaas-dunning.sh            | cobranca de inadimplentes 09h UTC (06h BRT) |
| `0 3 * * *`   | /opt/zeus-backup/backup.sh          | backup cifrado pro Drive |
| `0 10 * * *`  | scripts/morning-brief.sh            | resumo matinal 10h UTC (07h BRT) |

## 3. /opt — estrutura

```
/opt/
  jeff-apps/         # 19 apps Node em producao
  jeff-cigc/         # docs cliente CIGC (comercial, marketing, pesquisa)
  jeff-data/         # dados (alpha, cigc)
  jeff-ideias/       # briefings e ideias soltas
  jeff-projects/     # ⚠ duplicado com jeff-projetos
  jeff-projetos/     # ⚠ duplicado com jeff-projects
  jeff-sites/        # 6 sites estaticos (_nginx, alpha, ebc, ebc-ebook1/2, teste)
  jeff-worker/       # codigo do worker WPP (link em /opt/jeff-worker)
  zeus-backup/       # backup script
```

**Limpeza pendente:** `jeff-projects` e `jeff-projetos` coexistem com conteudo parcialmente diferente em `cigc-2026/`. Decidir qual e canonico e remover o outro.

## 4. Banco SQLite — `/opt/jeff-worker/data/worker.db` (113 MB, 28 tabelas)

Top tabelas com dados:

| Tabela                | Linhas | Uso |
|-----------------------|--------|-----|
| api_logs              | 34906  | log de chamadas externas |
| messages              | 12445  | mensagens WPP entrada/saida |
| send_queue            | 2583   | fila de envio WPP |
| api_reply_log         | 426    | replies do agente |
| chats                 | 197    | chats abertos |
| contact_aliases       | 145    | mapeamento contato -> alias |
| pqv_referrals         | 95     | indicacoes |
| app_settings          | 74     | KV de config (tokens, etc) |
| mchat_processed_comments | 18  | mchat dedupe |
| contact_settings      | 13     | config por contato |
| schema_migrations     | 11     | migrations aplicadas |
| mchat_settings        | 5      | settings mchat |
| jeff_team             | 4      | time |
| jeff_followups        | 3      | follow-ups agendados |
| inscricoes            | 3      | leads/inscricoes |
| google_oauth_tokens   | 1      | tokens OAuth Google |
| ig_keyword_responses  | 1      | respostas IG por keyword |

**Vazias mas existem (estrutura pronta):** asaas_dunning_sent, asaas_events, contacts, ig_processed_comments, ig_webhook_events, sessoes_individuais_log, sessoes_individuais_outlier, webhook_deliveries, webhooks, zapsign_events.

**Decisao Fase 2:** manter SQLite ou migrar pra Postgres? SQLite e mais simples mas concorrencia limita escalabilidade. Recomendacao: ficar no SQLite por enquanto e criar tabelas novas da agencia ao lado (clientes, tarefas, entregaveis, aprovacoes_pendentes). Migrar so se a Fase 6 (painel) exigir.

## 5. Scripts do worker — `/opt/jeff-worker/scripts/` (18)

```
agent-runner.sh       — daemon principal
apify.sh              — Apify scraping
asaas.sh              — helper API Asaas (customers/payments/dashboard/create/raw)
asaas-dunning.sh      — cron de cobranca diaria
backup.sh             — backup local
bootstrap.sh          — setup inicial
chase-glauco-cadastro.sh — chase especifico cliente
cloudflare.sh         — gerencia DNS Cloudflare
daily-chase.sh        — cron follow-ups
google.sh             — helper Google APIs
ig-comment-poller.sh  — cron poller IG
instagram.sh          — helper IG Graph API
meta-ads.sh           — helper Meta Ads
morning-brief.sh      — cron resumo matinal
npm.sh                — helper NPM (Nginx Proxy Manager)
wapi.sh               — helper W-API
zapsign.sh            — helper ZapSign
```

## 6. Integracoes vivas (resumo das memorias)

- **Asaas:** token em app_settings, helper scripts/asaas.sh, dashboard em jeff-asaas-dashboard
- **ZapSign:** token em app_settings, webhook em zapsign.jefersonhenrike.com (PARADO), eventos em tabela zapsign_events
- **Google (Contacts/Drive/Gmail/Calendar/Sheets):** OAuth proprio, painel google.jefersonhenrike.com
- **Instagram Graph:** token em jeff_meta_ig_user_token, webhook em instagram.jefersonhenrike.com, poller 5min
- **ElevenLabs TTS:** voz "Jefferson ZEUS", api_key em app_settings, src/audio/tts.js
- **W-API (WhatsApp Business):** scripts/wapi.sh
- **Apify:** scripts/apify.sh
- **Meta Ads:** scripts/meta-ads.sh, painel jeff-meta-dashboard

## 7. Bugs e duvidas abertas

1. **jeff-zapsign-webhook stopped** — decisao Jeff (2026-05-12): so religar quando houver contrato real pra assinar. Sem urgencia.
2. **Limpeza CIGC (jeff-projects + jeff-projetos + jeff-cigc):** os tres NAO sao copia, tem conteudo distinto. Decisao: consolidar tudo em `/opt/jeff-cigc/` em tarefa manual separada (NAO na Fase 1). Apos consolidar, apagar `/opt/jeff-projects` e `/opt/jeff-projetos`.
3. **Tabela `contacts` vazia mas `contact_aliases` tem 145** — esquema inconsistente? Investigar quando mexer em contatos.
4. **send_queue com 2583 linhas** — ja processado ou backlog? Checar antes da Fase 4.
5. **api_logs com 34906 linhas** — politica de rotacao? Pode estar enchendo disco.
6. **Bug `npm run migrate`** — circular require em `src/db/migrations.js` x `src/db/index.js`. Workaround: `node -e "require('./src/db')"`. Tarefa pro Smith (ver `decisoes/2026-05-12_fase2-banco-aplicado.md`).

## 7.1 Tabelas agencia_* (criadas 2026-05-12, Fase 2)

| Tabela | Funcao |
|--------|--------|
| `agencia_clientes` | cadastro vivo de cliente |
| `agencia_interacoes` | toda msg in/out por cliente |
| `agencia_tarefas` | tarefas em aberto |
| `agencia_entregaveis` | entregas (link Drive, prazo, status) |
| `agencia_eventos_externos` | webhooks Asaas/ZapSign/IG caem aqui |
| `agencia_aprovacoes_pendentes` | fila vermelha (Fase 5) |
| `agencia_acoes_log` | auditoria de tudo que agente faz (Fase 6) |

Todas vazias. Schema em `src/db/migrations/012_agencia.sql`.

## 8. Decisoes confirmadas pelo Jeff (2026-05-12)

- Pasta do projeto: `/opt/jeff-apps/agencia-orquestrador/` (OK)
- Banco da agencia: SQLite, mesmo `worker.db`, tabelas novas ao lado das existentes
- ZapSign-webhook: religar so quando precisar (contrato real)
- Limpeza CIGC: tarefa manual fora da Fase 1
- **Fase 3 redesenhada:** subagents serao construidos **on-demand**, um por um, junto com o Jeff, conforme dor real emergir. Sem pre-listagem especulativa.

## 9. Proximo passo

Fase 1 (CLAUDE.md por projeto) em ondas:
- **Onda 1A (agora):** worker (`/opt/jeff-worker/CLAUDE.md`) + agencia-orquestrador + template global
- **Onda 1B:** apps de cliente (alpha, cigc, farias, ebc-campaign)
- **Onda 1C:** apps internos/painel (asaas-dashboard, ads-dashboard, meta-dashboard, vps-monitor, sistemas, onboarding, google-oauth)
- **Onda 1D:** apps de canal (instagram-webhook, zapsign-webhook, disparador, zeus-contacts)
- **Onda 1E:** sites (`/opt/jeff-sites/`) e zeus-backup
