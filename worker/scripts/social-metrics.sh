#!/bin/bash
# Métricas de conteúdo pra Nina (social media). Só leitura.
# Calcula salvos/mil e compartilhamentos/mil por post + MEDIANA do período.
# Regra: mediana, nunca média; sempre por mil alcançados, nunca absoluto.
#
# Uso:
#   social-metrics.sh ig [limit=12]      # puxa os últimos N posts do @jeffhenrike via instagram.sh
#   social-metrics.sh csv <arquivo.csv>  # cliente: CSV colado à mão
#
# CSV do cliente (cabeçalho obrigatório, separador vírgula):
#   data,tipo,tema,alcance,salvos,compartilhamentos,seguidores
#   2026-10-01,carrossel,erro comum de X,12000,340,95,41
#   (seguidores pode ficar vazio)
#
# Saída: JSON { posts:[...], mediana:{...}, n }
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
IG="$DIR/instagram.sh"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

cmd="${1:-}"
case "$cmd" in
  ig)
    LIMIT="${2:-12}"
    POSTS=$("$IG" posts "$LIMIT")
    echo "$POSTS" | jq -e '.data' >/dev/null 2>&1 || { echo "$POSTS"; exit 2; }
    echo "$POSTS" | jq -c '.data[]' | while read -r p; do
      MID=$(echo "$p" | jq -r '.id')
      INS=$("$IG" post-insights "$MID")
      # follows/profile_visits não existem pra Reels; erro aqui é ignorado
      EXTRA=$("$IG" raw GET "/$MID/insights?metric=follows,profile_visits" 2>/dev/null)
      echo "$EXTRA" | jq -e . >/dev/null 2>&1 || EXTRA='{}'
      echo "$INS" | jq -e . >/dev/null 2>&1 || INS='{}'
      jq -cn --argjson p "$p" --argjson i "$INS" --argjson e "$EXTRA" '{p:$p, i:$i, e:$e}'
    done > "$TMP"
    MODE=ig
    ;;
  csv)
    FILE="${2:?usage: social-metrics.sh csv <arquivo.csv>}"
    cp "$FILE" "$TMP"
    MODE=csv
    ;;
  *)
    sed -n '2,15p' "$0"; exit 1 ;;
esac

python3 - "$MODE" "$TMP" <<'PY'
import sys, json, csv, statistics
from datetime import datetime, timedelta

mode, path = sys.argv[1], sys.argv[2]

def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None

def per1k(x, reach):
    return round(x * 1000 / reach, 2) if x is not None and reach else None

posts = []
if mode == "ig":
    for line in open(path):
        line = line.strip()
        if not line: continue
        r = json.loads(line)
        p, ins, ex = r["p"], r.get("i", {}), r.get("e", {})
        m = {d["name"]: d["values"][0]["value"] for d in ins.get("data", []) if d.get("values")}
        m.update({d["name"]: d["values"][0]["value"] for d in ex.get("data", []) if d.get("values")})
        ts = p.get("timestamp", "")
        try:
            brt = (datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S") - timedelta(hours=3)).strftime("%d/%m %H:%M BRT")
        except ValueError:
            brt = ts
        posts.append({
            "data": brt, "tipo": p.get("media_type"), "link": p.get("permalink"),
            "tema": (p.get("caption") or "").split("\n")[0][:90],
            "alcance": num(m.get("reach")), "salvos": num(m.get("saved")),
            "compartilhamentos": num(m.get("shares")), "seguidores": num(m.get("follows")),
        })
else:
    for row in csv.DictReader(open(path, encoding="utf-8-sig")):
        posts.append({
            "data": row.get("data"), "tipo": row.get("tipo"), "link": None, "tema": row.get("tema"),
            "alcance": num(row.get("alcance")), "salvos": num(row.get("salvos")),
            "compartilhamentos": num(row.get("compartilhamentos")), "seguidores": num(row.get("seguidores")),
        })

for p in posts:
    p["salvos_mil"] = per1k(p["salvos"], p["alcance"])
    p["compart_mil"] = per1k(p["compartilhamentos"], p["alcance"])
    p["seguidores_mil"] = per1k(p["seguidores"], p["alcance"])

def med(k):
    vals = [p[k] for p in posts if p.get(k) is not None]
    return round(statistics.median(vals), 2) if vals else None

mediana = {k: med(k) for k in ("alcance", "salvos_mil", "compart_mil", "seguidores_mil")}
for p in posts:
    p["vs_mediana"] = {
        k: (None if p[k] is None or not mediana[k] else round(p[k] / mediana[k], 2))
        for k in ("salvos_mil", "compart_mil", "seguidores_mil")
    }

# Ranking por salvos/mil + compart/mil: fallback quando a mediana é 0 (perfil com pouca interação)
for p in posts:
    p["score_mil"] = round((p["salvos_mil"] or 0) + (p["compart_mil"] or 0), 2)
for i, p in enumerate(sorted(posts, key=lambda x: x["score_mil"], reverse=True), 1):
    p["rank"] = i

avisos = []
if len(posts) < 5:
    avisos.append("amostra pequena (<5 posts): conclusão fraca")
zeradas = [k for k in ("salvos_mil", "compart_mil", "seguidores_mil") if mediana[k] == 0]
if zeradas:
    avisos.append("mediana zero em " + ", ".join(zeradas) + ": vs_mediana não se aplica, usar rank/score_mil")

print(json.dumps({"n": len(posts), "mediana": mediana, "avisos": avisos, "posts": posts}, ensure_ascii=False, indent=1))
PY
