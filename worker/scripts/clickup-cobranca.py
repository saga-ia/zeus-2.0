#!/usr/bin/env python3
"""Cobrança automática de tarefas ClickUp via WhatsApp.
Cron 4x/dia (8h/11h/14h/18h BRT). Lê cache local clickup_tasks_cache.

Lógica:
- Pega tasks abertas (status_type != 'closed') agrupadas por assignee.
- Classifica em: vencida_grave (>24h vencida), vencida_recente (<24h vencida),
  vence_hoje, vence_24h.
- Monta digest por responsável e envia WhatsApp.
- Loga em clickup_chase_log pra evitar reenvio.
"""
from __future__ import annotations
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

DB = "/opt/jeff-worker/data/worker.db"
LOG = "/opt/jeff-worker/logs/clickup-cobranca.log"
WAPI_URL = "http://127.0.0.1:3002/messages/private"

BRT = timezone(timedelta(hours=-3))


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(LOG, "a") as f:
        f.write(f"[{ts}] {msg}\n")


con = sqlite3.connect(DB, timeout=30)
con.row_factory = sqlite3.Row
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA busy_timeout=30000")
cur = con.cursor()


def setting(key: str) -> Optional[str]:
    r = cur.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
    return r["value"] if r else None


JEFF_ID = setting("clickup_user_jeff_id")
JEFF_PHONE = setting("clickup_user_jeff_phone")
VINI_ID = setting("clickup_user_vinicius_id")
VINI_PHONE = setting("clickup_user_vinicius_phone")

# mapping user_id -> (nome, phone)
USER_MAP = {}
if JEFF_ID and JEFF_PHONE:
    USER_MAP[int(JEFF_ID)] = ("Jeff", JEFF_PHONE)
if VINI_ID and VINI_PHONE:
    USER_MAP[int(VINI_ID)] = ("Vinicius", VINI_PHONE)


def fmt_due(due_ms: int) -> str:
    dt = datetime.fromtimestamp(due_ms / 1000, tz=BRT)
    return dt.strftime("%d/%m %Hh%M")


def classify(due_ms: int, now_ms: int) -> str:
    diff_h = (due_ms - now_ms) / 3_600_000
    if diff_h < -24:
        return "vencida_grave"
    if diff_h < 0:
        return "vencida_recente"
    if diff_h < 12:
        return "vence_hoje"
    if diff_h < 36:
        return "vence_24h"
    return "futuro"


_API_TOKEN = None

def _api_token() -> str:
    global _API_TOKEN
    if _API_TOKEN is None:
        with open("/opt/jeff-worker/.env") as f:
            for line in f:
                if line.startswith("API_TOKEN="):
                    _API_TOKEN = line.strip().split("=", 1)[1]
                    break
    return _API_TOKEN or ""


