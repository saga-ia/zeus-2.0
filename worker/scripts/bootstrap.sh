#!/usr/bin/env bash
#
# bootstrap.sh — Fase 0 do WhatsApp Worker (idempotente)
#
# Executa a preparação do ambiente descrita no plano em fases:
#   0.B  derrubar stack Docker remanescente
#   0.C  purgar pacotes Docker
#   0.D  swap 4 GB + sysctl
#   0.E  Chromium + libs Puppeteer + build-essential + sqlite3 + certbot + PM2
#   0.F  nginx site + TLS Let's Encrypt
#   0.G  scaffold em /opt/jeff-worker
#
# Re-executar é seguro: cada passo verifica estado antes de agir.

set -euo pipefail

DOMAIN="agente.imersaoparadigma.com.br"
EMAIL="jefersonhenrike1@gmail.com"
PROJECT_DIR="/opt/jeff-worker"
SWAP_SIZE_GB=4
SYSCTL_FILE="/etc/sysctl.d/99-whatsapp-worker.conf"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}.conf"

log() { printf '\n\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }

require_root() {
  [[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }
}

step_docker_down() {
  log "0.B — derrubando stack Docker (se existir)"
  if command -v docker >/dev/null 2>&1; then
    if [[ -f /opt/jeff-worker/docker-compose.yml ]]; then
      (cd /opt/jeff-worker && docker compose down --volumes --remove-orphans) || true
    fi
    docker system prune -af --volumes || true
  else
    echo "  docker não instalado, pulando."
  fi
}

step_docker_purge() {
  log "0.C — purgando Docker"
  if dpkg -l | grep -q '^ii  docker-ce '; then
    systemctl stop docker.service docker.socket containerd.service 2>/dev/null || true
    apt-get purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin
    find /var/lib/docker -depth -mindepth 1 -delete 2>/dev/null || true
    rmdir /var/lib/docker 2>/dev/null || true
    find /var/lib/containerd -depth -mindepth 1 -delete 2>/dev/null || true
    rmdir /var/lib/containerd 2>/dev/null || true
    rm -rf /etc/docker
    rm -f /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.asc
  else
    echo "  docker-ce ausente, pulando."
  fi
}

step_swap() {
  log "0.D — swap ${SWAP_SIZE_GB} GB"
  local want_bytes=$((SWAP_SIZE_GB * 1024 * 1024 * 1024))
  local have_bytes=0
  [[ -f /swapfile ]] && have_bytes=$(stat -c %s /swapfile)
  if [[ $have_bytes -eq $want_bytes ]]; then
    echo "  swapfile já tem ${SWAP_SIZE_GB} GB."
  else
    swapoff /swapfile 2>/dev/null || true
    rm -f /swapfile
    fallocate -l "${SWAP_SIZE_GB}G" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
  fi
  grep -qE '^/swapfile\s' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  cat > "$SYSCTL_FILE" <<EOF
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
  sysctl -p "$SYSCTL_FILE" >/dev/null
}

step_packages() {
  log "0.E — pacotes nativos"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    build-essential sqlite3 \
    chromium fonts-liberation \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libgtk-3-0 \
    certbot python3-certbot-nginx

  if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2 pm2-logrotate
    pm2 install pm2-logrotate
  fi
  pm2 set pm2-logrotate:max_size 10M >/dev/null
  pm2 set pm2-logrotate:retain 7 >/dev/null
  pm2 set pm2-logrotate:compress true >/dev/null
}

step_nginx_tls() {
  log "0.F — nginx + TLS para ${DOMAIN}"
  rm -f /etc/nginx/sites-enabled/default
  if [[ ! -f "$NGINX_SITE" ]]; then
    cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 503 "WhatsApp Worker em preparacao\n";
        add_header Content-Type text/plain;
    }
}
EOF
  fi
  mkdir -p /var/www/html
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${DOMAIN}.conf"
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx

  if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
    certbot --nginx -d "${DOMAIN}" \
      --email "${EMAIL}" --agree-tos --no-eff-email \
      --redirect --non-interactive
  else
    echo "  cert já existe, pulando emissão."
  fi
}

step_scaffold() {
  log "0.G — scaffold ${PROJECT_DIR}"
  mkdir -p "${PROJECT_DIR}"/{src,config,data,logs,scripts}
}

main() {
  require_root
  step_docker_down
  step_docker_purge
  step_swap
  step_packages
  step_nginx_tls
  step_scaffold
  log "Fase 0 concluída."
  free -h
  df -h /
}

main "$@"
