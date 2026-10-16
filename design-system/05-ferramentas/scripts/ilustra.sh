#!/bin/bash
# Gera uma ILUSTRAÇÃO/FOTO sem texto pra compor arte híbrida (IA faz a imagem, HTML faz o texto).
# Uso: ilustra.sh <google|openai> "<descrição da imagem>" <saida.png> [paisagem|retrato|quadrado] [ref1.png ref2.png ...]
#   google = Nano Banana Pro (gemini-3-pro-image, ~US$ 0,13)   openai = GPT Image 2.5 Flare high (~US$ 0,04)
#   refs (opcional, só google): imagens de referência de estilo (até 3).
# Chaves no app_settings: gemini_api_key / openai_api_key. O script já pede "sem texto, sem letras, sem logos".
set -u
MOTOR="${1:?uso: ilustra.sh <google|openai> \"descricao\" saida.png [paisagem|retrato|quadrado] [refs...]}"
DESC="${2:?descricao}"; OUT="${3:?saida.png}"; FMT="${4:-paisagem}"; shift 4 2>/dev/null || shift $#
DB=/opt/jeff-worker/data/worker.db
python3 - "$MOTOR" "$DESC" "$OUT" "$FMT" "$DB" "$@" <<'PY'
import sys, json, base64, sqlite3, urllib.request, mimetypes
motor, desc, out, fmt, db, *refs = sys.argv[1:]
key = lambda k: (sqlite3.connect(f"file:{db}?mode=ro", uri=True).execute("SELECT value FROM app_settings WHERE key=?", (k,)).fetchone() or [""])[0]
import importlib.util as _iu
def gasto(*a):
    try:
        _s = _iu.spec_from_file_location("g", "/opt/jeff-worker/scripts/gasto-ia-imagem.py"); _m = _iu.module_from_spec(_s); _s.loader.exec_module(_m); _m.registrar(*a)
    except Exception as _e: print(f"(gasto não registrado: {_e})", file=sys.stderr)
prompt = desc.rstrip(". ") + ". Absolutely no text, no letters, no numbers, no logos, no watermark."
def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=240) as r: return json.load(r)
try:
    if motor == "google":
        aspecto = {"paisagem": "16:10", "retrato": "4:5", "quadrado": "1:1"}.get(fmt, "16:10")
        parts = [{"text": f"{prompt} Aspect ratio {aspecto}."}]
        for r in refs[:3]:
            parts.append({"inlineData": {"mimeType": mimetypes.guess_type(r)[0] or "image/png", "data": base64.b64encode(open(r, "rb").read()).decode()}})
            parts[0]["text"] += " Use the attached image(s) only as STYLE reference (lighting, mood, rendering), never copy text."
        d = post(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key={key('gemini_api_key')}",
                 {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["IMAGE"]}}, {})
        img = next(p["inlineData"]["data"] for p in d["candidates"][0]["content"]["parts"] if "inlineData" in p)
        gasto("ilustra", "gemini", "gemini-3-pro-image", "gerar", d.get("usageMetadata"), None, out)
    elif motor == "openai":
        size = {"paisagem": "1536x1024", "retrato": "1024x1536", "quadrado": "1024x1024"}.get(fmt, "1536x1024")
        d = post("https://api.openai.com/v1/images/generations", {"model": "gpt-image-2.5-flare", "quality": "high", "size": size, "prompt": prompt},
                 {"Authorization": "Bearer " + key("openai_api_key")})
        img = d["data"][0]["b64_json"]
        gasto("ilustra", "openai", "gpt-image-2.5-flare", "gerar", d.get("usage"), "high", out)
    else:
        sys.exit("motor deve ser google ou openai")
    open(out, "wb").write(base64.b64decode(img)); print(f"ok: {out} ({motor})")
except urllib.error.HTTPError as e:
    msg = e.read().decode()[:300]
    if motor == "openai":
        print(f"OpenAI falhou ({e.code}: {msg[:120]}). Usando Google no lugar.", file=sys.stderr)
        import subprocess; r = subprocess.run([sys.argv[0] if False else "/opt/jeff-worker/scripts/ilustra.sh", "google", desc, out, fmt] + refs)
        sys.exit(r.returncode)
    sys.exit(f"erro {e.code}: {msg}")
PY