def send_wapi(phone: str, body: str) -> bool:
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError
    payload = json.dumps({"to": phone, "body": body}).encode("utf-8")
    req = Request(
        WAPI_URL, data=payload, method="POST",
        headers={
            "Authorization": f"Bearer {_api_token()}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=30) as r:
            r.read()
        return True
    except HTTPError as e:
        body_resp = e.read().decode("utf-8", errors="ignore")[:300]
        log(f"wapi HTTP {e.code} to {phone}: {body_resp} payload_len={len(payload)}")
        return False
    except (URLError, Exception) as e:
        log(f"wapi exception to {phone}: {e}")
        return False


# pega todas tasks abertas com due_date
now_ms = int(time.time() * 1000)
rows = cur.execute(
    """SELECT task_id, name, status, list_name, folder_name, space_name,
              due_date, assignees_json, url
       FROM clickup_tasks_cache
       WHERE status_type IS NOT 'closed'
         AND due_date IS NOT NULL
       ORDER BY due_date ASC"""
).fetchall()

# agrupa por assignee_id
by_user: dict[int, list[dict]] = {}
unassigned: list[dict] = []
for r in rows:
    cls = classify(r["due_date"], now_ms)
    if cls == "futuro":
        continue
    item = {
        "id": r["task_id"], "name": r["name"], "status": r["status"],
        "list": r["list_name"], "folder": r["folder_name"], "space": r["space_name"],
        "due": r["due_date"], "url": r["url"], "class": cls,
    }
    try:
        assigns = json.loads(r["assignees_json"] or "[]")
    except Exception:
        assigns = []
    if not assigns:
        unassigned.append(item)
    else:
        for a in assigns:
            uid = a.get("id")
            if uid:
                by_user.setdefault(int(uid), []).append(item)

# também: se Jeff é dono do workspace, ele recebe digest geral
# (Jeff sempre vê tudo, mesmo sem ser assignee)
all_items = list({i["id"]: i for i in unassigned + [it for items in by_user.values() for it in items]}.values())

ORDER = {"vencida_grave": 0, "vencida_recente": 1, "vence_hoje": 2, "vence_24h": 3}
LABELS = {
    "vencida_grave": "VENCIDA HÁ MAIS DE 24H",
    "vencida_recente": "VENCIDA HOJE",
    "vence_hoje": "VENCE HOJE",
    "vence_24h": "VENCE NAS PRÓXIMAS 24H",
}


def build_message(items: list[dict], for_user: str) -> str:
    if not items:
        return ""
    items.sort(key=lambda x: (ORDER.get(x["class"], 9), x["due"]))
    grupos: dict[str, list[dict]] = {}
    for it in items:
        grupos.setdefault(it["class"], []).append(it)

    hora_brt = datetime.now(BRT)
    hora_str = hora_brt.strftime("%H:%M")
    h = hora_brt.hour
    saudacao = "Ótimo dia" if h < 12 else ("Ótima tarde" if h < 18 else "Ótima noite")

    lines = [f"{saudacao}, {for_user}.", "", f"*Cobrança Zeus | ClickUp — {hora_str}*", ""]
    for cls in ["vencida_grave", "vencida_recente", "vence_hoje", "vence_24h"]:
        if cls not in grupos:
            continue
        lines.append(f"*{LABELS[cls]}* ({len(grupos[cls])})")
        for it in grupos[cls][:8]:
            ctx = it["list"] or "?"
            if it["folder"]:
                ctx = f"{it['folder']} / {ctx}"
            lines.append(f"• {it['name']}")
            lines.append(f"  {ctx} | due {fmt_due(it['due'])}")
            lines.append(f"  {it['url']}")
        if len(grupos[cls]) > 8:
            lines.append(f"  (+{len(grupos[cls]) - 8} outras)")
        lines.append("")

    if for_user != "Jeff":
        lines.append(f"Responde aqui o status de cada uma. O Zeus posta o retorno como comentário no ClickUp.")
    return "\n".join(lines).strip()


# Fecha conexão de leitura ANTES de mandar wapi (libera lock pro worker escrever em send_queue)
con.commit()
con.close()

sent = 0
# 1. Digest pro Vinicius com tasks dele
vini_items = by_user.get(int(VINI_ID), []) if VINI_ID else []
if vini_items:
    msg = build_message(vini_items, "Vinicius")
    if send_wapi(VINI_PHONE, msg):
        log(f"sent to Vinicius: {len(vini_items)} tasks")
        sent += 1

# 2. Digest pro Jeff: tudo (próprias + de outros + sem responsável)
jeff_items = list({i["id"]: i for i in all_items}.values())
if jeff_items:
    msg_jeff = build_message(jeff_items, "Jeff")
    resumo = ["", "*Resumo por responsável:*"]
    for uid, items in by_user.items():
        nome = USER_MAP.get(uid, (f"user {uid}", ""))[0]
        resumo.append(f"• {nome}: {len(items)}")
    if unassigned:
        resumo.append(f"• Sem responsável: {len(unassigned)}")
    msg_jeff = msg_jeff + "\n" + "\n".join(resumo)

    if send_wapi(JEFF_PHONE, msg_jeff):
        log(f"sent to Jeff: {len(jeff_items)} tasks")
        sent += 1

# Reabre conexão pra logar chase
con2 = sqlite3.connect(DB, timeout=30)
con2.execute("PRAGMA busy_timeout=30000")
cur2 = con2.cursor()
if vini_items and sent >= 1:
    for it in vini_items:
        cur2.execute(
            "INSERT INTO clickup_chase_log(task_id,assignee_id,recipient_phone,chase_level,due_date) VALUES(?,?,?,?,?)",
            (it["id"], VINI_ID, VINI_PHONE, it["class"], it["due"]),
        )
con2.commit()
con2.close()
log(f"cobrança done: messages_sent={sent} jeff_items={len(jeff_items) if 'jeff_items' in dir() else 0} vini_items={len(vini_items)}")
print(f"sent={sent}")
