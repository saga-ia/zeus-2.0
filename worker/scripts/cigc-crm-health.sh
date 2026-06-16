#!/bin/bash
# Healthcheck do CRM CIGC (https://crm.cadastroforms.com).
# Roda no cron a cada 5min. Faz login + GET /api/leads, valida total>0 e JSON íntegro.
# Notifica Jeff via WhatsApp apenas em transição UP->DOWN ou DOWN->UP (evita spam).
set -u

CRM_URL="http://127.0.0.1:3027"
CRM_USER="admin"
CRM_PASS="cigc2026"
STATE="/opt/jeff-worker/data/cigc-crm-health.state"
LOG="/opt/jeff-worker/logs/cigc-crm-health.log"
WAPI_SH="/opt/jeff-worker/scripts/wapi.sh"
JEFF_PHONE="5511910075450"
COOKIE=$(mktemp)
trap 'rm -f "$COOKIE"' EXIT

mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
ts() { date '+%Y-%m-%d %H:%M:%S BRT'; }
log() { echo "$(ts) $*" >> "$LOG"; }

prev_state=$(cat "$STATE" 2>/dev/null || echo "unknown")

# 1. login
login_code=$(curl -s -m 10 -c "$COOKIE" -X POST "$CRM_URL/login" \
  -d "name=$CRM_USER&password=$CRM_PASS" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")

if [ "$login_code" != "302" ]; then
  reason="login HTTP $login_code"
  current="down"
elif ! leads_body=$(curl -s -m 10 -b "$COOKIE" "$CRM_URL/api/leads" 2>/dev/null); then
  reason="api timeout"
  current="down"
elif ! total=$(echo "$leads_body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['total'] if d.get('ok') else -1)" 2>/dev/null); then
  reason="JSON inválido em /api/leads"
  current="down"
elif [ "$total" -lt 0 ]; then
  reason="api retornou ok=false"
  current="down"
elif [ "$total" -eq 0 ]; then
  reason="zero leads (planilha vazia ou Sheets fora)"
  current="down"
else
  reason="$total leads OK"
  current="up"
fi

log "$current ($reason)"
echo "$current" > "$STATE"

# notificar só em transição (DOWN->UP ou UP->DOWN)
if [ "$prev_state" != "$current" ] && [ "$prev_state" != "unknown" ]; then
  if [ "$current" = "down" ]; then
    msg="ALERTA CRM CIGC fora do ar. $reason. URL: https://crm.cadastroforms.com"
  else
    msg="CRM CIGC voltou ao normal. $reason."
  fi
  "$WAPI_SH" POST /messages/private "{\"to\":\"$JEFF_PHONE\",\"body\":\"$msg\"}" >> "$LOG" 2>&1 || log "falha ao enviar wapi"
fi
