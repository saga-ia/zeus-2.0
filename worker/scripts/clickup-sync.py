#!/usr/bin/env python3
"""ClickUp -> SQLite sync incremental. Cron */5min."""
from __future__ import annotations
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DB = "/opt/jeff-worker/data/worker.db"
LOG = "/opt/jeff-worker/logs/clickup-sync.log"
LOCK = "/tmp/clickup-sync.lock"
BASE = "https://api.clickup.com/api/v2"

os.makedirs("/opt/jeff-worker/logs", exist_ok=True)


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(LOG, "a") as f:
        f.write(f"[{ts}] {msg}\n")


# lock simples
try:
    import fcntl
    lock_fp = open(LOCK, "w")
    fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
except (IOError, BlockingIOError):
    sys.exit(0)


con = sqlite3.connect(DB, timeout=30)
con.row_factory = sqlite3.Row
cur = con.cursor()


def setting(key: str) -> Optional[str]:
    r = cur.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
    return r["value"] if r else None


def state_get(key: str) -> Optional[str]:
    r = cur.execute("SELECT value FROM clickup_state WHERE key=?", (key,)).fetchone()
    return r["value"] if r else None


def state_set(key: str, value: str) -> None:
    cur.execute(
        "INSERT INTO clickup_state(key,value,updated_at) VALUES(?,?,datetime('now')) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
        (key, value),
    )


TOKEN = setting("clickup_api_token")
WORKSPACE = setting("clickup_workspace_id")
if not TOKEN or not WORKSPACE:
    log("missing token or workspace in app_settings")
    sys.exit(2)


def api_get(path: str, params: dict) -> dict:
    url = f"{BASE}{path}?{urlencode(params, doseq=True)}"
    req = Request(url, headers={"Authorization": TOKEN})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read())


last_sync_str = state_get("last_sync_ms")
if last_sync_str:
    last_sync = int(last_sync_str)
else:
    last_sync = (int(time.time()) - 30 * 86400) * 1000
    log(f"first sync: backfilling last 30 days from {last_sync}")

now_ms = int(time.time() * 1000)

new_count = upd_count = evt_count = 0
page = 0
while True:
    try:
        data = api_get(
            f"/team/{WORKSPACE}/task",
            {
                "page": page,
                "date_updated_gt": last_sync,
                "include_closed": "true",
                "subtasks": "true",
                "order_by": "updated",
                "reverse": "true",
            },
        )
    except Exception as e:
        log(f"page {page} error: {e}")
        break

    tasks = data.get("tasks", [])
    if not tasks:
        break

    for t in tasks:
        tid = t["id"]
        name = t.get("name", "")
        status_obj = t.get("status") or {}
        status = status_obj.get("status")
        status_type = status_obj.get("type")
        due = t.get("due_date")

        prev = cur.execute(
            "SELECT status, due_date, list_id FROM clickup_tasks_cache WHERE task_id=?",
            (tid,),
        ).fetchone()

        if prev is None:
            new_count += 1
        else:
            upd_count += 1
            if prev["status"] != status:
                cur.execute(
                    "INSERT INTO clickup_events(task_id,event_type,event_payload) VALUES(?,?,?)",
                    (tid, "status_changed",
                     json.dumps({"from": prev["status"], "to": status, "task_name": name})),
                )
                evt_count += 1
            prev_due = str(prev["due_date"]) if prev["due_date"] is not None else None
            new_due = str(due) if due is not None else None
            if prev_due != new_due:
                cur.execute(
                    "INSERT INTO clickup_events(task_id,event_type,event_payload) VALUES(?,?,?)",
                    (tid, "due_changed",
                     json.dumps({"from": prev_due, "to": new_due, "task_name": name})),
                )
                evt_count += 1

        space = t.get("space") or {}
        folder = t.get("folder") or {}
        lst = t.get("list") or {}
        creator = t.get("creator") or {}

        cur.execute(
            """INSERT INTO clickup_tasks_cache(
              task_id,workspace_id,space_id,space_name,folder_id,folder_name,list_id,list_name,
              name,description,status,status_type,priority,url,
              date_created,date_updated,date_done,date_closed,due_date,start_date,
              assignees_json,creator_id,parent_id,raw_json,cached_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
            ON CONFLICT(task_id) DO UPDATE SET
              space_id=excluded.space_id, space_name=excluded.space_name,
              folder_id=excluded.folder_id, folder_name=excluded.folder_name,
              list_id=excluded.list_id, list_name=excluded.list_name,
              name=excluded.name, description=excluded.description,
              status=excluded.status, status_type=excluded.status_type,
              priority=excluded.priority, url=excluded.url,
              date_updated=excluded.date_updated, date_done=excluded.date_done,
              date_closed=excluded.date_closed, due_date=excluded.due_date,
              start_date=excluded.start_date, assignees_json=excluded.assignees_json,
              raw_json=excluded.raw_json, cached_at=excluded.cached_at
            """,
            (
                tid, WORKSPACE,
                space.get("id"), space.get("name"),
                folder.get("id"), folder.get("name"),
                lst.get("id"), lst.get("name"),
                name, t.get("description"),
                status, status_type,
                (t.get("priority") or {}).get("orderindex") if t.get("priority") else None,
                t.get("url"),
                int(t["date_created"]) if t.get("date_created") else None,
                int(t["date_updated"]) if t.get("date_updated") else None,
                int(t["date_done"]) if t.get("date_done") else None,
                int(t["date_closed"]) if t.get("date_closed") else None,
                int(t["due_date"]) if t.get("due_date") else None,
                int(t["start_date"]) if t.get("start_date") else None,
                json.dumps(t.get("assignees", [])),
                str(creator.get("id")) if creator.get("id") else None,
                t.get("parent"),
                json.dumps(t),
            ),
        )

    con.commit()
    if len(tasks) < 100:
        break
    page += 1
    if page > 50:
        log("page limit reached")
        break

state_set("last_sync_ms", str(now_ms))
con.commit()
log(f"sync done: new={new_count} updated={upd_count} events={evt_count}")
print(f"new={new_count} updated={upd_count} events={evt_count}")
