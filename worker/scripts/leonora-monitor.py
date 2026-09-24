#!/usr/bin/env python3
"""
Monitora o grupo "Leonora Equipe Farias Souza" e captura relatorios diarios
enviados pela Leonora, gravando na planilha do Farias
(1WIfmYEwmtDQTfOAN3Ax6EUK_fFArZg0-N7OBNI4z5ME, aba 'relatorios do social seller captacao').

Padrao esperado (case-insensitive):
    *Relatorio diario - Leonora DD/MM-*
    *Plataforma*
    Prospeccao: N
    Resposta: N
    Venda: N

Roda como processo PM2. Poll a cada 60s.
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import unicodedata
from datetime import datetime

DB = "/opt/jeff-worker/data/worker.db"
GOOGLE_SH = "/opt/jeff-worker/scripts/google.sh"
WAPI_SH = "/opt/jeff-worker/scripts/wapi.sh"
GOOGLE_USER = "jefersonhenrike1@gmail.com"
SHEET_ID = "1WIfmYEwmtDQTfOAN3Ax6EUK_fFArZg0-N7OBNI4z5ME"
SHEET_RANGE = "'relatórios do social seller captação'!A:F"
GROUP_JID = "120363428394302171@g.us"
AUTHOR_HINT = "Leonora"
SETTINGS_KEY = "leonora_report_last_id"
POLL_INTERVAL = 60
JEFF_PHONE = "5511910075450"
LOG_PATH = "/opt/jeff-worker/logs/leonora-monitor.log"


def log(msg):
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"{ts} {msg}"
    print(line, flush=True)
    try:
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def db_get(sql, params=()):
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    try:
        cur = con.execute(sql, params)
        return cur.fetchall()
    finally:
        con.close()


def db_exec(sql, params=()):
    con = sqlite3.connect(DB)
    try:
        con.execute(sql, params)
        con.commit()
    finally:
        con.close()


def get_last_id():
    rows = db_get("SELECT value FROM app_settings WHERE key = ?", (SETTINGS_KEY,))
    if not rows:
        return 0
    try:
        return int(rows[0]["value"])
    except (TypeError, ValueError):
        return 0


def set_last_id(new_id):
    db_exec(
        "INSERT INTO app_settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (SETTINGS_KEY, str(new_id)),
    )


def parse_report(body):
    """Retorna dict {data, plataforma, prospeccao, resposta, venda} ou None."""
    if not body:
        return None
    text = strip_accents(body)
    header = re.search(r"relat[o0]rio\s+di[a4]rio\s*-\s*leonora\s+(\d{1,2})/(\d{1,2})", text, re.I)
    if not header:
        return None
    dia, mes = header.group(1).zfill(2), header.group(2).zfill(2)
    ano = datetime.now().year
    data_str = f"{dia}/{mes}/{ano}"

    def find_num(labels):
        for label in labels:
            m = re.search(rf"{label}\s*:?\s*(\d+)", text, re.I)
            if m:
                return int(m.group(1))
        return 0

    plataforma_m = re.search(r"\*([^*]+)\*", body[header.end() - len(header.group(0)):])
    plataforma = plataforma_m.group(1).strip() if plataforma_m else ""

    prospeccao = find_num([r"prospec[cs](?:[a4]o|oes)"])
    resposta = find_num([r"respostas?"])
    venda = find_num([r"vendas?"])

    if prospeccao == 0 and resposta == 0 and venda == 0:
        return None

    return {
        "data": data_str,
        "plataforma": plataforma or "Instagram",
        "prospeccao": prospeccao,
        "resposta": resposta,
        "venda": venda,
    }


def append_to_sheet(row):
    """row = dict com data, plataforma, prospeccao, resposta, venda, obs."""
    values = [[
        row["data"],
        "Leonora",
        str(row["prospeccao"]),
        str(row["resposta"]),
        str(row["venda"]),
        row.get("obs", ""),
    ]]
    payload = json.dumps(values, ensure_ascii=False)
    try:
        result = subprocess.run(
            [GOOGLE_SH, "sheets-append", GOOGLE_USER, SHEET_ID, SHEET_RANGE, payload],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            log(f"ERRO append_to_sheet rc={result.returncode} stderr={result.stderr.strip()}")
            return False
        return True
    except Exception as e:
        log(f"EXC append_to_sheet {e}")
        return False


def report_already_saved(data_str, plataforma):
    """Verifica se ja existe linha com essa data + plataforma na planilha."""
    range_get = "'relatórios do social seller captação'!A:F"
    try:
        result = subprocess.run(
            [GOOGLE_SH, "sheets-get", GOOGLE_USER, SHEET_ID, range_get],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return False
        data = json.loads(result.stdout)
        for row in data.get("values", [])[1:]:
            if len(row) >= 2 and row[0] == data_str and row[1] == "Leonora":
                return True
    except Exception as e:
        log(f"EXC report_already_saved {e}")
    return False


def notify_jeff(text):
    payload = json.dumps({"to": JEFF_PHONE, "body": text}, ensure_ascii=False)
    try:
        subprocess.run(
            [WAPI_SH, "POST", "/messages/private", payload],
            capture_output=True, text=True, timeout=10,
        )
    except Exception as e:
        log(f"EXC notify_jeff {e}")


def check_new_messages():
    last_id = get_last_id()
    rows = db_get(
        "SELECT id, author_name, COALESCE(body, '') AS body, timestamp "
        "FROM messages WHERE chat_id = ? AND from_me = 0 AND id > ? "
        "ORDER BY id ASC",
        (GROUP_JID, last_id),
    )
    if not rows:
        return

    max_id = last_id
    for r in rows:
        mid = r["id"]
        author = r["author_name"] or ""
        body = r["body"] or ""
        max_id = mid

        if AUTHOR_HINT.lower() not in author.lower():
            continue
        parsed = parse_report(body)
        if not parsed:
            continue

        if report_already_saved(parsed["data"], parsed["plataforma"]):
            log(f"id={mid} data={parsed['data']} ja existe na planilha, pulando")
            continue

        ok = append_to_sheet(parsed)
        if ok:
            log(f"id={mid} appended data={parsed['data']} P={parsed['prospeccao']} R={parsed['resposta']} V={parsed['venda']}")
            notify_jeff(
                f"Relatorio da Leonora ({parsed['data']}) salvo na planilha do Farias.\n"
                f"Prospeccao: {parsed['prospeccao']} | Resposta: {parsed['resposta']} | Venda: {parsed['venda']}"
            )
        else:
            log(f"id={mid} falhou append")

    if max_id > last_id:
        set_last_id(max_id)


def main():
    log(f"=== leonora-monitor iniciado. Grupo={GROUP_JID} | Autor~{AUTHOR_HINT} | Poll={POLL_INTERVAL}s ===")
    while True:
        try:
            check_new_messages()
        except Exception as e:
            log(f"EXC loop {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
