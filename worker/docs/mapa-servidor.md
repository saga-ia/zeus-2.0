# Mapa do servidor

Gerado automaticamente em 05/11/2026 01:30 BRT por `scripts/server-map.sh` (só leitura, sem valores de segredo). Não editar à mão: rodar o script de novo.

**Resumo:** 0 apps no PM2 (0 online) | 58 pastas de app | 30 sites estáticos | 75 domínios no proxy | 15 containers | 19 crons | 95 alertas

## Alertas

- GRAVE: porta 3025 escuta em todas as interfaces e não há firewall no servidor: `/` abre direto em http://IP:3025 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3015 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-clickup-webhook` abre direto em http://IP:3015 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3031 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-central` abre direto em http://IP:3031 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3026 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-cigc-forms` abre direto em http://IP:3026 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3024 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-disparador` abre direto em http://IP:3024 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3023 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-farias-clientarea` abre direto em http://IP:3023 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3022 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-cigc-comercial` abre direto em http://IP:3022 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3021 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-cigc-clientarea` abre direto em http://IP:3021 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3020 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-alpha-clientes` abre direto em http://IP:3020 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 7180 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/planejamento-8-anos` abre direto em http://IP:7180 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3019 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-instagram-webhook` abre direto em http://IP:3019 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3051 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-sdrs-crm` abre direto em http://IP:3051 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3050 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-farias-crm` abre direto em http://IP:3050 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3017 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-sistemas` abre direto em http://IP:3017 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3081 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-agenda-turbo-max` abre direto em http://IP:3081 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3016 escuta em todas as interfaces e não há firewall no servidor: `/` abre direto em http://IP:3016 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3080 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-automatikinst` abre direto em http://IP:3080 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3014 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-zapsign-webhook` abre direto em http://IP:3014 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3013 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-asaas-dashboard` abre direto em http://IP:3013 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3012 escuta em todas as interfaces e não há firewall no servidor: `/` abre direto em http://IP:3012 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3011 escuta em todas as interfaces e não há firewall no servidor: `/` abre direto em http://IP:3011 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3041 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-sdrs` abre direto em http://IP:3041 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 4000 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/zeus-platform` abre direto em http://IP:4000 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3040 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/zeus-analytics` abre direto em http://IP:3040 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3070 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-zeus-post` abre direto em http://IP:3070 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3066 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-conselho-do-dono` abre direto em http://IP:3066 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3002 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-worker` abre direto em http://IP:3002 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3033 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-mapadocloser` abre direto em http://IP:3033 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3032 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-wa-relay` abre direto em http://IP:3032 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3095 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-board-editor` abre direto em http://IP:3095 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3030 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-eventos` abre direto em http://IP:3030 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3029 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-worker` abre direto em http://IP:3029 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3028 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/jeff-cigc-congresso` abre direto em http://IP:3028 sem HTTPS e sem passar pelo proxy
- GRAVE: porta 3060 escuta em todas as interfaces e não há firewall no servidor: `/opt/jeff-apps/zeuschatig` abre direto em http://IP:3060 sem HTTPS e sem passar pelo proxy
- domínio `congressogestores.cadastroforms.com` aponta pra 172.18.0.1:3003 e **nada responde** nessa porta
- domínio `crm.cadastroforms.com` aponta pra 172.17.0.1:3027 e **nada responde** nessa porta
- domínio `ebc.propostaebcmkt2026.shop` aponta pra site sem pasta (/opt/jeff-sites/ebc)
- pasta `/opt/jeff-apps/agencia-orquestrador` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/ebc-campaign-2026-05-03` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-ads-dashboard` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-agenda-turbo-max` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-agente-smith` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-alpha-clientes` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-asaas-dashboard` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-automatikinst` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-board-editor` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-board-org` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-central` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-cigc-clientarea` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-cigc-comercial` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-cigc-congresso` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-cigc-crm` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-cigc-forms` não roda no PM2 (parada, antiga ou Docker?)
- segredo escrito no código: `META_ACCESS_TOKEN em ecosystem.config.js` (jeff-cigc-forms)
- pasta `/opt/jeff-apps/jeff-claude-shim` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-clickup-webhook` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-conselho-do-dono` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-disparador` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-ebc-crm` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-eventos` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-farias-clientarea` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-farias-crm` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-farias-forms` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-financeiro` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-google-oauth` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-instagram-webhook` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-leads` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-llm-council` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-mapadocloser` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-meta-dashboard` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-onboarding` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-sdrs` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-sdrs-crm` não roda no PM2 (parada, antiga ou Docker?)
- segredo escrito no código: `CRM_PASSWORD em ecosystem.config.js` (jeff-sdrs-crm)
- segredo escrito no código: `SDRS_JWT_SECRET em ecosystem.config.js` (jeff-sdrs-crm)
- segredo escrito no código: `WORKER_TOKEN em ecosystem.config.js` (jeff-sdrs-crm)
- pasta `/opt/jeff-apps/jeff-shared` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-sistemas` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-spec-kit-teste` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-video` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-voz` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-vps-monitor` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-wa-relay` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-wpp-mirror` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-zapsign-webhook` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/jeff-zeus-post` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/planejamento-8-anos` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/video-use` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/zeus-analytics` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/zeus-contacts` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/zeus-instalacao` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/zeus-platform` não roda no PM2 (parada, antiga ou Docker?)
- pasta `/opt/jeff-apps/zeuschatig` não roda no PM2 (parada, antiga ou Docker?)
- arquivo sensível na pasta pública de site: `/opt/jeff-sites/boardsummit2026planilha/refresh.log`
- arquivo sensível na pasta pública de site: `/opt/jeff-sites/cigc-capture/node_modules`

