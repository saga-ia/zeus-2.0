#!/usr/bin/env bash
# Cria o DNS de um cliente em zeusia.cloud (roda no servidor do Jeff, onde está o token da Cloudflare).
#
#   bash /root/zeus-2.0/instalador/dns-cliente.sh <nomecliente> <ip_do_servidor_do_cliente>
#
# Cria  <nomecliente>.zeusia.cloud  e  *.<nomecliente>.zeusia.cloud  (registro A, sem proxy),
# que cobrem central., sagazeus., n8n. e todos os outros subdomínios do Zeus do cliente.
set -euo pipefail
ZONA="zeusia.cloud"
CF=/opt/jeff-worker/scripts/cloudflare.sh
SLUG="${1:?uso: dns-cliente.sh <nomecliente> <ip>}"
IP="${2:?uso: dns-cliente.sh <nomecliente> <ip>}"
SLUG="$(echo "$SLUG" | tr 'A-Z' 'a-z' | sed "s/\.$ZONA\$//")"
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || { echo "nome inválido: use letras, números e hífen (ex: padariajoao)"; exit 1; }
[[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "IP inválido: $IP"; exit 1; }

for nome in "$SLUG" "*.$SLUG"; do
  r="$("$CF" add "$ZONA" "$nome" "$IP" false)"
  if echo "$r" | grep -q '"success":true'; then echo "  ok  $nome.$ZONA -> $IP"
  elif echo "$r" | grep -qE '81057|81058|already exists'; then echo "  já existia  $nome.$ZONA (confira se aponta pra $IP no painel da Cloudflare)"
  else echo "  ERRO  $nome.$ZONA: $(echo "$r" | head -c 300)"; exit 1; fi
done
echo "Pronto. Domínio do cliente no instalador: $SLUG.$ZONA"
