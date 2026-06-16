# Zeus 2.0

Snapshot organizado da operação atual em `jefersonhenrike.com` (16/06/2026).

Substitui o backup `saga-ia/zeus` (v1) com estrutura mais limpa e refletindo o estado real de produção.

## Estrutura

```
zeus-2.0/
├── README.md              # este arquivo
├── BOOTSTRAP.md           # como subir tudo do zero em servidor novo
├── ARCHITECTURE.md        # diagrama de fluxos e integrações
├── ACTIVE_PROCESSES.md    # snapshot PM2 + cron com função de cada um
│
├── worker/                # Zeus core (whatsapp-worker + agente + crons)
├── apps/                  # 28 apps Node (21 ativos no PM2 + 7 inativos)
├── sites/                 # 11 sites estáticos + nginx container
├── projects/              # docs e ativos de projetos (cigc-2026, clientes)
├── data/                  # docs estruturais (jeff-data, jeff-cigc, jeff-ideias)
├── infra/
│   ├── zeus-backup/       # backup cifrado pro Google Drive
│   └── labastia-docker/   # docker-compose (NPM + postgres + redis + n8n + evolution)
└── docs/                  # pm2-snapshot.json, crontab-snapshot.txt
```

## Estado de produção (16/06/2026)

- **PM2**: 24 processos online
- **Cron**: 12 jobs ativos (ig-poller, asaas-dunning, clickup-sync/cobrança, morning-brief, board-schedule, backup Drive)
- **Docker**: 6 containers (nginx-proxy-manager + postgres + redis + n8n + evolution + jeff-sites-nginx)
- **Domínio raiz**: `jefersonhenrike.com` (hospedagem antiga + email, NÃO mexer)
- **Subdomínios**: criados via Cloudflare → SSL pelo NPM Let's Encrypt

Detalhes processo por processo em [`ACTIVE_PROCESSES.md`](ACTIVE_PROCESSES.md).

## O que NÃO está aqui

- `.env`, tokens, credenciais → guardados no servidor + `app_settings` no banco do worker
- `node_modules/`, sessões `.wwebjs_auth/`, bancos `*.db`, logs, mídias, uploads
- `.bak*` (limpos no rsync)
- Volumes Docker do `labastia-setup` (apenas o compose)

## Como restaurar em servidor novo

Ver [`BOOTSTRAP.md`](BOOTSTRAP.md). ~30min até Zeus rodando.