## Apps (PM2)

| App | Status | Reinícios | Porta | Domínio | Pasta | O que é | Banco |
|---|---|---|---|---|---|---|---|

## Pastas de app fora do PM2

- `/opt/jeff-apps/agencia-orquestrador`: sem descrição
- `/opt/jeff-apps/aula-agente` (docker): sem descrição
- `/opt/jeff-apps/ebc-campaign-2026-05-03`: sem descrição
- `/opt/jeff-apps/jeff-ads-dashboard`: ─── Auth ─────────────────────────────────────────────────────────────────────
- `/opt/jeff-apps/jeff-agenda-turbo-max`: Agenda Turbo Max - Agendador com cifragem client-side (agendaturbomax.jefersonhenrike.com)
- `/opt/jeff-apps/jeff-agente-smith`: sem descrição
- `/opt/jeff-apps/jeff-alpha-clientes`: Sistema Interno Alpha Digital — hub-mãe dos clientes
- `/opt/jeff-apps/jeff-asaas-dashboard`: Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar do AUTH_HASH.
- `/opt/jeff-apps/jeff-automatikinst`: Automatik Inst - Agendador de conteudo (instancia automatikinst.jefersonhenrike.com)
- `/opt/jeff-apps/jeff-board-editor`: sem descrição
- `/opt/jeff-apps/jeff-board-org`: Organograma Board Academy
- `/opt/jeff-apps/jeff-central`: Central de acesso ZEUS — painel agregador de apps, chaves, links e WhatsApp
- `/opt/jeff-apps/jeff-cigc-clientarea`: Área do Cliente · CIGC 2026
- `/opt/jeff-apps/jeff-cigc-comercial`: CIGC · Comercial · Distribuição de Clínicas TEA
- `/opt/jeff-apps/jeff-cigc-congresso`: CIGC 2026 — Congresso Internacional de Gestores de Clínicas
- `/opt/jeff-apps/jeff-cigc-crm`: Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar da CRM_PASSWORD.
- `/opt/jeff-apps/jeff-cigc-forms`: Formulario de cadastro CIGC 2026 com rastreamento Meta
- `/opt/jeff-apps/jeff-claude-shim`: jeff-claude-shim: endpoint no formato OpenAI (/v1/chat/completions) que responde
- `/opt/jeff-apps/jeff-clickup-webhook`: guarda raw body pra HMAC
- `/opt/jeff-apps/jeff-conselho-do-dono`: Formulario de confirmacao de presenca — O Conselho do Dono (Farias)
- `/opt/jeff-apps/jeff-creator-lab`: Local Instagram Reel research with Apify, Jev, and Fireworks or Groq.
- `/opt/jeff-apps/jeff-disparador`: Disparador — Jeff
- `/opt/jeff-apps/jeff-ebc-crm`: Lê o API_TOKEN do worker para enviar notificações
- `/opt/jeff-apps/jeff-eventos`: ---------- helpers ----------
- `/opt/jeff-apps/jeff-evolution` (docker): sem descrição
- `/opt/jeff-apps/jeff-farias-clientarea`: ─── Auth ─────────────────────────────────────────────────────────────────────
- `/opt/jeff-apps/jeff-farias-crm`: Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar da CRM_PASSWORD.
- `/opt/jeff-apps/jeff-farias-forms`: Formulário de aplicação Mentoria O Próximo Ciclo - Farias Souza
- `/opt/jeff-apps/jeff-financeiro`: sem descrição
- `/opt/jeff-apps/jeff-google-oauth`: Google OAuth — Zeus
- `/opt/jeff-apps/jeff-instagram-webhook`: raw body para validação de assinatura
- `/opt/jeff-apps/jeff-leads`: Receptor generico de formularios de captura: grava JSONL local e append em Google Sheets
- `/opt/jeff-apps/jeff-llm-council`: sem descrição
- `/opt/jeff-apps/jeff-mapadocloser`: Minimal .env loader (sem dependencia extra)
- `/opt/jeff-apps/jeff-meta-dashboard`: Dashboard Meta Ads multi-cliente com autenticacao, proxy API e Google Sheets
- `/opt/jeff-apps/jeff-moneyprinter` (docker): sem descrição
- `/opt/jeff-apps/jeff-omniroute` (docker): sem descrição
- `/opt/jeff-apps/jeff-onboarding`: Onboarding Alpha Digital — Consultoria Estratégica
- `/opt/jeff-apps/jeff-presenton` (docker): sem descrição
- `/opt/jeff-apps/jeff-sdrs`: Aviso alto se JWT_SECRET nao esta configurado — evita subir com secret default em prod.
- `/opt/jeff-apps/jeff-sdrs-crm`: Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar da CRM_PASSWORD.
- `/opt/jeff-apps/jeff-shared`: sem descrição
- `/opt/jeff-apps/jeff-sistemas`: sem descrição
- `/opt/jeff-apps/jeff-spec-kit-teste`: sem descrição
- `/opt/jeff-apps/jeff-video`: sem descrição
- `/opt/jeff-apps/jeff-voz`: sem descrição
- `/opt/jeff-apps/jeff-vps-monitor`: ─── Auth ─────────────────────────────────────────────────────────────────────
- `/opt/jeff-apps/jeff-wa-relay`: sem descrição
- `/opt/jeff-apps/jeff-wpp-mirror`: SSE: notifica quando chegar mensagem nova
- `/opt/jeff-apps/jeff-zapsign-webhook`: ZapSign — Webhook events · Jeff
- `/opt/jeff-apps/jeff-zeus-post`: Zeus Post - Agendador de conteudo para redes sociais
- `/opt/jeff-apps/planejamento-8-anos`: sem descrição
- `/opt/jeff-apps/video-use`: sem descrição
- `/opt/jeff-apps/zeus-analytics`: Analise IA de conversas WhatsApp multi-tenant. Complementar ao Zeus.
- `/opt/jeff-apps/zeus-contacts`: sem descrição
- `/opt/jeff-apps/zeus-instalacao`: Formulário de instalação do ZEUS (zeus-instalacao.jefersonhenrike.com).
- `/opt/jeff-apps/zeus-platform`: Plataforma Zeus — painel web seguro com cofre, agentes e chat
- `/opt/jeff-apps/zeuschatig`: raw body para HMAC do webhook

