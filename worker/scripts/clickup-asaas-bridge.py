#!/usr/bin/env python3
"""Bridge ClickUp -> Asaas. Cron */2min.

Lógica:
- Lê clickup_events não notificados onde event_type='status_changed' e novo status type='closed'
  (ou event_type='taskStatusUpdated' se vier pelo webhook).
- Pra cada task: busca no cache; se TEM tag 'asaas-cobranca' E foi atribuída pra um cliente
  via descrição (linhas asaas_customer:/asaas_value:/asaas_due:), cria cobrança no Asaas.
- Se faltar dado, manda WhatsApp pro Jeff perguntando.
"""
from __future__ import annotations
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError

DB = "/opt/jeff-worker/data/worker.db"
LOG = "/opt/jeff-worker/logs/clickup-asaas-bridge.log"
LOCK = "/tmp/clickup-asaas-bridge.lock"
WAPI_URL = "http://127.0.0.1:3002/messages/private"

os.makedirs("/opt/jeff-worker/logs", exist_ok=True)

try:
    import fcntl
    lock_fp = open(LOCK, "w")
    fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
except (IOError, BlockingIOError):
    sys.exit(0)


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(LOG, "a") as f:
        f.write(f"[{ts}] {msg}\n")


_API_TOKEN = None
def api_token() -> str:
    global _API_TOKEN
    if _API_TOKEN is None:
        with open("/opt/jeff-worker/.env") as f:
            for line in f:
                if line.startswith("API_TOKEN="):
                    _API_TOKEN = line.strip().split("=", 1)[1]
                    break
    return _API_TOKEN or ""


def send_wapi(phone: str, body: str) -> bool:
    payload = json.dumps({"to": phone, "body": body}).encode("utf-8")
    req = Request(WAPI_URL, data=payload, method="POST",
                  headers={"Authorization": f"Bearer {api_token()}", "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=30) as r:
            r.read()
        return True
    except Exception as e:
        log(f"wapi error to {phone}: {e}")
        return False


def parse_asaas_meta(description: str) -> dict:
    """Extrai asaas_customer/value/due da descrição da task."""
    if not description:
        return {}
    out = {}
    for line in description.splitlines():
        m = re.match(r"^\s*asaas_(customer|value|due|description|type)\s*:\s*(.+?)\s*$", line, re.I)
        if m:
            out[m.group(1).lower()] = m.group(2).strip()
    return out


con = sqlite3.connect(DB, timeout=30)
con.row_factory = sqlite3.Row
con.execute("PRAGMA busy_timeout=30000")
cur = con.cursor()

JEFF_PHONE = (cur.execute("SELECT value FROM app_settings WHERE key='clickup_user_jeff_phone'").fetchone() or [None])[0]


# pega eventos de mudança de status que ainda não foram notificados
events = cur.execute(
    """SELECT e.id AS evt_id, e.event_type, e.event_payload, e.task_id, e.detected_at
       FROM clickup_events e
       WHERE e.notified=0
         AND e.event_type IN ('status_changed','taskStatusUpdated')
       ORDER BY e.id ASC
       LIMIT 50"""
).fetchall()

processed = 0
for evt in events:
    tid = evt["task_id"]
    if not tid:
        cur.execute("UPDATE clickup_events SET notified=1 WHERE id=?", (evt["evt_id"],))
        continue

    task = cur.execute(
        "SELECT name, status, status_type, description, raw_json, url FROM clickup_tasks_cache WHERE task_id=?",
        (tid,)
    ).fetchone()
    if not task:
        cur.execute("UPDATE clickup_events SET notified=1 WHERE id=?", (evt["evt_id"],))
        continue

    # só interessa quando task FOI fechada
    if task["status_type"] != "closed":
        cur.execute("UPDATE clickup_events SET notified=1 WHERE id=?", (evt["evt_id"],))
        continue

    # tag asaas-cobranca?
    try:
        raw = json.loads(task["raw_json"])
    except Exception:
        raw = {}
    tags = [t.get("name") for t in raw.get("tags", []) if isinstance(t, dict)]
    if "asaas-cobranca" not in tags:
        cur.execute("UPDATE clickup_events SET notified=1 WHERE id=?", (evt["evt_id"],))
        continue

    # extrai meta da descrição
    meta = parse_asaas_meta(task["description"] or "")
    customer = meta.get("customer")
    value = meta.get("value")
    due = meta.get("due")
    desc = meta.get("description") or task["name"]
    btype = (meta.get("type") or "BOLETO").upper()

    if not (customer and value and due):
        # falta dado, pergunta Jeff
        msg = (f"Bridge ClickUp -> Asaas: task *{task['name']}* foi concluída "
               f"com tag `asaas-cobranca` mas faltam dados.\n\n"
               f"Encontrei: customer={customer or '?'} value={value or '?'} due={due or '?'}\n\n"
               f"Pra eu gerar a cobrança, edita a descrição da task com:\n"
               f"```\nasaas_customer: cus_xxx\nasaas_value: 1500.00\nasaas_due: 2026-05-22\nasaas_type: BOLETO\n```\n\n"
               f"{task['url']}")
        if JEFF_PHONE:
            send_wapi(JEFF_PHONE, msg)
        log(f"missing_data task={tid} customer={customer} value={value} due={due}")
        cur.execute("UPDATE clickup_events SET notified=1 WHERE id=?", (evt["evt_id"],))
        con.commit()
        continue

    # tudo presente: chama asaas.sh create
    try:
        r = subprocess.run(
            ["/opt/jeff-worker/scripts/asaas.sh", "create", customer, value, due, desc, btype],
            capture_output=True, text=True, timeout=30,
        )
        out = r.stdout.strip()
        log(f"asaas create task={tid} rc={r.returncode} out={out[:300]}")
        try:
            resp = json.loads(out)
        except Exception:
            resp = {}
        if r.returncode == 0 and resp.get("id"):
            link = resp.get("invoiceUrl") or resp.get("bankSlipUrl") or "(sem link)"
            msg = (f"Cobrança Asaas gerada via ClickUp.\n\n"
                   f"Task: *{task['name']}*\n"
                   f"Cliente: {customer}\n"
                   f"Valor: R$ {value} | Vence: {due}\n"
                   f"Tipo: {btype}\n\n"
                   f"Pagamento: {link}\nID: {resp.get('id')}\n\n"
                   f"ClickUp: {task['url']}")
        else:
            msg = (f"Falhou cobrança Asaas pra task *{task['name']}*.\n\n"
                   f"Erro: {out[:300]}\n\n"
                   f"{task['url']}")
        if JEFF_PHONE:
            send_wapi(JEFF_PHONE, msg)
    except Exception as e:
        log(f"asaas create exception task={tid}: {e}")
        if JEFF_PHONE:
            send_wapi(JEFF_PHONE, f"Bridge ClickUp -> Asaas com erro: {e} | task: {task['url']}")

    cur.execute("UPDATE clickup_events SET notified=1 WHERE id=?", (evt["evt_id"],))
    con.commit()
    processed += 1

con.commit()
con.close()
log(f"bridge done: events_seen={len(events)} processed={processed}")
print(f"events={len(events)} processed={processed}")
