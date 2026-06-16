#!/bin/bash
# Helper Asaas API — financeiro do Jeff (cobranças, clientes, inadimplência).
# Token em app_settings.asaas_api_key.
#
# Uso:
#   asaas.sh customers [limit]                                lista clientes
#   asaas.sh payments <status> [limit]                        lista pagamentos por status (PENDING/OVERDUE/RECEIVED/CONFIRMED)
#   asaas.sh customer-payments <cus_id> [limit]               pagamentos de um cliente
#   asaas.sh dashboard                                        snapshot: contagens + total a receber + total overdue
#   asaas.sh create <cus_id> <value> <due_date> <desc> [type] cria cobrança (type: BOLETO|PIX|CREDIT_CARD, default BOLETO)
#   asaas.sh raw <method> <path> [body]                       chamada crua na API
set -u
DB="/opt/jeff-worker/data/worker.db"
BASE="https://api.asaas.com/v3"

KEY=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='asaas_api_key';")
if [ -z "$KEY" ]; then
  echo '{"error":"asaas_api_key missing in app_settings"}'; exit 2
fi

api() {
  local method="$1"; local path="$2"; local body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$BASE$path" \
      -H "access_token: $KEY" -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -s -X "$method" "$BASE$path" \
      -H "access_token: $KEY"
  fi
}

cmd="${1:-}"
case "$cmd" in
  customers)
    LIMIT="${2:-100}"
    api GET "/customers?limit=$LIMIT"
    ;;
  payments)
    STATUS="${2:?usage: payments <STATUS> [limit]}"
    LIMIT="${3:-100}"
    api GET "/payments?status=$STATUS&limit=$LIMIT"
    ;;
  customer-payments)
    CUS="${2:?usage: customer-payments <cus_id> [limit]}"
    LIMIT="${3:-50}"
    api GET "/payments?customer=$CUS&limit=$LIMIT"
    ;;
  dashboard)
    python3 - <<PY
import json, urllib.request
KEY="$KEY"; BASE="$BASE"
def get(path):
    req = urllib.request.Request(BASE+path, headers={"access_token": KEY})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())
out = {}
for st in ["PENDING","OVERDUE","RECEIVED","CONFIRMED"]:
    d = get(f"/payments?status={st}&limit=1")
    out[st] = {"totalCount": d.get("totalCount", 0)}
cust = get("/customers?limit=1")
out["customers"] = {"totalCount": cust.get("totalCount", 0)}
# soma de valores overdue + pending (paginado)
def sum_status(st):
    total = 0.0; offset = 0; n = 0
    while True:
        d = get(f"/payments?status={st}&limit=100&offset={offset}")
        items = d.get("data", [])
        if not items: break
        for p in items:
            total += float(p.get("value") or 0); n += 1
        if not d.get("hasMore"): break
        offset += 100
    return total, n
out["PENDING"]["sumValue"], _  = sum_status("PENDING")
out["OVERDUE"]["sumValue"], _  = sum_status("OVERDUE")
print(json.dumps(out, indent=2, ensure_ascii=False))
PY
    ;;
  create)
    CUS="${2:?usage: create <cus_id> <value> <due_date> <desc> [type]}"
    VAL="${3:?value required}"
    DUE="${4:?due_date YYYY-MM-DD required}"
    DESC="${5:?description required}"
    TYPE="${6:-BOLETO}"
    api POST "/payments" "$(cat <<JSON
{"customer":"$CUS","billingType":"$TYPE","value":$VAL,"dueDate":"$DUE","description":"$DESC"}
JSON
)"
    ;;
  raw)
    METHOD="${2:-GET}"
    P="${3:?path required}"
    BODY="${4:-}"
    api "$METHOD" "$P" "$BODY"
    ;;
  *)
    cat <<USAGE
asaas.sh — Asaas API helper (Jeferson)

Comandos:
  customers [limit]                                  lista clientes
  payments <status> [limit]                          lista pagamentos (PENDING/OVERDUE/RECEIVED/CONFIRMED)
  customer-payments <cus_id> [limit]                 pagamentos de um cliente específico
  dashboard                                          snapshot: contagens + somas de PENDING/OVERDUE
  create <cus_id> <value> <due_date> <desc> [type]   cria cobrança (BOLETO|PIX|CREDIT_CARD, default BOLETO)
  raw <METHOD> <path> [body]                         chamada crua

Exemplos:
  asaas.sh customers 5
  asaas.sh payments OVERDUE
  asaas.sh dashboard
  asaas.sh create cus_000123 297.00 2026-05-15 "Mensalidade EBC"
  asaas.sh raw GET "/payments/pay_xyz"
USAGE
    exit 1
    ;;
esac