## Domínios (Nginx Proxy Manager)

| Domínio | Vai pra | Ativo |
|---|---|---|
| cigc.cadastroforms.com | porta 3026 (jeff-cigc-forms) | sim |
| congressogestores.cadastroforms.com | porta 3003 (NADA ESCUTANDO) | sim |
| crm.cadastroforms.com | porta 3027 (NADA ESCUTANDO) | sim |
| bio.fariassouza.com.br | site:/opt/jeff-sites/farias-souza | sim |
| boardsummit2026planilha.fariassouza.com.br | site:/opt/jeff-sites/boardsummit2026planilha | sim |
| bonusocd.fariassouza.com.br | site:/opt/jeff-sites/bonusocd | sim |
| conf-ocd.fariassouza.com.br | porta 3066 (jeff-conselho-do-dono) | sim |
| forms.fariassouza.com.br | porta 3029 (jeff-worker) | sim |
| fs.fariassouza.com.br | site:/opt/jeff-sites/fs | sim |
| ganhos.fariassouza.com.br | site:/opt/jeff-sites/ganhos | sim |
| obrigado-ocd.fariassouza.com.br | site:/opt/jeff-sites/obrigado-ocd | sim |
| oconselhododono.fariassouza.com.br | site:/opt/jeff-sites/oconselhododono | sim |
| admin.jefersonhenrike.com | porta 3017 (jeff-sistemas) | sim |
| alpha.jefersonhenrike.com | site:/opt/jeff-sites/alpha | sim |
| analytics.jefersonhenrike.com | porta 3040 (zeus-analytics) | sim |
| apresentacoes.jefersonhenrike.com | porta 5001 (pid 2368) | sim |
| asaas.jefersonhenrike.com | porta 3013 (jeff-asaas-dashboard) | sim |
| automatikinst.jefersonhenrike.com | porta 3080 (jeff-automatikinst) | sim |
| carrossel.jefersonhenrike.com | site:/opt/jeff-sites/carrossel | sim |
| central.jefersonhenrike.com | porta 3031 (jeff-central) | sim |
| cigc-ads-30d.jefersonhenrike.com | site:/opt/jeff-sites/cigc-ads-30d | sim |
| cigc-comercial.jefersonhenrike.com | porta 3022 (jeff-cigc-comercial) | sim |
| cigc-dashboard.jefersonhenrike.com | site:/opt/jeff-sites/cigc-dashboard | sim |
| cigc-relatorio.jefersonhenrike.com | site:/opt/jeff-sites/cigc-relatorio | sim |
| cigc.jefersonhenrike.com | porta 3021 (jeff-cigc-clientarea) | sim |
| clickup.jefersonhenrike.com | porta 3015 (jeff-clickup-webhook) | sim |
| cliente.jefersonhenrike.com | porta 3020 (jeff-alpha-clientes) | sim |
| conselho.jefersonhenrike.com | porta 3066 (jeff-conselho-do-dono) | sim |
| conselhododono3edicao.jefersonhenrike.com | site:/opt/jeff-sites/conselhododono3edicao | sim |
| deniseapresentacao.jefersonhenrike.com | site:/opt/jeff-sites/deniseapresentacao | sim |
| disparador.jefersonhenrike.com | porta 3024 (jeff-disparador) | sim |
| editaturbomax.jefersonhenrike.com | site:/opt/jeff-sites/editaturbomax | sim |
| eventos.jefersonhenrike.com | porta 3030 (jeff-eventos) | sim |
| eventoslucrativos.jefersonhenrike.com | site:/opt/jeff-sites/eventoslucrativos | sim |
| evolution.jefersonhenrike.com | docker jeff-evolution-api:8080 | sim |
| farias-crm.jefersonhenrike.com | porta 3050 (jeff-farias-crm) | sim |
| farias-souza.jefersonhenrike.com | site:/opt/jeff-sites/farias-souza | sim |
| farias.jefersonhenrike.com | porta 3016 (pid 652) | sim |
| fariassouza.jefersonhenrike.com | porta 3023 (jeff-farias-clientarea) | sim |
| google.jefersonhenrike.com | porta 3018 (jeff-google-oauth) | sim |
| imobiliaria.jefersonhenrike.com | site:/opt/jeff-sites/imobiliaria | sim |
| instagram.jefersonhenrike.com | porta 3019 (jeff-instagram-webhook) | sim |
| instalacao-zeus.jefersonhenrike.com | porta 3071 (pid 652) | sim |
| mapadocloser.jefersonhenrike.com | site:/opt/jeff-sites/mapadocloser | sim |
| meta.jefersonhenrike.com | porta 3011 (pid 652) | sim |
| metadash.jefersonhenrike.com | porta 3025 (pid 652) | sim |
| myig.jefersonhenrike.com | porta 3060 (zeuschatig) | sim |
| omniroute.jefersonhenrike.com | docker jeff-omniroute:20128 | sim |
| onboarding.jefersonhenrike.com | porta 3016 (pid 652) | sim |
| org-board.jefersonhenrike.com | porta 3030 (jeff-eventos) | sim |
| planejamento.jefersonhenrike.com | porta 7180 (planejamento-8-anos) | sim |
| sagazeus.jefersonhenrike.com | porta 3002 (jeff-worker) | sim |
| sdrs-crm.jefersonhenrike.com | porta 3051 (jeff-sdrs-crm) | sim |
| sdrs.jefersonhenrike.com | porta 3041 (jeff-sdrs) | sim |
| sistemas.jefersonhenrike.com | porta 3017 (jeff-sistemas) | sim |
| sitefariasteste1.jefersonhenrike.com | site:/opt/jeff-sites/sitefariasteste1 | sim |
| teste.jefersonhenrike.com | site:/opt/jeff-sites/teste | sim |
| treinamento-claude.jefersonhenrike.com | porta 80 (pid 2530) | sim |
| wa-relay.jefersonhenrike.com | porta 3032 (jeff-wa-relay) | sim |
| zapsign.jefersonhenrike.com | porta 3014 (jeff-zapsign-webhook) | sim |
| zeus-instalacao.jefersonhenrike.com | porta 3071 (pid 652) | sim |
| zeus-post.jefersonhenrike.com | porta 3070 (jeff-zeus-post) | sim |
| zeus.jefersonhenrike.com | porta 4000 (zeus-platform) | sim |
| zeuschatig.jefersonhenrike.com | porta 3060 (zeuschatig) | sim |
| ads.propostaebcmkt2026.shop | porta 3011 (pid 652) | sim |
| agente.propostaebcmkt2026.shop | porta 3002 (jeff-worker) | sim |
| ebc-crm.propostaebcmkt2026.shop | porta 3015 (jeff-clickup-webhook) | sim |
| ebc-ebook1.propostaebcmkt2026.shop | site:/opt/jeff-sites/ebc-ebook1 | sim |
| ebc-ebook2.propostaebcmkt2026.shop | site:/opt/jeff-sites/ebc-ebook2 | sim |
| ebc.propostaebcmkt2026.shop | site:/opt/jeff-sites/ebc | sim |
| evolution.propostaebcmkt2026.shop | docker evolution:8080 | sim |
| manager.propostaebcmkt2026.shop | docker n8n:5678 | sim |
| teste.propostaebcmkt2026.shop | site:/opt/jeff-sites/teste | sim |
| vps.propostaebcmkt2026.shop | porta 3012 (pid 652) | sim |
| zeus.propostaebcmkt2026.shop | porta 3010 (zeus-contacts) | sim |

