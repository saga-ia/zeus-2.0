#!/bin/bash
# Coleta posts (imagem, carrossel e vídeo) de um perfil público pra Nina analisar.
# Usa o apify.sh (já configurado). Baixa capa + primeiras lâminas pra Nina LER a imagem.
# Complementa o Creator Lab, que só pega Reels com fala.
#
# Uso: social-posts.sh <perfil> [limite=30] [pasta_saida] [laminas_por_carrossel=3]
# Saída: <pasta>/posts.json (normalizado + mediana + rank), <pasta>/img/<shortcode>-N.jpg, <pasta>/raw.json
# Custo: centavos no Apify (30 posts ≈ 1 run do instagram-scraper).
set -u
PERFIL="${1:?uso: social-posts.sh <perfil> [limite] [pasta] [laminas]}"; PERFIL="${PERFIL#@}"
LIMIT="${2:-30}"
OUT="${3:-/tmp/social-posts/$PERFIL-$(date +%Y%m%d)}"
SLIDES="${4:-3}"
mkdir -p "$OUT/img"

/opt/jeff-worker/scripts/apify.sh posts "$PERFIL" "$LIMIT" > "$OUT/raw.json"
jq -e 'type=="array" and length>0' "$OUT/raw.json" >/dev/null 2>&1 || { echo "{\"error\":\"coleta vazia ou falhou\",\"raw\":\"$OUT/raw.json\"}"; head -c 400 "$OUT/raw.json"; exit 2; }

python3 - "$OUT" "$SLIDES" <<'PY'
import json, sys, statistics, urllib.request, os
from datetime import datetime, timedelta, timezone
out, slides = sys.argv[1], int(sys.argv[2])
raw = json.load(open(f"{out}/raw.json"))
agora = datetime.now(timezone.utc)
TIPO = {"Image": "imagem", "Sidecar": "carrossel", "Video": "video"}

def baixar(url, dest):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r, open(dest, "wb") as f: f.write(r.read())
        return dest
    except Exception:
        return None

posts = []
for p in raw:
    if not p.get("shortCode"): continue
    ts = p.get("timestamp") or ""
    try: dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError: dt = None
    tipo = TIPO.get(p.get("type"), p.get("type"))
    if p.get("productType") == "clips": tipo = "reels"
    urls = []
    if p.get("type") == "Sidecar":
        urls = [c.get("displayUrl") for c in (p.get("childPosts") or []) if c.get("displayUrl")] or (p.get("images") or [])
    if not urls and p.get("displayUrl"): urls = [p["displayUrl"]]
    imgs = [x for x in (baixar(u, f"{out}/img/{p['shortCode']}-{i+1}.jpg") for i, u in enumerate(urls[:slides])) if x]
    cap = p.get("caption") or ""
    posts.append({
        "shortcode": p["shortCode"], "link": p.get("url"), "tipo": tipo,
        "data_brt": (dt - timedelta(hours=3)).strftime("%d/%m/%Y %H:%M") if dt else ts,
        "dias": (agora - dt).days if dt else None,
        "curtidas": p.get("likesCount"), "comentarios": p.get("commentsCount"),
        "views": p.get("videoViewCount") or p.get("videoPlayCount"),
        "laminas": len(p.get("childPosts") or []) or 1,
        "primeira_linha": cap.strip().split("\n")[0][:160],
        "legenda": cap, "hashtags": p.get("hashtags") or [], "alt": p.get("alt"),
        "imagens": imgs, "patrocinado": bool(p.get("paidPartnership")),
    })

# Comparação: só posts com 3+ dias (número ainda subindo nos recentes)
base = [p for p in posts if (p["dias"] or 0) >= 3]
def med(k, lst):
    v = [p[k] for p in lst if isinstance(p.get(k), (int, float)) and p[k] >= 0]
    return round(statistics.median(v), 1) if v else None
mediana = {"curtidas": med("curtidas", base), "comentarios": med("comentarios", base), "n": len(base)}
por_tipo = {t: {"n": len([p for p in base if p["tipo"] == t]), "curtidas": med("curtidas", [p for p in base if p["tipo"] == t]), "comentarios": med("comentarios", [p for p in base if p["tipo"] == t])} for t in sorted({p["tipo"] for p in base})}
for p in posts:
    p["vs_mediana"] = round(p["curtidas"] / mediana["curtidas"], 2) if mediana["curtidas"] and isinstance(p.get("curtidas"), (int, float)) and p["curtidas"] >= 0 else None
    p["recente"] = (p["dias"] or 0) < 3
for i, p in enumerate(sorted(posts, key=lambda x: ((x["curtidas"] or 0) + 3 * (x["comentarios"] or 0)), reverse=True), 1): p["rank"] = i

avisos = []
zeros = [p for p in posts if (p.get("curtidas") or 0) <= 0]
if len(zeros) > len(posts) / 2: avisos.append(f"{len(zeros)} de {len(posts)} posts com 0 curtida: curtidas ocultas ou perfil com pouca interação. Comparar por comentários e ler o conteúdo; pro próprio perfil, usar social-metrics.sh (dados reais da API)")
if mediana["n"] < 8: avisos.append(f"amostra pequena ({mediana['n']} posts com 3+ dias): conclusão fraca")
if any(p["patrocinado"] for p in posts): avisos.append("tem post patrocinado/parceria: alcance pago distorce a comparação")

res = {"perfil": raw[0].get("ownerUsername"), "coletados": len(posts), "mediana": mediana, "por_tipo": por_tipo, "avisos": avisos, "posts": posts}
json.dump(res, open(f"{out}/posts.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in res.items() if k != "posts"}, ensure_ascii=False, indent=1))
print(f"\nposts.json: {out}/posts.json | imagens: {out}/img/ ({sum(len(p['imagens']) for p in posts)} arquivos)")
print("top 5 (rank):")
for p in sorted(posts, key=lambda x: x["rank"])[:5]: print(f"  #{p['rank']} {p['tipo']:9} {p['data_brt']} curt={p['curtidas']} com={p['comentarios']} | {p['primeira_linha'][:70]}")
PY
