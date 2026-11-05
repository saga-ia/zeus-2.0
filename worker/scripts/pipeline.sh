#!/bin/bash
# Pipeline comercial do Jeff/Alpha pro Otávio. SÓ LEITURA (sqlite3 -readonly).
# Cruza: funil do CRM SDR (jeff-sdrs-crm) + última conversa do WhatsApp (jeff-sdrs)
#        + leads da Alpha (jeff-alpha-clientes) + funil da agência (worker.db) + follow-ups abertos.
#
# Uso: pipeline.sh [dias_parado=3]
# Saída: resumo por etapa, leads parados (sem mudar de etapa há N dias) com "de quem é a vez",
#        leads Alpha pendentes, funil da agência e follow-ups vencidos.
set -u
python3 - "${1:-3}" <<'PY'
import sqlite3, sys, time
from datetime import datetime, timedelta, timezone
DIAS = int(sys.argv[1]); agora = time.time()
BRT = timezone(timedelta(hours=-3))
def ro(p):
    try: return sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    except Exception as e: print(f"[sem acesso] {p}: {e}"); return None
def brt(ts): return datetime.fromtimestamp(ts, BRT).strftime("%d/%m %H:%M") if ts else "-"
def fone(p): return ("…" + p[-4:]) if p else "-"

ORDEM = ["disparado", "conversa_iniciada", "novo_lead", "em_negociacao", "chamar_novamente", "iniciou_compra", "finalizou_compra", "perdido"]
ATIVAS = {"conversa_iniciada", "novo_lead", "em_negociacao", "chamar_novamente", "iniciou_compra"}

crm = ro("/opt/jeff-apps/jeff-sdrs-crm/kanban.db"); sdrs = ro("/opt/jeff-apps/jeff-sdrs/data/sdrs.db")
print("== FUNIL CRM SDR (jeff-sdrs-crm) ==")
if crm:
    cont = dict(crm.execute("SELECT stage, COUNT(*) FROM lead_stages GROUP BY stage").fetchall())
    print("  " + " | ".join(f"{s}: {cont.get(s, 0)}" for s in ORDEM) + "".join(f" | {k}: {v}" for k, v in cont.items() if k not in ORDEM))
    rows = crm.execute("""SELECT s.lead_key, s.stage, s.updated_at, s.notes, s.replied_at, m.nome, m.empresa, m.telefone
                          FROM lead_stages s LEFT JOIN manual_leads m ON m.id = s.lead_key OR m.telefone = s.lead_key""").fetchall()
    parados = [r for r in rows if r[1] in ATIVAS and (agora - (r[2] or 0)) > DIAS * 86400]
    print(f"\n== EM ANDAMENTO PARADOS há mais de {DIAS} dias: {len(parados)} ==")
    for key, stage, upd, notes, replied, nome, emp, tel in sorted(parados, key=lambda r: ORDEM.index(r[1]) if r[1] in ORDEM else 99, reverse=True):
        tel = tel or (key if key and key.isdigit() else None)
        vez = "sem conversa no SDR"; ultima = ""
        if sdrs and tel:
            c = sdrs.execute("SELECT last_from_me, last_ts, unread, substr(last_message,1,70) FROM conversations WHERE contact_phone LIKE ? ORDER BY last_ts DESC LIMIT 1", (f"%{tel[-8:]}",)).fetchone()
            if c:
                vez = "NOSSA (cliente falou por último)" if not c[0] else "dele (esperando resposta)"
                ultima = f" | última msg {brt(c[1])}: \"{c[3] or ''}\""
        print(f"  [{stage}] {nome or '?'} ({emp or '-'}) {fone(tel)} | parado desde {brt(upd)} | vez: {vez}{ultima}" + (f" | nota: {notes[:60]}" if notes else ""))
    ativos_frescos = [r for r in rows if r[1] in ATIVAS and r not in parados]
    print(f"\n== EM ANDAMENTO EM DIA: {len(ativos_frescos)} ==")
    for r in ativos_frescos[:10]: print(f"  [{r[1]}] {r[5] or '?'} ({r[6] or '-'}) atualizado {brt(r[2])}")

print("\n== LEADS ALPHA (jeff-alpha-clientes) ==")
al = ro("/opt/jeff-apps/jeff-alpha-clientes/data/clientes.db")
if al:
    print("  leads por status: " + (", ".join(f"{s}: {n}" for s, n in al.execute("SELECT status, COUNT(*) FROM leads GROUP BY status")) or "nenhum"))
    for r in al.execute("SELECT business_name, contact_name, segment, monthly_revenue, created_at FROM leads WHERE status='pending' ORDER BY created_at DESC LIMIT 10"):
        print(f"  [pending] {r[0]} | {r[1]} | {r[2]} | faturamento {r[3]} | desde {r[4]}")
    print("  clientes ativos: " + (", ".join(n for (n,) in al.execute("SELECT name FROM clients WHERE status='ativo'")) or "nenhum"))

wk = ro("/opt/jeff-worker/data/worker.db")
if wk:
    print("\n== FUNIL DA AGÊNCIA (worker.db agencia_clientes) ==")
    print("  " + (", ".join(f"{f}: {n}" for f, n in wk.execute("SELECT fase_funil, COUNT(*) FROM agencia_clientes GROUP BY fase_funil")) or "vazio (ninguém registrado ainda)"))
    print("\n== FOLLOW-UPS ABERTOS (jeff_followups) ==")
    for d, due, ch in wk.execute("SELECT description, due_at, chase_count FROM jeff_followups WHERE status='open' ORDER BY due_at"):
        print(f"  {'VENCIDO ' if due and due < datetime.utcnow().strftime('%Y-%m-%d %H:%M') else ''}{d[:80]} | prazo {due or '-'} (UTC) | cobrado {ch}x")
PY