## Sites estáticos (/opt/jeff-sites)

| Pasta | Título | Domínios | Atualizado |
|---|---|---|---|
| `alpha` | Alpha Digital — Consultoria Estratégica | alpha.jefersonhenrike.com | 04/05/2026 |
| `boardsummit2026planilha` | Board Summit 2026 — Dashboard 90 dias | boardsummit2026planilha.fariassouza.com.br | 29/07/2026 |
| `bonusocd` | Bônus Exclusivos — Farias Souza | bonusocd.fariassouza.com.br | 29/07/2026 |
| `carrossel` | Carrossel | carrossel.jefersonhenrike.com | 18/05/2026 |
| `cigc` |  | sem domínio | 12/05/2026 |
| `cigc-ads-30d` | CIGC — Performance de Campanhas (últimos 30 dias) | cigc-ads-30d.jefersonhenrike.com | 09/09/2026 |
| `cigc-capture` | CIGC 2026 - Congresso Internacional de Gestores de Clínicas | sem domínio | 12/05/2026 |
| `cigc-dashboard` | CIGC 2026 — Dashboard Captação | cigc-dashboard.jefersonhenrike.com | 07/08/2026 |
| `cigc-relatorio` | CIGC 2026 · Relatório Meta Ads · Maio a Agosto | cigc-relatorio.jefersonhenrike.com | 13/09/2026 |
| `conf-ocd` | O Conselho do Dono / Farias Souza / Board Academy | sem domínio | 29/07/2026 |
| `conselhododono3edicao` | Board Academy · Relatório de Campanha | conselhododono3edicao.jefersonhenrike.com | 14/10/2026 |
| `deniseapresentacao` | Deise Schmitz Giehl / Criadora de Conteúdo Digital | deniseapresentacao.jefersonhenrike.com | 30/05/2026 |
| `ebc-ebook1` | EBC / Perspectiva de Mercado 2026 — Lendo o novo ciclo global | ebc-ebook1.propostaebcmkt2026.shop | 03/05/2026 |
| `ebc-ebook2` | EBC / Balanço Q1 2026 + Roteiro para o resto do ano | ebc-ebook2.propostaebcmkt2026.shop | 03/05/2026 |
| `editaturbomax` | Edita Turbo Max — edite até 1.000 vídeos de uma vez | editaturbomax.jefersonhenrike.com | 13/08/2026 |
| `eventoslucrativos` | Evento que se paga / Jefferson Henrike | eventoslucrativos.jefersonhenrike.com | 06/10/2026 |
| `farias` | Board Academy · Relatório de Campanha | sem domínio | 14/10/2026 |
| `farias-souza` | Farias Souza | bio.fariassouza.com.br, farias-souza.jefersonhenrike.com | 29/07/2026 |
| `fs` | Farias Souza / Mentor de Empresários | fs.fariassouza.com.br | 29/07/2026 |
| `ganhos` | Pesquisa · Board Academy | ganhos.fariassouza.com.br | 29/07/2026 |
| `imobiliaria` | Larissa — Imóveis de Alto Padrão | imobiliaria.jefersonhenrike.com | 11/09/2026 |
| `instalacao-zeus` | Instalação do ZEUS | sem domínio | 21/10/2026 |
| `mapadocloser` | Dossiê de Fechamento · O Plano do Dono | mapadocloser.jefersonhenrike.com | 01/09/2026 |
| `obrigado-ocd` | Obrigado — Farias Souza | obrigado-ocd.fariassouza.com.br | 24/09/2026 |
| `oconselhododono` | O Conselho do Dono / Farias Souza / Board Academy | oconselhododono.fariassouza.com.br | 27/10/2026 |
| `proximo-ciclo` |  | sem domínio | 12/06/2026 |
| `sitefariasteste1` | Farias Souza / Mentor de Empresários | sitefariasteste1.jefersonhenrike.com | 29/07/2026 |
| `teste` | Zeus — Diretor de operações do Jeferson | teste.jefersonhenrike.com, teste.propostaebcmkt2026.shop | 04/05/2026 |
| `treinamento-claude` | Claude Code: Funcionário de Agência Premium | sem domínio | 22/05/2026 |
| `zeus-instalacao` | Instalação do ZEUS | sem domínio | 21/10/2026 |

