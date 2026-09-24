#!/usr/bin/env python3
"""
Atualiza data.json do dashboard CIGC pegando os relatos do Gustavo Augusto
(gerente geral do evento) no grupo do CIGC. Extrai inscritos totais e
vendas de campanha por dia, mantendo o valor mais recente por data.

Roda via cron a cada 10 min. Idempotente: se nada mudou, não escreve.
"""
import json
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB = "/opt/jeff-worker/data/worker.db"
DATA = Path("/opt/jeff-sites/cigc-dashboard/data.json")
GROUP = "120363425829398689@g.us"
AUTHOR = "Gustavo Augusto"

# padrão típico do Gustavo: "440 inscritos", "Finalizando o dia com 432 inscritos",
# "estamos com 317 inscritos totais", "iniciando o dia com 328 inscritos"
RE_INSCRITOS = re.compile(r"(\d{2,4})\s*inscritos", re.I)

# vendas de campanha: "251 vendas", "22 vendas de segunda pra hoje",
# "Sobre os que temos de tráfego são 157"
RE_VENDAS = re.compile(r"(\d{1,4})\s*vendas", re.I)
RE_TRAFEGO = re.compile(r"tr[áa]fego\s+s[ãa]o\s+(\d{1,4})", re.I)

# ignora quando ele fala de meta / valor de referência
RE_META = re.compile(r"(garantia|meta|equil[ií]brio|precisa|para bater)", re.I)


def fetch_gustavo_posts():
    con = sqlite3.connect(DB)
    cur = con.execute(
        "SELECT timestamp, body FROM messages "
        "WHERE chat_id=? AND from_me=0 AND author_name=? "
        "AND body IS NOT NULL AND (body LIKE '%inscritos%' OR body LIKE '%vendas%' OR body LIKE '%tráfego%' OR body LIKE '%trafego%') "
        "ORDER BY timestamp ASC",
        (GROUP, AUTHOR),
    )
    posts = []
    for ts, body in cur:
        dt_utc = None
        try:
            dt_utc = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")
        except (TypeError, ValueError):
            try:
                dt_utc = datetime.utcfromtimestamp(int(float(ts)))
            except (TypeError, ValueError):
                continue
        # BRT
        ts_int = int(dt_utc.timestamp())
        dt_brt = datetime.utcfromtimestamp(ts_int - 3 * 3600)
        posts.append((dt_brt, body, ts_int))
    con.close()
    return posts


def parse_post(body):
    """Retorna (inscritos, vendas) extraídos ou (None, None). Rejeita frases de meta."""
    inscritos = None
    vendas = None

    if not RE_META.search(body):
        m = RE_INSCRITOS.search(body)
        if m:
            n = int(m.group(1))
            if 100 <= n <= 5000:
                inscritos = n

    m = RE_VENDAS.search(body)
    if m and not RE_META.search(body):
        n = int(m.group(1))
        if 1 <= n <= 5000:
            vendas = n

    if vendas is None:
        m = RE_TRAFEGO.search(body)
        if m:
            n = int(m.group(1))
            if 1 <= n <= 5000:
                vendas = n

    return inscritos, vendas


def build_reports(posts):
    """Consolida por dia (dd/mm): mantém o valor mais recente do dia para cada campo."""
    by_day = {}  # key dd/mm -> {"inscritos":(ts,val), "vendas":(ts,val), "ts_inscritos":..., "ts_vendas":...}
    for dt, body, ts in posts:
        insc, vend = parse_post(body)
        if insc is None and vend is None:
            continue
        key = dt.strftime("%d/%m")
        slot = by_day.setdefault(key, {"inscritos": None, "vendas": None, "ts_inscritos": 0, "ts_vendas": 0})
        if insc is not None and ts >= slot["ts_inscritos"]:
            slot["inscritos"] = insc
            slot["ts_inscritos"] = ts
        if vend is not None and ts >= slot["ts_vendas"]:
            slot["vendas"] = vend
            slot["ts_vendas"] = ts
    return by_day


def sort_key(d):
    dd, mm = d[0].split("/")
    return (int(mm), int(dd))


def merge(data, by_day):
    existing = data.get("gustavo_reports", [])
    existing_idx = {row[0]: i for i, row in enumerate(existing)}
    changed = False

    for key, slot in by_day.items():
        row = [key, slot["inscritos"], slot["vendas"]]
        if key in existing_idx:
            cur = existing[existing_idx[key]]
            # não sobrescreve valor manual com None
            merged = [
                key,
                row[1] if row[1] is not None else cur[1] if len(cur) > 1 else None,
                row[2] if row[2] is not None else cur[2] if len(cur) > 2 else None,
            ]
            if merged != list(cur):
                existing[existing_idx[key]] = merged
                changed = True
        else:
            existing.append(row)
            changed = True

    if not changed:
        return False

    existing.sort(key=sort_key)
    data["gustavo_reports"] = existing

    # KPIs em destaque: valor mais recente registrado
    last_insc = None
    last_insc_key = None
    last_vend = None
    last_vend_key = None
    for row in existing:
        if len(row) > 1 and row[1] is not None:
            last_insc = row[1]
            last_insc_key = row[0]
        if len(row) > 2 and row[2] is not None:
            last_vend = row[2]
            last_vend_key = row[0]

    kpis = data.setdefault("kpis", {})
    if last_insc is not None:
        kpis["inscritos_totais"] = last_insc
        # timestamp do último post que trouxe esse número
        ts = by_day.get(last_insc_key, {}).get("ts_inscritos", 0)
        if ts:
            kpis["inscritos_atualizado_em"] = datetime.utcfromtimestamp(ts - 3 * 3600).strftime("%d/%m %H:%M")
    if last_vend is not None:
        kpis["vendas_campanha"] = last_vend
        ts = by_day.get(last_vend_key, {}).get("ts_vendas", 0)
        if ts:
            kpis["vendas_atualizado_em"] = datetime.utcfromtimestamp(ts - 3 * 3600).strftime("%d/%m %H:%M")

    data.setdefault("periodo", {})["atualizado_em"] = datetime.now().strftime("%d/%m/%Y %H:%M")
    return True


def main():
    if not DATA.exists():
        print("data.json não existe", file=sys.stderr)
        sys.exit(1)
    data = json.loads(DATA.read_text())
    posts = fetch_gustavo_posts()
    if not posts:
        print("nenhum post do Gustavo encontrado")
        return
    by_day = build_reports(posts)
    if not by_day:
        print("nenhum número extraído dos posts")
        return
    if merge(data, by_day):
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        k = data["kpis"]
        print(f"data.json atualizado. inscritos={k.get('inscritos_totais')} vendas={k.get('vendas_campanha')}")
    else:
        print("nada mudou")


if __name__ == "__main__":
    main()
