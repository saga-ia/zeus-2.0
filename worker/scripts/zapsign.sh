#!/bin/bash
# Helper ZapSign API — assinatura digital (docs, signatários, templates).
# Token em app_settings.zapsign_api_token.
#
# Uso:
#   zapsign.sh docs [page]                          lista documentos
#   zapsign.sh doc <doc_token>                      detalhe de 1 documento
#   zapsign.sh templates                            lista templates
#   zapsign.sh signers <doc_token>                  lista signatários do doc
#   zapsign.sh events [limit]                       últimos eventos webhook (do worker.db)
#   zapsign.sh raw <method> <path> [body]           chamada crua
set -u
DB="/opt/jeff-worker/data/worker.db"
BASE="https://api.zapsign.com.br/api/v1"

KEY=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='zapsign_api_token';")
if [ -z "$KEY" ]; then
  echo '{"error":"zapsign_api_token missing in app_settings"}'; exit 2
fi

api() {
  local method="$1"; local path="$2"; local body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -X "$method" "$BASE$path" \
      -H "Authorization: Bearer $KEY"
  fi
}

cmd="${1:-}"
case "$cmd" in
  docs)
    PAGE="${2:-1}"
    api GET "/docs/?page=$PAGE"
    ;;
  doc)
    TOKEN="${2:?usage: doc <doc_token>}"
    api GET "/docs/$TOKEN/"
    ;;
  templates)
    api GET "/templates/"
    ;;
  signers)
    TOKEN="${2:?usage: signers <doc_token>}"
    api GET "/docs/$TOKEN/" | python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d.get('signers',[]),indent=2,ensure_ascii=False))"
    ;;
  events)
    LIMIT="${2:-20}"
    sqlite3 -header -column "$DB" "SELECT id, event, doc_id, signer_email, status, received_at FROM zapsign_events ORDER BY received_at DESC LIMIT $LIMIT;"
    ;;
  raw)
    METHOD="${2:-GET}"
    P="${3:?path required}"
    BODY="${4:-}"
    api "$METHOD" "$P" "$BODY"
    ;;
  *)
    cat <<USAGE
zapsign.sh — ZapSign API helper (Jeferson)

Comandos:
  docs [page]                        lista documentos (paginado)
  doc <doc_token>                    detalhe de 1 documento (signers, status, urls)
  templates                          lista templates configurados
  signers <doc_token>                só os signatários de 1 doc
  events [limit]                     últimos eventos recebidos via webhook (do worker.db)
  raw <METHOD> <path> [body]         chamada crua

Webhook receptor: https://zapsign.jefersonhenrike.com/webhook
Painel de eventos: https://zapsign.jefersonhenrike.com
USAGE
    exit 1
    ;;
esac