## Docker

- `jv-zzoom-mvin7k7d` (jeff-remotion:1): Exited (0) 2 weeks ago | -
- `jv-farias-teaser-v2-mv1p1moh` (jeff-remotion:1): Exited (0) 3 weeks ago | -
- `jv-teaser-farias-v2-mv12segw` (jeff-remotion:1): Exited (0) 3 weeks ago | -
- `jeff-evolution-api` (evoapicloud/evolution-api:v2.3.7): Up 8 days | 8080/tcp
- `jeff-presenton` (ghcr.io/presenton/presenton:latest): Up 8 days | 127.0.0.1:5001->80/tcp, 172.17.0.1:5001->80/tcp
- `jeff-evolution-postgres` (postgres:15-alpine): Up 8 days | 5432/tcp
- `jeff-evolution-redis` (redis:7-alpine): Up 8 days | 6379/tcp
- `jeff-omniroute` (diegosouzapw/omniroute:latest): Up 8 days (healthy) | 127.0.0.1:20128->20128/tcp
- `moneyprinterturbo-api` (jeff-moneyprinter-api): Up 8 days | 127.0.0.1:8080->8080/tcp, 8501/tcp
- `moneyprinterturbo-webui` (jeff-moneyprinter-webui): Up 8 days | 127.0.0.1:8501->8501/tcp
- `jeff-sites-nginx` (nginx:alpine): Up 8 days | 80/tcp
- `labastia-setup-n8n-1` (n8nio/n8n:latest): Up 8 days | 5678/tcp
- `labastia-setup-nginx-proxy-manager-1` (jc21/nginx-proxy-manager:latest): Up 8 days | 0.0.0.0:80-81->80-81/tcp, [::]:80-81->80-81/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp
- `labastia-setup-postgres-1` (09e4f20b14dd): Up 8 days | 5432/tcp
- `labastia-setup-redis-1` (7aec734b2bb2): Up 8 days | 6379/tcp

