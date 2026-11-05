#!/usr/bin/env python3
"""Etapa VISUAL da análise de Reels (complementa o Creator Lab: transcrição Groq + rótulos Jev).
Pra cada Reel de uma análise do Creator Lab: baixa o vídeo, tira os quadros do GANCHO (0,3 / 1 / 2 / 3 s) e 6 do MIOLO,
conta os cortes de cena (cortes por minuto), mede a fala (palavras por minuto, o que foi dito nos 3 primeiros segundos)
e monta uma folha por Reel pra Nina/Zeus ASSISTIR com Read (formato, cenário, pessoas, texto na tela, legenda, b-roll).
Depois junta tudo com plays e rótulos do Jev num resumo do perfil (mediana de plays por ritmo, duração, formato).

Uso: reels-visual.py <run_id> [max_reels=20]
Saída: /opt/jeff-worker/projetos/nina/_reels/<perfil>-<run8>/{resumo.md, resumo.json, <id>/folha.jpg, <id>/meta.json}
Custo: zero (vídeo vem do link que o Apify já trouxe; link do Instagram expira em alguns dias: rodar logo depois do analyze).
"""
import json, os, re, subprocess, sys, tempfile, urllib.request, statistics
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont

RUN = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
MAX = int(sys.argv[2]) if len(sys.argv) > 2 else 20
tmpd = tempfile.mkdtemp(prefix="reels-visual-")
exp = os.path.join(tmpd, "run.json")
subprocess.run(["/opt/jeff-worker/scripts/creator-lab.sh", "export", RUN, exp], check=True, stdout=subprocess.DEVNULL)
run = json.load(open(exp))
OUT = f"/opt/jeff-worker/projetos/nina/_reels/{run['creator']}-{RUN[:8]}"
os.makedirs(OUT, exist_ok=True)
try: FONTE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
except Exception: FONTE = ImageFont.load_default()


def sh(*a, **k): return subprocess.run(a, capture_output=True, text=True, timeout=k.get("t", 240))


def um(p):
    rid, d = p["id"], os.path.join(OUT, p["id"])
    os.makedirs(d, exist_ok=True)
    mp4 = os.path.join(tmpd, rid + ".mp4")
    try:
        req = urllib.request.Request(p["videoUrl"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as r, open(mp4, "wb") as f: f.write(r.read())
    except Exception as e:
        return {"id": rid, "erro": f"vídeo não baixou ({e}); link expirado? rode de novo logo após o analyze"}
    try:
        dur = float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4).stdout.strip() or p.get("duration") or 0)
        cenas = sh("ffmpeg", "-hide_banner", "-i", mp4, "-vf", "scale=320:-2,select='gt(scene,0.30)',showinfo", "-an", "-f", "null", "-", t=300).stderr
        cortes = [float(x) for x in re.findall(r"pts_time:([\d.]+)", cenas)]
        tempos = [0.3, 1.0, 2.0, 3.0] + [4 + (dur - 5) * i / 5 for i in range(6)] if dur > 6 else [dur * i / 10 for i in range(10)]
        quadros = []
        for k, t in enumerate(tempos):
            q = os.path.join(tmpd, f"{rid}-{k}.jpg")
            sh("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{max(0, min(t, dur - 0.1)):.2f}", "-i", mp4, "-frames:v", "1", "-vf", "scale=270:-2", q)
            if os.path.exists(q): quadros.append((t, q))
        W, H = 270, 480
        folha = Image.new("RGB", (6 * W + 5 * 8, 2 * (H + 34) + 60), "#16161a"); dr = ImageDraw.Draw(folha)
        dr.text((6, 4), "GANCHO (0 a 3 s)", fill="#ffcc33", font=FONTE); dr.text((6, H + 34 + 34), "MIOLO", fill="#88ccff", font=FONTE)
        for k, (t, q) in enumerate(quadros):
            im = Image.open(q).convert("RGB"); im.thumbnail((W, H))
            col, lin = (k, 0) if k < 4 else (k - 4, 1)
            x, y = col * (W + 8), 30 + lin * (H + 64)
            folha.paste(im, (x, y)); dr.text((x + 4, y + H + 4), f"{t:.1f}s", fill="#ffffff", font=FONTE)
        folha.save(os.path.join(d, "folha.jpg"), quality=84)
        tr = p.get("transcript") or {}
        texto = (tr.get("text") or "").strip()
        segs = tr.get("segments") or []
        abertura = " ".join(s.get("text", "").strip() for s in segs if float(s.get("start", 99)) < 3.0) or " ".join(texto.split()[:10])
        lab = ((p.get("analysis") or {}).get("labels") or {})
        meta = {"id": rid, "url": p["url"], "plays": p.get("plays"), "curtidas": p.get("likes"), "comentarios": p.get("comments"), "data": (p.get("publishedAt") or "")[:10],
                "duracao_s": round(dur, 1), "cortes": len(cortes), "cortes_por_min": round(len(cortes) / dur * 60, 1) if dur else None,
                "primeiro_corte_s": round(cortes[0], 1) if cortes else None,
                "palavras_por_min": round(len(texto.split()) / dur * 60) if dur and texto else 0, "fala": p.get("status") != "no_speech" and bool(texto),
                "abertura_falada": abertura[:200], "jev": {k: (v or {}).get("value") for k, v in lab.items() if isinstance(v, dict)},
                "legenda": (p.get("caption") or "")[:300], "folha": os.path.join(d, "folha.jpg")}
        json.dump(meta, open(os.path.join(d, "meta.json"), "w"), ensure_ascii=False, indent=1)
        return meta
    finally:
        for f in os.listdir(tmpd):
            if f.startswith(rid): os.remove(os.path.join(tmpd, f))


