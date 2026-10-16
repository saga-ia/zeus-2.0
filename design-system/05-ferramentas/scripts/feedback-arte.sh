#!/bin/bash
# Feedback das artes (o que o usuário aprovou/reprovou), pra o Zeus/agentes lerem ANTES de criar a próxima arte.
# Fontes (só leitura): design_feedback (👍/👎/💬 por imagem no chat da Central) e o 👍/👎 das mensagens do chat que trazem arte.
# Uso: feedback-arte.sh [marca|criacao_id] [dias=60]
set -u
FILTRO="${1:-}"; DIAS="${2:-60}"
python3 - "$FILTRO" "$DIAS" <<'PY'
import sqlite3, sys, json, re, time
from datetime import datetime, timedelta, timezone
filtro, dias = sys.argv[1].lower(), int(sys.argv[2])
db = sqlite3.connect("file:/opt/jeff-apps/jeff-central/data/central.db?mode=ro", uri=True)
desde = int((time.time() - dias * 86400) * 1000)
BRT = timezone(timedelta(hours=-3)); quando = lambda ms: datetime.fromtimestamp(ms / 1000, BRT).strftime("%d/%m %H:%M")
cria = {}
for cid, dados, marca in db.execute("SELECT c.id, c.dados, coalesce(m.nome,'') FROM social_criacoes c LEFT JOIN social_marcas m ON m.id = c.marca_id"):
    try: d = json.loads(dados or "{}")
    except Exception: d = {}
    cria[cid] = (marca, (d.get("ideia") or d.get("prompt") or "")[:70].replace("\n", " "))
def ok(cid):
    if not filtro: return True
    m, ideia = cria.get(cid, ("", ""))
    return filtro in (cid or "").lower() or filtro in m.lower()
linhas = []
try:
    for arq, cid, sl, ver, usr, val, nota, up in db.execute("SELECT arquivo, criacao_id, slide, versao, usuario, valor, nota, updated_at FROM design_feedback WHERE updated_at >= ? ORDER BY updated_at DESC", (desde,)):
        if ok(cid): linhas.append((up, "👍" if val > 0 else "👎", cid, f"lâmina {sl} v{ver}" if sl else "", nota or "", usr, arq))
except sqlite3.OperationalError: pass  # tabela ainda não criada
for mid, content, fb, nota, ts in db.execute("SELECT id, content, feedback, feedback_nota, created_at FROM messages WHERE role='zeus' AND feedback IS NOT NULL AND feedback != 0 AND created_at >= ? AND content LIKE '%/api/design/arquivo/%' ORDER BY created_at DESC", (desde,)):
    for cid in sorted(set(re.findall(r"/api/design/arquivo/([\w-]+)/", content or ""))):
        if ok(cid): linhas.append((ts, "👍" if fb > 0 else "👎", cid, "mensagem inteira", nota or "", "chat", ""))
# Gosto da marca (gosto.md, escrito pelo Zeus): resumo do que a marca aprova. Vem primeiro.
import os
marcas = {mid: nome for mid, nome in db.execute("SELECT id, nome FROM social_marcas")}
for mid, nome in marcas.items():
    g = f"/opt/jeff-worker/projetos/design-modelos/marcas/{mid}/gosto.md"
    if filtro and filtro not in nome.lower() and filtro != mid.lower(): continue
    if os.path.exists(g):
        print(f"=== Gosto da marca {nome} ({g}) ===\n" + open(g).read().strip() + "\n")

