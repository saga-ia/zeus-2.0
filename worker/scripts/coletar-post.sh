#!/bin/bash
# Coleta posts de imagem/carrossel do Instagram (links públicos) pra análise de design.
# Baixa TODAS as lâminas + legenda + números e monta uma folha de contato por post (todas as lâminas lado a lado).
# Uso: coletar-post.sh <url1> [url2 ...]      (ou --raw arquivo.json pra reaproveitar uma coleta do Apify)
# Saída: /opt/jeff-worker/projetos/design-modelos/estruturas/_coleta/<shortcode>/{01.jpg..NN.jpg, folha.jpg, post.json}
# Custo: centavos de Apify (actor apify~instagram-scraper).
set -u
BASE=/opt/jeff-worker/projetos/design-modelos/estruturas/_coleta; mkdir -p "$BASE"
if [ "${1:-}" = "--raw" ]; then RAW="$2"; else
  [ $# -eq 0 ] && { sed -n 2,6p "$0"; exit 1; }
  RAW=$(mktemp); URLS=$(python3 -c "import json,sys,re; print(json.dumps([re.sub(r'\?.*','',u).rstrip('/')+'/' for u in sys.argv[1:]]))" "$@")
  /opt/jeff-worker/scripts/apify.sh actor "apify~instagram-scraper" "{\"directUrls\":$URLS,\"resultsType\":\"posts\",\"resultsLimit\":1,\"addParentData\":false}" > "$RAW"
fi
python3 - "$RAW" "$BASE" <<'PY'
import json, sys, os, urllib.request
from PIL import Image, ImageDraw
raw, base = sys.argv[1], sys.argv[2]
dados = json.load(open(raw))
if not isinstance(dados, list): sys.exit(f"coleta falhou: {str(dados)[:300]}")
def baixar(u, dest):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f: f.write(r.read())
for p in dados:
    sc = p.get("shortCode");
    if not sc: continue
    d = os.path.join(base, sc); os.makedirs(d, exist_ok=True)
    urls = [c.get("displayUrl") for c in (p.get("childPosts") or []) if c.get("displayUrl")] or p.get("images") or [p.get("displayUrl")]
    arqs = []
    for i, u in enumerate([u for u in urls if u], 1):
        dest = os.path.join(d, f"{i:02d}.jpg")
        try: baixar(u, dest); arqs.append(dest)
        except Exception as e: print(f"  falhou lâmina {i} de {sc}: {e}")
    json.dump({"shortcode": sc, "url": p.get("url"), "perfil": p.get("ownerUsername"), "tipo": p.get("type"), "laminas": len(arqs),
               "curtidas": p.get("likesCount"), "comentarios": p.get("commentsCount"), "legenda": p.get("caption"), "data": p.get("timestamp")},
              open(os.path.join(d, "post.json"), "w"), ensure_ascii=False, indent=1)
    if arqs:  # folha de contato: todas as lâminas numeradas, 5 por linha
        W, H, cols = 300, 375, 5; rows = (len(arqs) + cols - 1) // cols
        folha = Image.new("RGB", (cols * W + (cols - 1) * 8, rows * (H + 26)), "#1b1b1f"); dr = ImageDraw.Draw(folha)
        for k, a in enumerate(arqs):
            im = Image.open(a).convert("RGB"); im.thumbnail((W, H)); x = (k % cols) * (W + 8); y = (k // cols) * (H + 26)
            folha.paste(im, (x, y)); dr.text((x + 4, y + H + 6), f"lâmina {k+1}", fill="#ffffff")
        folha.save(os.path.join(d, "folha.jpg"), quality=86)
    print(f"{sc} | @{p.get('ownerUsername')} | {len(arqs)} lâminas | {d}/folha.jpg")
PY