posts = [p for p in run["posts"] if p.get("videoUrl")][:MAX]
with ThreadPoolExecutor(3) as ex: res = list(ex.map(um, posts))
ok = [r for r in res if not r.get("erro")]
num = lambda v: float(v) if v not in (None, "", "None") else None
pl = [num(r["plays"]) for r in ok if num(r["plays"])]
med = statistics.median(pl) if pl else None
for r in ok: r["vs_mediana"] = round(num(r["plays"]) / med, 2) if med and num(r["plays"]) else None


def grupo(nome, chave):
    g = {}
    for r in ok:
        if r["vs_mediana"] is not None: g.setdefault(chave(r), []).append(r["vs_mediana"])
    return [f"| {nome}: {k} | {len(v)} | {statistics.median(v):.2f}x |" for k, v in sorted(g.items(), key=lambda x: -statistics.median(x[1]))]


rit = lambda r: "rápido (12+ cortes/min)" if (r["cortes_por_min"] or 0) >= 12 else "médio (5 a 12)" if (r["cortes_por_min"] or 0) >= 5 else "plano contínuo (<5)"
dura = lambda r: "até 30 s" if r["duracao_s"] <= 30 else "30 a 60 s" if r["duracao_s"] <= 60 else "mais de 60 s"
fala = lambda r: "rápida (170+ ppm)" if r["palavras_por_min"] >= 170 else "normal (110 a 170)" if r["palavras_por_min"] >= 110 else "lenta ou sem fala"
md = [f"# Reels de @{run['creator']} · visual + fala (run {RUN[:8]})", "",
      f"{len(ok)} Reels assistidos de {len(res)}; mediana de plays {med:,.0f}".replace(",", ".") if med else f"{len(ok)} Reels", "",
      "Grupos com menos de 5 Reels são pista, não conclusão.", "", "| Grupo | n | plays vs mediana |", "|---|---|---|"]
md += grupo("ritmo de cortes", rit) + grupo("duração", dura) + grupo("fala", fala) + grupo("estrutura (Jev)", lambda r: r["jev"].get("structure") or "?")
md += ["", "| Reel | plays | vs med | dur | cortes/min | 1º corte | ppm | abertura falada | Jev (abertura / estrutura / CTA) | folha |", "|---|---|---|---|---|---|---|---|---|---|"]
for r in sorted(ok, key=lambda r: -(r["vs_mediana"] or 0)):
    md.append(f"| [{r['id']}]({r['url']}) | {r['plays']} | {r['vs_mediana']}x | {r['duracao_s']}s | {r['cortes_por_min']} | {str(r['primeiro_corte_s']) + 's' if r['primeiro_corte_s'] is not None else 'sem corte'} | {r['palavras_por_min']} | {r['abertura_falada'][:80]} | {r['jev'].get('opening')} / {r['jev'].get('structure')} / {r['jev'].get('cta')} | `{r['folha']}` |")
for r in res:
    if r.get("erro"): md.append(f"\nNão assistido: {r['id']}: {r['erro']}")
open(os.path.join(OUT, "resumo.md"), "w").write("\n".join(md) + "\n")
json.dump(res, open(os.path.join(OUT, "resumo.json"), "w"), ensure_ascii=False, indent=1)
os.rmdir(tmpd) if not os.listdir(tmpd) else None
print(f"{len(ok)}/{len(res)} Reels assistidos · {OUT}/resumo.md")