## Crons (horário do servidor: Europe/Berlin)

- `*/5 * * * * /opt/jeff-worker/scripts/ig-comment-poller.sh >> /opt/jeff-worker/logs/ig-comment-poller.log 2>&1`
- `0 12 * * * /opt/jeff-worker/scripts/daily-chase.sh`
- `0 9 * * * /opt/jeff-worker/scripts/asaas-dunning.sh >> /opt/jeff-worker/logs/asaas-dunning.log 2>&1`
- `0 3 * * * /opt/zeus-backup/backup.sh >> /var/log/zeus-backup.log 2>&1`
- `0 10 * * * /opt/jeff-worker/scripts/morning-brief.sh >> /opt/jeff-worker/logs/morning-brief.log 2>&1`
- `0 8 * * 0 /opt/jeff-worker/scripts/backup-zeus-to-drive.sh`
- `*/5 * * * * /opt/jeff-worker/scripts/clickup-sync.py >> /opt/jeff-worker/logs/clickup-sync.log 2>&1`
- `0 11,14,17,21 * * * /opt/jeff-worker/scripts/clickup-cobranca.py >> /opt/jeff-worker/logs/clickup-cobranca.log 2>&1`
- `*/2 * * * * /opt/jeff-worker/scripts/clickup-asaas-bridge.py >> /opt/jeff-worker/logs/clickup-asaas-bridge.log 2>&1`
- `*/30 * * * * /opt/jeff-worker/scripts/claude-token-refresh.sh >> /opt/jeff-worker/logs/claude-token-refresh.log 2>&1`
- `*/5 * * * * /opt/jeff-worker/scripts/agent-runner-health.sh >> /opt/jeff-worker/logs/agent-runner-health.log 2>&1`
- `*/3 * * * * /opt/jeff-worker/scripts/wa-worker-health.sh >> /opt/jeff-worker/logs/wa-worker-health.log 2>&1`
- `0 3 15 * * /opt/jeff-worker/scripts/ig-token-refresh.sh >> /opt/jeff-worker/logs/ig-token-refresh.cron.log 2>&1`
- `*/3 * * * * /usr/bin/python3 /opt/jeff-sites/boardsummit2026planilha/refresh.py >> /opt/jeff-sites/boardsummit2026planilha/refresh.log 2>&1`
- `*/10 * * * * /usr/bin/python3 /opt/jeff-sites/cigc-dashboard/update-from-vitor.py >> /var/log/cigc-dashboard-update.log 2>&1`
- `45 23 * * * /usr/bin/python3 /opt/jeff-sites/cigc-dashboard/update-from-gustavo.py >> /var/log/cigc-dashboard-update.log 2>&1`
- `*/5 * * * * /opt/jeff-worker/scripts/wa-guardiao.sh >> /opt/jeff-worker/logs/wa-guardiao.log 2>&1`
- `0 13,14 * * 1 /opt/jeff-worker/scripts/nina-weekly.sh >> /opt/jeff-worker/logs/nina-weekly.log 2>&1`
- `30 5 * * * /opt/jeff-worker/scripts/server-map.sh >> /opt/jeff-worker/logs/server-map.log 2>&1`

