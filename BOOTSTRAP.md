# Bootstrap — Zeus 2.0 em servidor novo

Passo a passo pra subir tudo do zero. Tempo estimado: ~30min até Zeus rodando + ~1h pra subir todos os apps.

## 0. Pré-requisitos no host novo

- Debian/Ubuntu recente
- Node.js 20+ (via nvm), Python 3.10+, Docker + docker-compose
- PM2 global: `npm i -g pm2`
- `rsync`, `git`, `gpg`, `curl`, `jq`

## 1. Clonar o repo

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/saga-ia/zeus-2.0.git
```

## 2. Restaurar estrutura `/opt/jeff-*`

```bash
# move pra layout esperado pelos paths absolutos do PM2/cron
mv /opt/zeus-2.0/worker   /opt/jeff-worker
mv /opt/zeus-2.0/apps     /opt/jeff-apps
mv /opt/zeus-2.0/sites    /opt/jeff-sites
mv /opt/zeus-2.0/projects /opt/jeff-projects
mv /opt/zeus-2.0/data/jeff-data    /opt/jeff-data
mv /opt/zeus-2.0/data/jeff-cigc    /opt/jeff-cigc
mv /opt/zeus-2.0/data/jeff-ideias  /opt/jeff-ideias
mv /opt/zeus-2.0/infra/zeus-backup /opt/zeus-backup
```

## 3. Restaurar segredos (NÃO estão no repo)

Recuperar do backup cifrado GPG no Google Drive (pasta `Zeus`):
- `.env` de cada app
- banco do worker (`data/*.db`) — contém `app_settings` com TODOS os tokens
- sessões WhatsApp (`.wwebjs_auth/`) — opcional, scan QR de novo se faltar

```bash
# decifrar último backup
gpg --decrypt /opt/zeus-backup/latest.tar.gz.gpg | tar xzf - -C /
```

Passphrase em `/root/.zeus/` (do servidor antigo).

## 4. Instalar deps + node_modules

```bash
cd /opt/jeff-worker && npm ci
for app in /opt/jeff-apps/*/; do (cd "$app" && [ -f package.json ] && npm ci); done
```

## 5. Subir Docker stack (NPM, postgres, redis, n8n, evolution)

```bash
cd /opt/zeus-2.0/infra/labastia-docker
cp .env.example .env  # ajustar senhas/tokens
docker compose up -d
```

NPM no painel `http://servidor:81` → configurar SSL Let's Encrypt + roteamento dos subdomínios.

## 6. PM2: subir apps

```bash
pm2 resurrect  # se houver dump
# OU subir manualmente:
cd /opt/jeff-worker && pm2 start ecosystem.config.js
for app in /opt/jeff-apps/*/; do
  [ -f "$app/ecosystem.config.js" ] && pm2 start "$app/ecosystem.config.js"
done
pm2 save && pm2 startup
```

Confirmar 24 processos online: `pm2 list`

## 7. Crons

```bash
crontab /opt/zeus-2.0/docs/crontab-snapshot.txt
```

## 8. Cloudflare DNS (subdomínios novos)

Token Cloudflare em `app_settings` ou recriar via painel. Helper:
```bash
/opt/jeff-worker/scripts/cloudflare.sh add <sub>
```

## 9. Validar

- `pm2 list` → 24 online
- `crontab -l` → 12 jobs
- `docker ps` → 6 containers
- Testar WhatsApp: mandar msg pro número Zeus, ver `agent-runner` responder
- Testar webhook ZapSign: assinar contrato teste, ver evento em `zapsign_events`

## Troubleshoot

- **agent-runner `state=ready` com client null** → reset sessão WhatsApp
- **Auto-memória** vive em `/root/.claude/projects/-root/memory/` (não está no repo)
- **CLAUDE.md global** em `/root/.claude/CLAUDE.md` (recuperar do backup)
