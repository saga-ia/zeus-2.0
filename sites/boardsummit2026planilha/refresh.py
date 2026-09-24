#!/usr/bin/env python3
"""Regenera data.json puxando a planilha Board Summit 2026 via Google Sheets API.
Rodar via cron a cada 3-5 minutos."""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta

SHEET_ID = "1prKyR5kB-Zb6Fvsh13IN7aFzCQI2JHG3A7AHDw3alEQ"
USER = "jefersonhenrike1@gmail.com"
HELPER = "/opt/jeff-worker/scripts/google.sh"
OUT = "/opt/jeff-sites/boardsummit2026planilha/data.json"

def read_range(rng):
    r = subprocess.run(
        [HELPER, "sheets-get", USER, SHEET_ID, rng],
        capture_output=True, text=True, timeout=30
    )
    if r.returncode != 0:
        raise RuntimeError(f"sheets-get falhou em {rng}: {r.stderr}")
    data = json.loads(r.stdout)
    return data.get("values", [])

def cell(rows, i, j, default=""):
    if i < len(rows) and j < len(rows[i]):
        return rows[i][j]
    return default

def parse_num(s):
    if s is None or s == "":
        return 0
    if isinstance(s, (int, float)):
        return s
    s = str(s).strip().replace("R$", "").replace(" ", "").replace("%", "")
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    # A planilha do Sheets exporta em ingles: virgula=milhar, ponto=decimal.
    # Ex: "5,970" = 5970 ; "1,234.56" = 1234.56 ; "0.045" = 0.045 (decimal ingles)
    # Se so tem virgula (padrao BR de decimal), tratar virgula como decimal.
    if "." in s and "," in s:
        # ingles: virgula milhar, ponto decimal
        s = s.replace(",", "")
    elif "," in s:
        # ambiguo: se tem 3 digitos apos virgula e sem outros pontos, e milhar
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) == 3 and parts[1].isdigit():
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return 0

