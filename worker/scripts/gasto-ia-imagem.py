#!/usr/bin/env python3
"""Gasto com IA de imagem (Nano Banana / GPT Image), mesmo registro que a Central mostra em Agente de Design > Criações.
Tabela ia_imagem_gastos no central.db; preços em /opt/jeff-apps/jeff-central/ia-precos.json (fonte única).

Uso:
  gasto-ia-imagem.py                      resumo (total, mês, hoje, por modelo, por origem, por mês) em US$ e R$
  gasto-ia-imagem.py registrar <origem> <gemini|openai> <modelo> <gerar|editar> [usage.json|-] [qualidade]
                                          (os scripts ilustra.sh e editar-imagem.sh chamam isto sozinhos)
"""
import json, sqlite3, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

DB = "/opt/jeff-apps/jeff-central/data/central.db"
PRECOS = "/opt/jeff-apps/jeff-central/ia-precos.json"
BRT = timezone(timedelta(hours=-3))
SCHEMA = """CREATE TABLE IF NOT EXISTS ia_imagem_gastos (id INTEGER PRIMARY KEY AUTOINCREMENT, em INTEGER NOT NULL, origem TEXT NOT NULL,
  motor TEXT NOT NULL, modelo TEXT, operacao TEXT, custo_usd REAL NOT NULL, estimado INTEGER NOT NULL DEFAULT 1,
  tokens_in INTEGER, tokens_out INTEGER, criacao_id TEXT, usuario TEXT, detalhe TEXT)"""


def custo(motor, modelo, usage, qualidade=None):
    try: P = json.load(open(PRECOS))
    except Exception: P = {}
    p = P.get(modelo) or P.get("gemini-3-pro-image" if motor == "gemini" else "gpt-image-2.5-flare") or {}
    u = usage or {}
    if motor == "gemini" and u.get("candidatesTokenCount"):
        img = sum(x.get("tokenCount", 0) for x in u.get("candidatesTokensDetails") or [] if x.get("modality") == "IMAGE") or u["candidatesTokenCount"]
        txt = max(0, u["candidatesTokenCount"] - img) + u.get("thoughtsTokenCount", 0)
        c = u.get("promptTokenCount", 0) * p["usd_milhao_in"] / 1e6 + img * p["usd_milhao_out_imagem"] / 1e6 + txt * p["usd_milhao_out_texto"] / 1e6
        return round(c, 5), 0, u.get("promptTokenCount"), u["candidatesTokenCount"] + u.get("thoughtsTokenCount", 0)
    base = p.get("usd_imagem_high") if qualidade == "high" and p.get("usd_imagem_high") else p.get("usd_imagem", 0)
    return base, 1, u.get("input_tokens"), u.get("output_tokens")


def registrar(origem, motor, modelo, operacao, usage=None, qualidade=None, detalhe=None, em=None):
    c, est, tin, tout = custo(motor, modelo, usage, qualidade)
    db = sqlite3.connect(DB, timeout=15); db.execute(SCHEMA)
    db.execute("INSERT INTO ia_imagem_gastos (em, origem, motor, modelo, operacao, custo_usd, estimado, tokens_in, tokens_out, detalhe) VALUES (?,?,?,?,?,?,?,?,?,?)",
               (em or int(time.time() * 1000), origem, motor, modelo, operacao, c, est, tin, tout, (detalhe or "")[:300] or None))
    db.commit(); db.close()
    return c


def cotacao():
    try:
        with urllib.request.urlopen("https://open.er-api.com/v6/latest/USD", timeout=5) as r: return float(json.load(r)["rates"]["BRL"])
    except Exception: return 5.5


def resumo():
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try: db.execute("SELECT 1 FROM ia_imagem_gastos LIMIT 1")
    except sqlite3.OperationalError: print("Nenhum gasto registrado ainda."); return
    agora = datetime.now(BRT); ms = lambda d: int(d.timestamp() * 1000)
    mes0, dia0 = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0), agora.replace(hour=0, minute=0, second=0, microsecond=0)
    q = lambda w="", *a: db.execute(f"SELECT count(*), coalesce(sum(custo_usd),0) FROM ia_imagem_gastos {w}", a).fetchone()
    brl = cotacao(); f = lambda usd: f"US$ {usd:.2f} (R$ {usd * brl:.2f})".replace(".", ",")
    (nt, ut), (nm, um), (nh, uh) = q(), q("WHERE em >= ?", ms(mes0)), q("WHERE em >= ?", ms(dia0))
    est = db.execute("SELECT coalesce(sum(custo_usd),0) FROM ia_imagem_gastos WHERE estimado=1").fetchone()[0]
    print(f"Gasto com IA de imagem (dólar a R$ {brl:.2f})".replace(".", ","))
    print(f"  Total: {nt} imagens · {f(ut)}\n  Este mês: {nm} imagens · {f(um)}\n  Hoje: {nh} imagens · {f(uh)}")
    print("\nPor modelo:")
    for mo, mod, n, u in db.execute("SELECT motor, modelo, count(*), sum(custo_usd) FROM ia_imagem_gastos GROUP BY 1,2 ORDER BY 4 DESC"): print(f"  {mod or mo}: {n} · {f(u)}")
    print("\nPor origem:")
    for o, n, u in db.execute("SELECT origem, count(*), sum(custo_usd) FROM ia_imagem_gastos GROUP BY 1 ORDER BY 3 DESC"): print(f"  {o}: {n} · {f(u)}")
    print("\nPor mês:")
    for m, n, u in db.execute("SELECT strftime('%Y-%m', (em - 10800000) / 1000, 'unixepoch') m, count(*), sum(custo_usd) FROM ia_imagem_gastos GROUP BY 1 ORDER BY 1 DESC LIMIT 6"): print(f"  {m}: {n} · {f(u)}")
    print(f"\n{f(est)} do total é estimado pela tabela de preço (OpenAI e histórico); o resto é exato pelos tokens do Google.")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "registrar":
        origem, motor, modelo, oper = a[1:5]
        usage = None
        if len(a) > 5 and a[5] not in ("", "-"):
            try: usage = json.loads(open(a[5]).read() if not a[5].lstrip().startswith("{") else a[5])
            except Exception: usage = None
        print(f"gasto registrado: US$ {registrar(origem, motor, modelo, oper, usage, a[6] if len(a) > 6 else None):.3f}")
    else:
        resumo()
