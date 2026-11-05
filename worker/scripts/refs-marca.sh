#!/bin/bash
# Referências de design que o CLIENTE gostou (no máximo 5 por marca): base dos próximos designs dessa marca.
# Guarda em /opt/jeff-worker/projetos/design-modelos/marcas/<marcaId>/ (refs.json + uma pasta por referência + gosto.md escrito pelo Zeus)
# e copia a folha de cada uma pra Central mostrar no chat: ![r1](/api/design/arquivo/refs-<marcaId>/v1-s1-<id>.jpg)
# Uso:
#   refs-marca.sh <marcaId>                              lista as referências salvas (e se já tem gosto.md)
#   refs-marca.sh <marcaId> add <link|imagem> [...]      adiciona (link do Instagram ou print/imagem do chat); recusa passar de 5
#   refs-marca.sh <marcaId> remover <n>                  remove a referência n (1 a 5) pra abrir vaga
# marcaId: rode /opt/jeff-apps/jeff-central/tools/marca listar
set -u
MAX=5
M="${1:?uso: refs-marca.sh <marcaId> [add <links/prints>|remover <n>]}"; ACAO="${2:-listar}"; shift 2 2>/dev/null || shift $#
[[ "$M" =~ ^[A-Za-z0-9_-]{6,40}$ ]] || { echo "marcaId inválido: $M"; exit 1; }
BASE=/opt/jeff-worker/projetos/design-modelos/marcas/$M; COLETA=/opt/jeff-worker/projetos/design-modelos/estruturas/_coleta
CENTRAL=/opt/jeff-apps/jeff-central/data/social/_criacoes/refs-$M
mkdir -p "$BASE"; [ -f "$BASE/refs.json" ] || echo '[]' > "$BASE/refs.json"

case "$ACAO" in
add)
  [ $# -eq 0 ] && { echo "faltam os links ou prints"; exit 1; }
  ATUAL=$(python3 -c "import json;print(len(json.load(open('$BASE/refs.json'))))")
  if [ $((ATUAL + $#)) -gt $MAX ]; then
    echo "LIMITE: a marca já tem $ATUAL referência(s) e o máximo é $MAX. Peça pro usuário escolher qual remover (refs-marca.sh $M remover <n>) ou mandar só $((MAX - ATUAL))."; exit 2; fi
  LINKS=(); for x in "$@"; do  # só coleta o que ainda não foi baixado (economiza Apify)
    [[ "$x" =~ instagram\.com/(p|reel)/([A-Za-z0-9_-]+) ]] && [ ! -f "$COLETA/${BASH_REMATCH[2]}/folha.jpg" ] && LINKS+=("$x"); done
  [ ${#LINKS[@]} -gt 0 ] && /opt/jeff-worker/scripts/coletar-post.sh "${LINKS[@]}" | grep -v "^$"
  python3 - "$BASE" "$COLETA" "$@" <<'PY'
import json, os, re, sys, shutil, time
from PIL import Image
base, coleta, itens = sys.argv[1], sys.argv[2], sys.argv[3:]
refs = json.load(open(f"{base}/refs.json"))
for x in itens:
    m = re.search(r"instagram\.com/(?:p|reel)/([\w-]+)", x)
    if m:
        sc = m.group(1); src = f"{coleta}/{sc}"
        if not os.path.exists(f"{src}/folha.jpg"): print(f"falhou a coleta de {x}"); continue
        pj = json.load(open(f"{src}/post.json"))
        ref = {"id": sc, "tipo": "link", "origem": x.split("?")[0], "perfil": pj.get("perfil"), "laminas": pj.get("laminas"), "curtidas": pj.get("curtidas"), "pasta": src}
        folha = f"{src}/folha.jpg"
    elif os.path.isfile(x):
        sc = "print" + str(int(time.time() * 1000))[-8:]; d = f"{base}/{sc}"; os.makedirs(d, exist_ok=True)
        im = Image.open(x).convert("RGB"); im.save(f"{d}/01.jpg", quality=90); im.thumbnail((1400, 1400)); im.save(f"{d}/folha.jpg", quality=86)
        ref = {"id": sc, "tipo": "print", "origem": os.path.basename(x), "pasta": d}; folha = f"{d}/folha.jpg"
    else:
        print(f"ignorado (não é link de post do Instagram nem arquivo): {x}"); continue
    if any(r["id"] == ref["id"] for r in refs): print(f"já estava salva: {ref['id']}"); continue
    ref["folha"] = folha; ref["em"] = time.strftime("%Y-%m-%d"); refs.append(ref); print(f"salva: {ref['id']} ({ref['tipo']})")
json.dump(refs[:5], open(f"{base}/refs.json", "w"), ensure_ascii=False, indent=1)
PY
  ;;
remover)
  N="${1:?qual número remover (1 a 5)?}"
  python3 -c "
import json; f='$BASE/refs.json'; r=json.load(open(f)); n=int('$N')
if not 1<=n<=len(r): raise SystemExit('não existe a referência $N')
x=r.pop(n-1); json.dump(r,open(f,'w'),ensure_ascii=False,indent=1); print('removida:',x['id'],'(atualize o gosto.md)')"
  ;;
listar) ;;
*) sed -n 2,9p "$0"; exit 1;;
esac

# Espelho pra Central (só as folhas, numeradas na ordem) e listagem
rm -f "$CENTRAL"/v1-s*.jpg 2>/dev/null; mkdir -p "$CENTRAL"
python3 - "$BASE" "$CENTRAL" "$M" <<'PY'
import json, os, shutil, sys
base, central, m = sys.argv[1:]
refs = json.load(open(f"{base}/refs.json"))
if not refs: print(f"Marca {m}: nenhuma referência salva ainda (máximo 5)."); sys.exit()
print(f"Marca {m}: {len(refs)} de 5 referências" + (" · gosto.md OK" if os.path.exists(f"{base}/gosto.md") else " · FALTA escrever gosto.md"))
for i, r in enumerate(refs, 1):
    nome = f"v1-s{i}-{r['id'].replace('-', '_')}.jpg"; shutil.copy(r["folha"], f"{central}/{nome}")
    extra = f" · @{r['perfil']} · {r.get('laminas')} lâminas" if r["tipo"] == "link" else ""
    print(f"{i}. {r['origem']}{extra}\n   folha: {r['folha']}\n   chat: ![r{i}](/api/design/arquivo/refs-{m}/{nome})")
PY
