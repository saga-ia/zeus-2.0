#!/bin/bash
# Helper de Meta Marketing API — leitura de contas de anúncio múltiplas.
# Usa user token (9 contas) como primário e system token como fallback.
# Tokens vivem em app_settings (chaves: jeff_meta_user_token, jeff_meta_system_token).
#
# Uso:
#   meta-ads.sh accounts                              # lista todas as contas visíveis
#   meta-ads.sh campaigns <account_id>                # lista campanhas da conta
#   meta-ads.sh insights <account_id> [date_preset]   # gasto/perf da conta
#   meta-ads.sh insights-campaign <campaign_id> [date_preset]
#   meta-ads.sh adsets <campaign_id>
#   meta-ads.sh ads <adset_id>
#   meta-ads.sh raw <path> [extra_query]              # GET cru no Graph
#
# date_preset: today | yesterday | this_week_mon_today | last_7d | last_14d |
#              last_30d | this_month | last_month | maximum  (default: last_7d)

set -u
DB="/opt/jeff-worker/data/worker.db"
API="https://graph.facebook.com/v19.0"

get_setting() {
  sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='$1';"
}

USER_TOKEN=$(get_setting jeff_meta_user_token)
SYSTEM_TOKEN=$(get_setting jeff_meta_system_token)

if [ -z "$USER_TOKEN" ] && [ -z "$SYSTEM_TOKEN" ]; then
  echo '{"error":"no tokens in app_settings"}'
  exit 2
fi

graph_get() {
  local path="$1"; shift
  local extra="${1:-}"
  local url="$API/$path"
  local q="access_token=$USER_TOKEN&$extra"
  local resp
  resp=$(curl -s --get "$url" --data-urlencode "access_token=$USER_TOKEN" $(echo "$extra" | sed -E 's/&/\n/g' | awk -F= 'NF==2{printf "--data-urlencode %s=%s ", $1, $2}'))
  if echo "$resp" | grep -q '"error"' && [ -n "$SYSTEM_TOKEN" ]; then
    # fallback to system token
    resp=$(curl -s --get "$url" --data-urlencode "access_token=$SYSTEM_TOKEN" $(echo "$extra" | sed -E 's/&/\n/g' | awk -F= 'NF==2{printf "--data-urlencode %s=%s ", $1, $2}'))
  fi
  echo "$resp"
}

cmd="${1:-}"
case "$cmd" in
  accounts)
    graph_get "me/adaccounts" "fields=id,account_id,name,account_status,currency,timezone_name,business&limit=200"
    ;;
  campaigns)
    [ -z "${2:-}" ] && { echo "usage: campaigns <account_id>"; exit 1; }
    graph_get "act_$2/campaigns" "fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time&limit=100"
    ;;
  insights)
    [ -z "${2:-}" ] && { echo "usage: insights <account_id> [date_preset]"; exit 1; }
    PRESET="${3:-last_7d}"
    graph_get "act_$2/insights" "fields=spend,impressions,clicks,reach,cpm,cpc,ctr,actions&date_preset=$PRESET&level=account"
    ;;
  insights-campaign)
    [ -z "${2:-}" ] && { echo "usage: insights-campaign <campaign_id> [date_preset]"; exit 1; }
    PRESET="${3:-last_7d}"
    graph_get "$2/insights" "fields=spend,impressions,clicks,reach,cpm,cpc,ctr,actions,campaign_name&date_preset=$PRESET&level=campaign"
    ;;
  adsets)
    [ -z "${2:-}" ] && { echo "usage: adsets <campaign_id>"; exit 1; }
    graph_get "$2/adsets" "fields=id,name,status,daily_budget,lifetime_budget,targeting,optimization_goal&limit=100"
    ;;
  ads)
    [ -z "${2:-}" ] && { echo "usage: ads <adset_id>"; exit 1; }
    graph_get "$2/ads" "fields=id,name,status,creative,effective_status&limit=100"
    ;;
  raw)
    [ -z "${2:-}" ] && { echo "usage: raw <path> [extra_query]"; exit 1; }
    graph_get "$2" "${3:-}"
    ;;
  *)
    cat <<USAGE
meta-ads.sh — Meta Marketing API helper

Comandos:
  accounts                                   lista contas visíveis
  campaigns <account_id>                     campanhas de uma conta
  insights <account_id> [preset]             gasto/perf da conta (default last_7d)
  insights-campaign <campaign_id> [preset]   gasto/perf de campanha
  adsets <campaign_id>                       adsets de uma campanha
  ads <adset_id>                             ads de um adset
  raw <path> [query]                         GET cru no Graph

date_preset: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month, maximum
USAGE
    exit 1
    ;;
esac
