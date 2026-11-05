#!/bin/bash
# EDITA uma imagem existente com IA (efeitos de edição): trocar fundo, colocar a pessoa num cenário, luz/cor de cinema,
# estilo (3D, ilustração, preto e branco, neon), retoque, juntar 2+ imagens numa composição, remover objeto, expandir.
# Uso: editar-imagem.sh <google|openai> "<o que mudar>" <saida.png> <imagem1> [imagem2 ...] [--formato retrato|paisagem|quadrado]
#   google = Nano Banana Pro (melhor pra manter o ROSTO idêntico; ~US$ 0,13)
#   openai = GPT Image 2.5 Flare high (bom em estilo/cena; ~US$ 0,04)
# Sempre pede: manter o rosto/identidade da pessoa e não escrever texto (texto vai no HTML).
set -u
MOTOR="${1:?uso: editar-imagem.sh <google|openai> \"instrucao\" saida.png img1 [img2...] [--formato X]}"; INSTR="${2:?instrucao}"; OUT="${3:?saida.png}"; shift 3
FMT="retrato"; IMGS=()
while [ $# -gt 0 ]; do case "$1" in --formato) FMT="$2"; shift 2;; *) IMGS+=("$1"); shift;; esac; done
[ ${#IMGS[@]} -eq 0 ] && { echo "falta a imagem de entrada"; exit 1; }
DB=/opt/jeff-worker/data/worker.db
KEY() { sqlite3 "file:$DB?mode=ro" "SELECT value FROM app_settings WHERE key='$1'"; }
PROMPT="$INSTR. Keep the person's face, identity, skin tone and features exactly the same as in the input photo. Photorealistic, high quality. Do not add any text, letters, numbers or logos."
if [ "$MOTOR" = "openai" ]; then
  SIZE=$(case "$FMT" in paisagem) echo 1536x1024;; quadrado) echo 1024x1024;; *) echo 1024x1536;; esac)
  ARGS=(); for i in "${IMGS[@]}"; do ARGS+=(-F "image[]=@$i"); done
  curl -s -m 300 https://api.openai.com/v1/images/edits -H "Authorization: Bearer $(KEY openai_api_key)" \
    -F model=gpt-image-2.5-flare -F quality=high -F size=$SIZE -F input_fidelity=high -F "prompt=$PROMPT" "${ARGS[@]}" \
  | python3 -c "
import json,sys,base64
d=json.load(sys.stdin); e=d.get('error')
if e: sys.exit('erro: '+e.get('message',''))
open('$OUT','wb').write(base64.b64decode(d['data'][0]['b64_json'])); print('ok: $OUT (openai)')
import subprocess; subprocess.run(['/opt/jeff-worker/scripts/gasto-ia-imagem.py','registrar','editar-imagem','openai','gpt-image-2.5-flare','editar',json.dumps(d.get('usage') or {}),'high'],stdout=subprocess.DEVNULL)
"
elif [ "$MOTOR" = "google" ]; then
  python3 - "$OUT" "$PROMPT" "$FMT" "$(KEY gemini_api_key)" "${IMGS[@]}" <<'PY'
import sys, json, base64, mimetypes, urllib.request
out, prompt, fmt, key, *imgs = sys.argv[1:]
import importlib.util as _iu
def gasto(*a):
    try:
        _s = _iu.spec_from_file_location("g", "/opt/jeff-worker/scripts/gasto-ia-imagem.py"); _m = _iu.module_from_spec(_s); _s.loader.exec_module(_m); _m.registrar(*a)
    except Exception as _e: print(f"(gasto não registrado: {_e})", file=sys.stderr)
asp = {"paisagem": "16:10", "quadrado": "1:1"}.get(fmt, "4:5")
parts = [{"text": f"{prompt} Output aspect ratio {asp}."}] + [{"inlineData": {"mimeType": mimetypes.guess_type(i)[0] or "image/png", "data": base64.b64encode(open(i, "rb").read()).decode()}} for i in imgs]
req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key={key}",
    data=json.dumps({"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["IMAGE"]}}).encode(), headers={"Content-Type": "application/json"})
try:
    d = json.load(urllib.request.urlopen(req, timeout=300))
    img = next(p["inlineData"]["data"] for p in d["candidates"][0]["content"]["parts"] if "inlineData" in p)
    gasto("editar-imagem", "gemini", "gemini-3-pro-image", "editar", d.get("usageMetadata"), None, out)
    open(out, "wb").write(base64.b64decode(img)); print(f"ok: {out} (google)")
except urllib.error.HTTPError as e: sys.exit(f"erro {e.code}: {e.read().decode()[:300]}")
except StopIteration: sys.exit("erro: a IA não devolveu imagem (pode ter recusado o pedido)")
PY
else echo "motor deve ser google ou openai"; exit 1; fi
