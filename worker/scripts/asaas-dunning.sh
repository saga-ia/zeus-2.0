#!/bin/bash
# Régua de cobrança Asaas — D+0 / D+3 / D+7 / D+15.
# Roda 1x ao dia (cron). Lista OVERDUE, calcula dias após dueDate, dispara WhatsApp
# se ainda não disparou pra esse offset (idempotência via tabela asaas_dunning_sent).
#
# Uso direto:
#   asaas-dunning.sh          dispara régua (modo real)
#   asaas-dunning.sh dry      só lista quem seria disparado, sem enviar
set -u
DB="/opt/jeff-worker/data/worker.db"
ENV_FILE="/opt/jeff-worker/.env"
ASAAS_BASE="https://api.asaas.com/v3"
WAPI_BASE="http://127.0.0.1:3002"

KEY=$(sqlite3 "$DB" "SELECT value FROM app_settings WHERE key='asaas_api_key';")
WAPI_TOKEN=$(grep ^API_TOKEN "$ENV_FILE" | cut -d= -f2)
[ -z "$KEY" ] && { echo "no asaas key"; exit 2; }
[ -z "$WAPI_TOKEN" ] && { echo "no wapi token"; exit 2; }

DRY="${1:-}"

python3 - <<PY
import sys, sqlite3, urllib.request, urllib.parse, json
from datetime import date, datetime

KEY = "$KEY"
WAPI_TOKEN = "$WAPI_TOKEN"
DRY = "$DRY" == "dry"
DB = "$DB"

def asaas(path):
    req = urllib.request.Request("$ASAAS_BASE" + path, headers={"access_token": KEY})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def wapi_send(to, body):
    if DRY:
        print(f"  [DRY] would send to {to}: {body[:60]}...")
        return True
    digits = ''.join(c for c in to if c.isdigit())
    if not digits: return False
    phone_full = digits if digits.startswith('55') else '55' + digits
    data = json.dumps({"to": phone_full, "body": body}).encode()
    req = urllib.request.Request("$WAPI_BASE/messages/private", data=data, method="POST",
        headers={"Authorization": f"Bearer {WAPI_TOKEN}", "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=30).read()
        return True
    except Exception as e:
        print(f"  [ERR] wapi: {e}")
        return False

def fmt_brl(v): return f"R\$ {float(v):,.2f}".replace(",","X").replace(".",",").replace("X",".")
def fmt_date(d):
    try: return datetime.strptime(d,"%Y-%m-%d").strftime("%d/%m")
    except: return d

# coleta TODOS overdue paginado
overdue = []
offset = 0
while True:
    d = asaas(f"/payments?status=OVERDUE&limit=100&offset={offset}")
    items = d.get("data", [])
    overdue.extend(items)
    if not d.get("hasMore") or not items: break
    offset += len(items)

print(f"Overdue total: {len(overdue)}")

# offsets que disparam mensagem + tom
LADDER = {
    0:  "Olá {first}, hoje é o vencimento da sua cobrança de *{value}* (ref. {desc}). Se já pagou, ignore. Se precisar do link, é só pedir.",
    3:  "Oi {first}, sua cobrança de *{value}* (vencida em {due}) está em atraso há 3 dias. Conseguimos resolver hoje?",
    7:  "{first}, lembrando que sua cobrança de *{value}* (venc. {due}) já tem 7 dias de atraso. Me responde aqui pra eu te ajudar a regularizar.",
    15: "{first}, sua cobrança de *{value}* (venc. {due}) tá há 15 dias em aberto. Precisamos negociar — me responde pra eu te passar opções.",
}

today = date.today()
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

# cache customers
cust_cache = {}
def get_customer(cid):
    if cid in cust_cache: return cust_cache[cid]
    try: cust_cache[cid] = asaas(f"/customers/{cid}")
    except Exception as e:
        print(f"  [ERR] customer {cid}: {e}"); cust_cache[cid] = None
    return cust_cache[cid]

sent_count = 0
skipped_count = 0
for p in overdue:
    pid = p.get("id"); due = p.get("dueDate"); val = p.get("value"); cust_id = p.get("customer")
    if not (pid and due and val and cust_id): continue
    try:
        d_due = datetime.strptime(due, "%Y-%m-%d").date()
    except: continue
    days = (today - d_due).days
    if days not in LADDER: continue

    # idempotência
    row = conn.execute("SELECT 1 FROM asaas_dunning_sent WHERE payment_id=? AND day_offset=?",
                       (pid, days)).fetchone()
    if row:
        skipped_count += 1
        continue

    cust = get_customer(cust_id)
    if not cust: continue
    phone = cust.get("mobilePhone") or cust.get("phone")
    if not phone: continue

    msg = LADDER[days].format(
        first=(cust.get("name") or "").split(" ")[0],
        value=fmt_brl(val),
        due=fmt_date(due),
        desc=(p.get("description") or "")[:40] or "cobrança"
    )
    print(f"D+{days} → {cust.get('name')} ({phone}) | {fmt_brl(val)} | venc {fmt_date(due)}")
    ok = wapi_send(phone, msg)
    if ok and not DRY:
        conn.execute("INSERT INTO asaas_dunning_sent (payment_id, day_offset, customer_phone) VALUES (?,?,?)",
                     (pid, days, phone))
        conn.commit()
        sent_count += 1
print(f"---\nEnviadas: {sent_count} | já enviadas (skipped): {skipped_count}")
PY