def main():
    premissas = read_range("Premissas!A1:Z60")
    metas = read_range("'Metas por Ingresso'!A1:Z60")
    acomp = read_range("Acompanhamento!A1:Z60")
    funil = read_range("'Funil de Aquisição'!A1:Z60")
    cenarios = read_range("'Cenários'!A1:Z60")

    prem_map = {}
    for row in premissas:
        if not row:
            continue
        k = row[0]
        prem_map[k] = row[1:] if len(row) > 1 else []

    vendido_lote_idx = None
    for i, row in enumerate(premissas):
        if row and "VENDIDO POR LOTE" in row[0]:
            vendido_lote_idx = i
            break

    ingressos_vendidos_l1 = 0
    ingressos_vendidos_l2 = 0
    ingressos_vendidos_l3 = 0
    ingressos_vendidos_total = 0
    receita_l1 = 0
    receita_l2 = 0
    receita_l3 = 0
    receita_total = 0
    if vendido_lote_idx is not None:
        for j in range(vendido_lote_idx + 1, min(vendido_lote_idx + 6, len(premissas))):
            row = premissas[j]
            if not row:
                continue
            label = row[0] if row else ""
            if "Ingressos vendidos" in label:
                ingressos_vendidos_l1 = parse_num(cell(premissas, j, 1))
                ingressos_vendidos_l2 = parse_num(cell(premissas, j, 2))
                ingressos_vendidos_l3 = parse_num(cell(premissas, j, 3))
                ingressos_vendidos_total = parse_num(cell(premissas, j, 4))
            if "Receita" in label or "receita" in label:
                receita_l1 = parse_num(cell(premissas, j, 1))
                receita_l2 = parse_num(cell(premissas, j, 2))
                receita_l3 = parse_num(cell(premissas, j, 3))
                receita_total = parse_num(cell(premissas, j, 4))

    def find_premissa(key):
        for row in premissas:
            if row and key in row[0]:
                return row[1] if len(row) > 1 else ""
        return ""

    dias_evento = find_premissa("DIAS PARA O EVENTO")
    pct_meta = find_premissa("% da meta vendida")
    status_ritmo = find_premissa("STATUS DO RITMO")
    data_evento = find_premissa("Data do evento")
    meta_geral = find_premissa("Meta geral de ingressos")

    metas_ingressos = []
    metas_start = None
    for i, row in enumerate(metas):
        if row and row[0] == "Tipo":
            metas_start = i
            break
    if metas_start is not None:
        for j in range(metas_start + 1, len(metas)):
            row = metas[j]
            if not row or not row[0]:
                break
            if "Total" in row[0] or "TOTAL" in row[0]:
                break
            metas_ingressos.append({
                "tipo": cell(metas, j, 0),
                "sheet_row": j + 1,
                "meta_total": parse_num(cell(metas, j, 1)),
                "vendido_l1": cell(metas, j, 7),
                "vendido_l2": cell(metas, j, 8),
                "vendido_l3": cell(metas, j, 9),
                "vendido_total": parse_num(cell(metas, j, 10)),
                "pct_meta": cell(metas, j, 11),
                "receita_total": cell(metas, j, 6),
            })

    # Calcula % do mix para cada tipo (para o donut dinâmico)
    total_meta_mix = sum(m['meta_total'] for m in metas_ingressos)
    for m in metas_ingressos:
        m['pct_mix'] = round(m['meta_total'] / total_meta_mix * 100, 1) if total_meta_mix > 0 else 0

    semanas = []
    sem_start = None
    for i, row in enumerate(acomp):
        if row and row[0] == "Semana":
            sem_start = i
            break
    if sem_start is not None:
        for j in range(sem_start + 1, len(acomp)):
            row = acomp[j]
            if not row or not row[0] or not row[0].lower().startswith("semana"):
                break
            semanas.append({
                "semana": cell(acomp, j, 0),
                "sheet_row": j + 1,
                "meta_ajustada": cell(acomp, j, 1),
                "vip_l1": cell(acomp, j, 2),
                "vip_l2": cell(acomp, j, 3),
                "vip_l3": cell(acomp, j, 4),
                "prem_l1": cell(acomp, j, 5),
                "prem_l2": cell(acomp, j, 6),
                "prem_l3": cell(acomp, j, 7),
                "emp_l1": cell(acomp, j, 8),
                "emp_l2": cell(acomp, j, 9),
                "emp_l3": cell(acomp, j, 10),
                "total": cell(acomp, j, 11),
                "receita": cell(acomp, j, 12),
                "acumulado": cell(acomp, j, 13),
                "pct_meta_geral": cell(acomp, j, 14),
                "diferenca": cell(acomp, j, 15),
                "pct_meta_semanal": cell(acomp, j, 16),
                "cenario": cell(acomp, j, 17),
            })

    # Se receita_total nao veio da secao VENDIDO POR LOTE, calcula somando o acompanhamento
    if not receita_total:
        for s in semanas:
            receita_total += parse_num(s.get("receita"))

    # Meta de receita total (soma da receita_total de todos os tipos)
    meta_receita_total = 0
    for m in metas_ingressos:
        meta_receita_total += parse_num(m.get("receita_total"))

    now = datetime.now(timezone(timedelta(hours=-3)))
    payload = {
        "updated_at": now.isoformat(),
        "updated_at_display": now.strftime("%d/%m/%Y às %H:%M"),
        "premissas": {
            "meta_geral": meta_geral,
            "dias_evento": dias_evento,
            "pct_meta_vendida": pct_meta,
            "status_ritmo": status_ritmo,
            "data_evento": data_evento,
            "ingressos_vendidos_total": ingressos_vendidos_total,
            "ingressos_vendidos_l1": ingressos_vendidos_l1,
            "ingressos_vendidos_l2": ingressos_vendidos_l2,
            "ingressos_vendidos_l3": ingressos_vendidos_l3,
            "receita_total": receita_total,
            "receita_l1": receita_l1,
            "receita_l2": receita_l2,
            "receita_l3": receita_l3,
            "meta_receita_total": meta_receita_total,
            "meta_ingressos_total": sum(m.get("meta_total", 0) for m in metas_ingressos),
        },
        "metas_ingressos": metas_ingressos,
        "acompanhamento": semanas,
    }

    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, OUT)
    print(f"OK {now.isoformat()} — {len(semanas)} semanas, {len(metas_ingressos)} tipos ingresso, total vendido: {ingressos_vendidos_total}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        sys.exit(1)