# Comentário ESCRITO no chat logo depois de uma entrega de arte: elogio, crítica ou correção ("ficou muito bom", "sou mais magro")
ELOGIO = re.compile(r"(ficou|t[áa]|est[áa]) (muito |bem |super |mais )?(bo[ma](?!\s*\?)|top|legal|lind|massa|show|perfeit|[óo]tim|incr[íi]vel|da hora|sensacional|bacana)|muito bo[ma]|esse [ée] o caminho|gostei|curti|aprovad|perfeito|sensacional|excelente|isso a[íi]|mandou bem|agora (sim|acertou|ficou)|voc[êe] acertou", re.I)
CRITICA = re.compile(r"ficou (errad|ruim|feio|horr|estranh|polu|esquisit)|n[ãa]o gostei|horr[íi]vel|errad[oa]|desconfigur|polu[íi]d|feio|n[ãa]o ficou|n[ãa]o era (pra|para)|tira (isso|esse|essa)|corrig|corre[çc][ãaõo]|arruma|refaz", re.I)
comentarios = []
anterior = {}
for sid, role, content, ts, stitle in db.execute("SELECT m.session_id, m.role, m.content, m.created_at, s.title FROM messages m JOIN sessions s ON s.id = m.session_id WHERE m.created_at >= ? AND m.status = 'done' ORDER BY m.session_id, m.created_at", (desde,)):
    if role == "zeus": anterior[sid] = content or ""; continue
    prev = anterior.pop(sid, "")
    artes = re.findall(r"/api/design/arquivo/([\w-]+)/([^)\s?]+)", prev)
    txt = re.sub(r"\s+", " ", content or "").strip()
    if not artes or not txt: continue
    e, c = bool(ELOGIO.search(txt)), bool(CRITICA.search(txt))
    if not (e or c): continue
    if not any(ok(cid) for cid, _ in artes): continue
    tipo = "💬👍 elogio" if e and not c else "💬👎 crítica/correção" if c and not e else "💬± elogio + correção"
    arqs = [f"/opt/jeff-apps/jeff-central/data/social/_criacoes/{cid}/{n}" for cid, n in artes]
    marca = cria.get(artes[0][0], ("?", ""))[0]
    comentarios.append((ts, tipo, marca, stitle or "", txt[:600], [a for a in arqs if os.path.exists(a)][:4], len(arqs)))

if not linhas and not comentarios:
    print("Nenhum feedback de arte" + (f" pra '{filtro}'" if filtro else "") + f" nos últimos {dias} dias."); sys.exit()
pos = sum(1 for l in linhas if l[1] == "👍"); neg = len(linhas) - pos
print(f"Feedback de artes ({dias} dias){' · ' + filtro if filtro else ''}: {pos} 👍 · {neg} 👎\n")
# /api/design/arquivo/<criacao>/<nome>.png -> arquivo local, pra abrir com Read e ver O QUE foi aprovado/reprovado
import os
local = lambda arq: (lambda m: f"/opt/jeff-apps/jeff-central/data/social/_criacoes/{m.group(1)}/{m.group(2)}" if m else "")(re.match(r"/api/design/arquivo/([\w-]+)/([^/?]+)", arq or ""))
for up, v, cid, onde, nota, usr, arq in sorted(linhas, reverse=True)[:60]:
    marca, ideia = cria.get(cid, ("?", ""))
    f = local(arq)
    print(f"{v} {quando(up)} · {marca} · {cid} {onde} · {ideia}" + (f"\n     arquivo: {f}" if f and os.path.exists(f) else "") + (f"\n     \"{nota}\"" if nota else ""))
if comentarios:
    print(f"\nComentários escritos no chat sobre artes ({len(comentarios)}): o que a pessoa disse logo depois de receber as artes")
    for ts, tipo, marca, stitle, txt, arqs, n in sorted(comentarios, reverse=True)[:25]:
        print(f"{tipo} {quando(ts)} · {marca} · conversa \"{stitle}\"\n     \"{txt}\"")
        if arqs: print(f"     artes da entrega ({n}): " + "  ".join(arqs) + (" ..." if n > len(arqs) else ""))
print("\nUse: ABRA com Read 2 ou 3 arquivos 👍 mais recentes antes de criar e repita a receita deles (estrutura da referência, foto real em cena nova, cor, densidade de texto, motor).")
print("👍 = sinal de que o caminho está certo. 👎 nunca se repete, e o comentário do 👎 é regra pra próxima arte.")
PY