## Integrações (nomes de chave no app_settings, sem valores)

- **admin**: admin_password_hash
- **ads**: jeff_ads_account_currency, jeff_ads_account_id, jeff_ads_account_name
- **api**: api_replies_panic, api_reply_debounce_ms, api_reply_history_limit, api_reply_max_tokens, api_reply_model
- **apify**: apify_api_key, apify_api_token
- **asaas**: asaas_api_key, asaas_webhook_auth_token
- **cigc**: cigc_drive_folder_id, cigc_group_marketing, cigc_group_marketing_name, cigc_group_organizacao, cigc_group_organizacao_name, cigc_instagram_handle, cigc_instagram_url, cigc_monitor_last_id_mkt, cigc_monitor_last_id_org
- **clickup**: clickup_api_token, clickup_assignee_default_id, clickup_folder_dev_id, clickup_folder_infra_id, clickup_space_alpha_id, clickup_space_jeff_id, clickup_space_op_id, clickup_user_jeff_id, clickup_user_jeff_phone, clickup_user_vinicius_id, clickup_user_vinicius_phone, clickup_webhook_id, clickup_webhook_secret, clickup_workspace_id
- **cloudflare**: cloudflare_api_token, jeff_cloudflare_account_email, jeff_cloudflare_account_id, jeff_cloudflare_api_token, jeff_cloudflare_token_expires, jeff_cloudflare_zone_propostaebcmkt2026
- **elevenlabs**: elevenlabs_api_key, elevenlabs_voice_id, elevenlabs_voice_zeus
- **farias**: farias_monitor_last_id
- **gemini**: gemini_api_key
- **google**: google_oauth_client_id, google_oauth_client_secret, google_test_users_authorized, jeff_google_drive_default_folder
- **groq**: groq_api_key
- **inscricao**: inscricao_grupo_wpp_url
- **inscricoes**: inscricoes_sheet_id
- **instagram**: jeff_instagram_login_token, jeff_instagram_login_token_expires_at
- **internal**: internal_team_group_jid
- **leonora**: leonora_report_last_id
- **linkedin**: linkedin_access_token, linkedin_api_version, linkedin_client_id, linkedin_client_secret, linkedin_member_name, linkedin_member_sub, linkedin_password, linkedin_token_expires_at
- **mchat**: mchat_sheet_id
- **meta**: jeff_meta_app_id_ig, jeff_meta_app_id_zeus, jeff_meta_app_secret_ig, jeff_meta_app_secret_zeus, jeff_meta_bot_id, jeff_meta_bot_name, jeff_meta_ig_account_id, jeff_meta_ig_user_token, jeff_meta_ig_webhook_verify_token, jeff_meta_system_token, jeff_meta_system_token_scope, jeff_meta_system_token_user, jeff_meta_system_token_user_id, jeff_meta_system_token_vencido_20261015, jeff_meta_user_id, jeff_meta_user_name, jeff_meta_user_token, jeff_meta_user_token_expires_at, meta_app_id, meta_app_secret, meta_user_token, meta_user_token_expires_at
- **mirror**: mirror_token
- **ml**: ml_card_pref, ml_default_address
- **npm**: jeff_npm_email, jeff_npm_password, jeff_npm_token, jeff_npm_url
- **openai**: openai_api_key
- **pqv**: pqv_campaign_active, pqv_campaign_label
- **sdr**: sdr_leads_sheet_id
- **server**: jeff_server_ipv4, jeff_server_ipv6
- **storydoing**: storydoing_google_review_url
- **supabase**: supabase_project_url, supabase_publishable_key, supabase_secret_key
- **tiktok**: tiktok_password
- **typesafe**: typesafe_api_key
- **voice**: voice_mention_allowed_groups
- **worker**: worker_lid_user
- **youtube**: youtube_account, youtube_post_target
- **zapsign**: zapsign_api_token
- **zeus**: jeff_zeus_api_token, jeff_zeus_vps_ip

