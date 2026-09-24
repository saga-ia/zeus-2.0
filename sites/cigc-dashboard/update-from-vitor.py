#!/usr/bin/env python3
"""
Atualiza data.json do dashboard CIGC a partir dos reports do Vitor
no grupo Vitor Marketing TLK (WhatsApp). Faz upsert por data.

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

RE_HEADER = re.compile(r"Feedback TRAFEGO PAGO\s+(\d{2})/(\d{2})/(\d{4})", re.I)
RE_GASTO  = re.compile(r"Valor Gasto\s*R?\$?\s*([\d\.\,]+)", re.I)
RE_CONV   = re.compile(r"conversas?\s*=\s*([\d\.]+)", re.I)
RE_LEADS  = re.compile(r"Leads?\s+no\s+site\s*=\s*([\d\.]+)", re.I)
RE_CLICKS = re.compile(r"Cliques\s+no\s+link\s*=\s*([\d\.]+)", re.I)


def to_num(s):
    if s is None:
        return None
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_report(body):
    m = RE_HEADER.search(body)
    if not m:
        return None
    dia, mes, ano = m.groups()
    gasto = to_num(RE_GASTO.search(body).group(1)) if RE_GASTO.search(body) else None
    conv = to_num(RE_CONV.search(body).group(1)) if RE_CONV.search(body) else None
    leads = to_num(RE_LEADS.search(body).group(1)) if RE_LEADS.search(body) else None
    clicks = to_num(RE_CLICKS.search(body).group(1)) if RE_CLICKS.search(body) else None
    if gasto is None:
        return None
    return {
        "data": f"{dia}/{mes}",
        "data_full": f"{dia}/{mes}/{ano}",
        "gasto": round(gasto, 2),
        "conv": int(conv) if conv is not None else None,
        "leads": int(leads) if leads is not None else None,
        "clicks": int(clicks) if clicks is not None else None,
    }


def fetch_reports():
    con = sqlite3.connect(DB)
    cur = con.execute(
        "SELECT body FROM messages "
        "WHERE chat_id=? AND from_me=0 AND body LIKE 'Feedback TRAFEGO PAGO%' "
        "ORDER BY timestamp ASC",
        (GROUP,),
    )
    reports = {}
    for (body,) in cur:
        r = parse_report(body)
        if r:
            reports[r["data"]] = r
    con.close()
    return reports


def merge(data, reports):
    dias = data.get("dias", [])
    idx = {d[0]: i for i, d in enumerate(dias)}
    changed = False
    for key, r in reports.items():
        row = [r["data"], r["gasto"], r["conv"], r["leads"], r["clicks"]]
        if key in idx:
            if dias[idx[key]] != row:
                dias[idx[key]] = row
                changed = True
        else:
            dias.append(row)
            changed = True
    if not changed:
        return False

    def sort_key(d):
        dd, mm = d[0].split("/")
        return (int(mm), int(dd))

    dias.sort(key=sort_key)
    data["dias"] = dias

    total_inv = sum((d[1] or 0) for d in dias)
    total_conv = sum((d[2] or 0) for d in dias)
    total_clicks = sum((d[4] or 0) for d in dias)
    total_leads_site = sum((d[3] or 0) for d in dias)
    dias_ok = sum(1 for d in dias if d[1] is not None)
    cpl = round(total_inv / total_conv, 2) if total_conv else 0
    cpc = round(total_inv / total_clicks, 2) if total_clicks else 0

    universo = total_conv + total_leads_site + data["kpis"].get("leads_zeus", 0) + data["kpis"].get("leads_leandro", 0)

    data["kpis"].update({
        "investimento_total": round(total_inv, 2),
        "conversas_total": total_conv,
        "cpl_conversa": cpl,
        "cliques_total": total_clicks,
        "cpc_medio": cpc,
        "leads_site": total_leads_site,
        "dias_reportados": dias_ok,
        "universo_total": universo,
    })

    meses_map = {"05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto (parcial)"}
    meses = {}
    for d, g, c, l, _ in dias:
        mm = d.split("/")[1]
        nome = meses_map.get(mm, f"Mês {mm}")
        m = meses.setdefault(nome, {"dias": 0, "investido": 0, "conversas": 0, "leads_site": 0})
        m["dias"] += 1
        m["investido"] += g or 0
        m["conversas"] += c or 0
        m["leads_site"] += l or 0
    for m in meses.values():
        m["investido"] = round(m["investido"], 2)
    data["meses"] = meses

    ultima = dias[-1][0] + "/" + datetime.now().strftime("%Y")
    data["periodo"]["fim"] = ultima
    data["periodo"]["atualizado_em"] = datetime.now().strftime("%d/%m/%Y %H:%M")

    return True


def main():
    if not DATA.exists():
        print("data.json não existe", file=sys.stderr)
        sys.exit(1)
    data = json.loads(DATA.read_text())
    reports = fetch_reports()
    if not reports:
        print("nenhum report encontrado no banco")
        return
    if merge(data, reports):
        DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        print(f"data.json atualizado. {len(data['dias'])} dias | R${data['kpis']['investimento_total']:.2f} | {data['kpis']['conversas_total']} conv")
    else:
        print("nada mudou")


if __name__ == "__main__":
    main()
