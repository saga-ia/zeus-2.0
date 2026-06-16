# Architecture — Zeus 2.0

Visão de fluxos e integrações em produção (16/06/2026).

## Visão de alto nível

```
                         jefersonhenrike.com (DNS Cloudflare)
                                       │
                  ┌────────────────────┼─────────────────────┐
                  │                    │                     │
            (subdomínios)        (apex + www)         (subdomínios SSL via NPM)
                  │                    │                     │
                  ▼                    ▼                     ▼
       worker/apps/sites          hospedagem antiga    docker NPM
       (PM2 direto)               + email (não mexer)   labastia-setup
```

## Núcleo Zeus

```
WhatsApp Web ──► whatsapp-worker (PM2)
                       │
                       ├─ recebe msg ─► fila ─► agent-runner ──► Claude Opus 4.7
                       │                                              │
                       │                                              ▼
                       │                                       ferramenta (tools)
                       │                                  ┌────┬────┬────┬────┐
                       │                                  ▼    ▼    ▼    ▼    ▼
                       │                              Asaas Google Meta ClickUp Instagram
                       │
                       ├─ rotas API ──► apps (jeff-cigc-*, jeff-alpha-*, dashboards)
                       │
                       └─ banco SQLite local (data/) + app_settings (tokens)
```

## Integrações externas (via app_settings + scripts/)

| Sistema | Token em | Helper |
|---|---|---|
| Asaas | `app_settings.asaas_api_key` | `scripts/asaas.sh` |
| ZapSign | `app_settings.zapsign_api_token` + webhook | `scripts/...` |
| Google (Contacts/Drive/Gmail/Calendar/Sheets) | OAuth em `app_settings` | `scripts/google.sh` |
| ElevenLabs TTS (voz Jefferson) | `app_settings.elevenlabs_api_key` | `src/audio/tts.js` |
| Meta Ads | tokens user/system em `app_settings` | `scripts/meta-ads.sh` |
| ClickUp | workspace ZEUS | `scripts/clickup.sh` + cron sync/cobrança |
| Instagram Graph | `app_settings.jeff_meta_ig_user_token` | `scripts/instagram.sh` + poller cron |

## Fluxos automatizados (cron)

- **Cobrança Asaas**: `asaas-dunning.sh` (9h) + `clickup-asaas-bridge.py` (2min) + `clickup-cobranca.py` (4x/dia)
- **Briefing matinal**: `morning-brief.sh` (10h) envia resumo no WhatsApp
- **Chase de leads**: `daily-chase.sh` (12h) + `chase-glauco-cadastro.sh`
- **Board Academy**: pausa/ativa campanhas Meta automático (1h/8h BRT)
- **Instagram**: `ig-comment-poller.sh` cada 5min → auto-DM
- **Saúde CRM**: `cigc-crm-health.sh` cada 5min
- **Backups**: diário 3h (Drive cifrado GPG) + semanal domingo 8h

## Hospedagem e infra

- **VPS**: jefersonhenrike.com (Linux Debian-like, Node.js, PM2, Docker)
- **DNS**: Cloudflare (proxied=false em subdomínios novos)
- **SSL**: Nginx Proxy Manager via Let's Encrypt automático
- **Email + apex/www**: hospedagem antiga (não mexer sem ok do Jeff)
- **Backup off-site**: GPG → Google Drive pasta `Zeus`, retenção 30 dias

## Stack Docker paralelo (`labastia-setup/`)

- **NPM**: roteia subdomínios → containers ou PM2 com SSL
- **n8n**: automações visuais (paralelo ao agente Zeus)
- **Evolution API**: WhatsApp alternativo (segunda linha)
- **Postgres + Redis**: usados pelo n8n e Evolution

## Tabelas críticas (banco worker)

- `app_settings` — todos os tokens e configs em runtime
- `zapsign_events` — histórico de assinaturas
- contatos, mensagens, conversas, tarefas ClickUp synced