## Portas abertas

| Porta | Escuta em | App/pasta |
|---|---|---|
| 22 | 0.0.0.0 | / |
| 80 | 0.0.0.0 | / |
| 81 | 0.0.0.0 | / |
| 443 | 0.0.0.0 | / |
| 3002 | 0.0.0.0 | /opt/jeff-worker |
| 3010 | 127.0.0.1 | /opt/jeff-apps/zeus-contacts |
| 3011 | 0.0.0.0 | / |
| 3012 | 0.0.0.0 | / |
| 3013 | 0.0.0.0 | /opt/jeff-apps/jeff-asaas-dashboard |
| 3014 | 0.0.0.0 | /opt/jeff-apps/jeff-zapsign-webhook |
| 3015 | * | /opt/jeff-apps/jeff-clickup-webhook |
| 3016 | 0.0.0.0 | / |
| 3017 | 0.0.0.0 | /opt/jeff-apps/jeff-sistemas |
| 3018 | 127.0.0.1 | /opt/jeff-apps/jeff-google-oauth |
| 3019 | 0.0.0.0 | /opt/jeff-apps/jeff-instagram-webhook |
| 3020 | 0.0.0.0 | /opt/jeff-apps/jeff-alpha-clientes |
| 3021 | 0.0.0.0 | /opt/jeff-apps/jeff-cigc-clientarea |
| 3022 | 0.0.0.0 | /opt/jeff-apps/jeff-cigc-comercial |
| 3023 | 0.0.0.0 | /opt/jeff-apps/jeff-farias-clientarea |
| 3024 | 0.0.0.0 | /opt/jeff-apps/jeff-disparador |
| 3025 | * | / |
| 3026 | 0.0.0.0 | /opt/jeff-apps/jeff-cigc-forms |
| 3028 | 0.0.0.0 | /opt/jeff-apps/jeff-cigc-congresso |
| 3029 | 0.0.0.0 | /opt/jeff-worker |
| 3030 | 0.0.0.0 | /opt/jeff-apps/jeff-eventos |
| 3031 | * | /opt/jeff-apps/jeff-central |
| 3032 | 0.0.0.0 | /opt/jeff-apps/jeff-wa-relay |
| 3033 | 0.0.0.0 | /opt/jeff-apps/jeff-mapadocloser |
| 3040 | 0.0.0.0 | /opt/jeff-apps/zeus-analytics |
| 3041 | 0.0.0.0 | /opt/jeff-apps/jeff-sdrs |
| 3050 | 0.0.0.0 | /opt/jeff-apps/jeff-farias-crm |
| 3051 | 0.0.0.0 | /opt/jeff-apps/jeff-sdrs-crm |
| 3060 | 0.0.0.0 | /opt/jeff-apps/zeuschatig |
| 3066 | 0.0.0.0 | /opt/jeff-apps/jeff-conselho-do-dono |
| 3070 | 0.0.0.0 | /opt/jeff-apps/jeff-zeus-post |
| 3071 | 172.17.0.1 | / |
| 3072 | 127.0.0.1 | /opt/jeff-apps/jeff-voz |
| 3080 | 0.0.0.0 | /opt/jeff-apps/jeff-automatikinst |
| 3081 | 0.0.0.0 | /opt/jeff-apps/jeff-agenda-turbo-max |
| 3095 | 0.0.0.0 | /opt/jeff-apps/jeff-board-editor |
| 4000 | 0.0.0.0 | /opt/jeff-apps/zeus-platform |
| 5001 | 172.17.0.1 | / |
| 5190 | 127.0.0.1 | /opt/jeff-apps/jeff-creator-lab |
| 7180 | 0.0.0.0 | /opt/jeff-apps/planejamento-8-anos |
| 8080 | 127.0.0.1 | / |
| 8501 | 127.0.0.1 | / |
| 8787 | 172.17.0.1 | /opt/jeff-apps/jeff-claude-shim |
| 20128 | 127.0.0.1 | / |
| 34293 | 127.0.0.1 | /opt/jeff-apps/jeff-wa-relay |
| 35515 | 127.0.0.1 | /opt/jeff-worker |
| 44515 | 127.0.0.1 | /root |
| 46227 | 127.0.0.1 | /opt/jeff-apps/jeff-wa-relay |
