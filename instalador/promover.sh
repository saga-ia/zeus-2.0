#!/usr/bin/env bash
# Leva uma novidade já testada no Zeus do Jeff (ramo jeff) para a versão validada dos clientes (ramo main).
#
#   bash /root/zeus-2.0/instalador/promover.sh novidades                   lista as cópias da produção do Jeff ainda não promovidas
#   bash /root/zeus-2.0/instalador/promover.sh ver <commit> [caminhos...]  mostra o que mudou naquela cópia (só nos caminhos)
#   bash /root/zeus-2.0/instalador/promover.sh aplicar <commit> <caminhos...> -m "o que é"
#        aplica no main SÓ a diferença daquela cópia, SÓ nos caminhos escolhidos, e faz o commit
#   depois:  bash /root/zeus-2.0/instalador/publicar.sh "o que mudou"   (gera a versão; aprovação no painel)
#
# Por que diferença e não arquivo inteiro: o main tem correções feitas só pros clientes (WhatsApp @lid, QR comercial,
# guardião...) que não existem no Zeus do Jeff. Copiar o arquivo inteiro do jeff apagava essas correções (v12, 15/11/2026).
# Aplicando só a diferença de uma cópia (o que o Jeff mudou entre uma cópia da produção e a seguinte), o resto fica intacto.
# A PRIMEIRA cópia do ramo jeff ("base") é a diferença histórica inteira: não se promove ela.
set -euo pipefail
REPO=/root/zeus-2.0
cd "$REPO"
RAMO="$(git rev-parse --abbrev-ref HEAD)"
[ "$RAMO" = main ] || { echo "RECUSADO: promover grava no ramo main; $REPO está em '$RAMO'."; exit 1; }
git fetch -q origin main jeff 2>/dev/null || git fetch -q origin
BASE="$(git rev-parse -q --verify refs/tags/jeff-base 2>/dev/null || true)"
[ -n "$BASE" ] || { echo "Falta a marcação jeff-base (primeira cópia do ramo jeff)."; exit 1; }
JEFF=origin/jeff
git rev-parse -q --verify "$JEFF" >/dev/null || JEFF=jeff

uso() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
cmd="${1:-}"; shift || true

promovidos() { git log main --format=%B | sed -n 's/^Promovido-do-jeff: \([0-9a-f]\{7,40\}\).*/\1/p'; }

case "$cmd" in
  novidades)
    feitos="$(promovidos | cut -c1-12)"
    echo "Cópias do Zeus do Jeff depois da base ($(git log -1 --format='%h %ad' --date=format:'%d/%m %H:%M' "$BASE")):"
    n=0
    while read -r h; do
      [ -n "$h" ] || continue
      marca="  "; grep -q "^${h:0:12}" <<<"$feitos" && marca="✓ "
      echo "${marca}$(git log -1 --format='%h  %ad  %s' --date=format:'%d/%m %H:%M' "$h")"
      git diff --stat=100 "$h^" "$h" | sed 's/^/      /' | tail -12
      n=$((n + 1))
    done < <(git rev-list --reverse "$BASE..$JEFF")
    [ "$n" -gt 0 ] || echo "  (nenhuma: o Jeff não mudou nada desde a base, ou falta rodar a cópia: bash /root/zeus-2.0-jeff/docs/atualizar-snapshot.sh --push)"
    echo; echo "✓ = já promovido pro main. Pra ver uma:  promover.sh ver <commit> [caminhos]"
    ;;
  ver)
    c="${1:-}"; [ -n "$c" ] || uso; shift
    [ "$(git rev-parse "$c")" != "$(git rev-parse "$BASE")" ] || { echo "Essa é a base (diferença histórica inteira): não se promove."; exit 1; }
    git merge-base --is-ancestor "$c" "$JEFF" || { echo "$c não é uma cópia do ramo jeff."; exit 1; }
    git --no-pager diff --stat "$c^" "$c" -- "$@"; echo; git --no-pager diff "$c^" "$c" -- "$@"
    ;;
  aplicar)
    c="${1:-}"; [ -n "$c" ] || uso; shift
    caminhos=(); msg=""
    while [ $# -gt 0 ]; do case "$1" in -m) msg="${2:-}"; shift 2 ;; *) caminhos+=("$1"); shift ;; esac; done
    [ ${#caminhos[@]} -gt 0 ] || { echo "Diga os caminhos a promover (ex: apps/jeff-central/jarvis.js). Promover a cópia inteira de uma vez é o que quebrou a v12."; exit 1; }
    [ -n "$msg" ] || { echo 'Falta -m "o que é" (vira a mensagem do commit e ajuda a escrever a versão).'; exit 1; }
    [ "$(git rev-parse "$c")" != "$(git rev-parse "$BASE")" ] || { echo "Essa é a base (diferença histórica inteira): não se promove."; exit 1; }
    git merge-base --is-ancestor "$c" "$JEFF" || { echo "$c não é uma cópia do ramo jeff."; exit 1; }
    [ -z "$(git status --porcelain)" ] || { echo "RECUSADO: há mudanças sem commit no main."; git status --short | head; exit 1; }
    git pull -q --ff-only origin main || { echo "RECUSADO: o main daqui e o do GitHub divergiram."; exit 1; }
    PATCH="$(mktemp)"; trap 'rm -f "$PATCH"' EXIT
    git diff --binary "$c^" "$c" -- "${caminhos[@]}" > "$PATCH"
    [ -s "$PATCH" ] || { echo "Essa cópia não mudou nada nesses caminhos."; exit 1; }
    if ! git apply --3way --index "$PATCH"; then
      echo; echo "CONFLITO: a mudança do Jeff mexe num trecho que é diferente na versão dos clientes."
      echo "Resolva os arquivos marcados (git status), depois:  git add <arquivos> && git commit -m \"$msg\" -m \"Promovido-do-jeff: $(git rev-parse --short=12 "$c")\""
      echo "Ou desista:  git reset --hard HEAD"
      exit 1
    fi
    git --no-pager diff --cached --stat
    git commit -q -m "$msg" -m "Promovido-do-jeff: $(git rev-parse --short=12 "$c") ($(printf '%s ' "${caminhos[@]}"))"
    git push -q origin main
    echo; echo "Promovido pro main e enviado pro GitHub: $(git log -1 --format='%h %s')"
    echo "Quando juntar o que quer, gere a versão:  bash $REPO/instalador/publicar.sh \"o que mudou\""
    ;;
  *) uso ;;
esac
