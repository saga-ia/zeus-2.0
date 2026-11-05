#!/usr/bin/env bash
# Gera o comando de instalação de UM cliente (roda no servidor do Jeff).
#
#   bash /root/zeus-2.0/instalador/gerar-link.sh
#
# Mostra as respostas do formulário, você escolhe a do cliente e ele devolve uma linha só:
#   curl -fsSL https://zeus-instalacao.jefersonhenrike.com/i/<código> | bash
# Cole essa linha no servidor do cliente (como root). O link leva o Zeus, a resposta do formulário e o
# token da Cloudflare, funciona uma vez e expira em 24 horas. O cliente não precisa de token do GitHub.
set -euo pipefail
REPO=/root/zeus-2.0
APP=/opt/jeff-apps/zeus-instalacao
URL=https://zeus-instalacao.jefersonhenrike.com
RESP="$APP/data/respostas"

# 1) escolher a resposta do formulário
mapfile -t ARQS < <(ls -t "$RESP"/*.json 2>/dev/null | head -15)
ESCOLHA=""
if [ ${#ARQS[@]} -gt 0 ]; then
  echo "Respostas do formulário (mais recentes primeiro):"
  i=1
  for f in "${ARQS[@]}"; do
    python3 -I -c 'import json,sys
d=json.load(open(sys.argv[1])); x=d.get("dados",{})
print(f"  {sys.argv[2]:>2}) {x.get(\"empresa\",\"?\")}  ({x.get(\"nome\",\"\")}, enviado {d.get(\"recebido_em\",\"\")[:10]})")' "$f" "$i"
    i=$((i + 1))
  done
  echo "   0) sem formulário (o instalador pergunta tudo)"
  read -rp "Número do cliente: " N
  if [[ "$N" =~ ^[0-9]+$ ]] && [ "$N" -ge 1 ] && [ "$N" -le ${#ARQS[@]} ]; then ESCOLHA="${ARQS[$((N - 1))]}"; fi
fi

# 2) pacote do Zeus a partir do último commit (reaproveitado entre links)
cd "$REPO"
[ -z "$(git status --porcelain instalador worker apps 2>/dev/null | grep -v '^??')" ] || echo "atenção: há mudanças sem commit no repo; o pacote leva só o que está commitado."
COMMIT="$(git rev-parse --short HEAD)"
mkdir -p "$APP/data/pacotes" && chmod 700 "$APP/data/pacotes"
PAC="$APP/data/pacotes/zeus-$COMMIT.tar.gz"
if [ ! -s "$PAC" ]; then
  echo "Montando o pacote do Zeus (commit $COMMIT, só na primeira vez)..."
  git archive --format=tar --prefix=zeus-2.0/ HEAD | gzip -1 > "$PAC.tmp" && mv "$PAC.tmp" "$PAC"
  ls -t "$APP"/data/pacotes/zeus-*.tar.gz | tail -n +4 | xargs -r rm -f   # guarda só os 3 últimos
fi

# 3) link de uso único
COD="$(python3 -I -c 'import secrets;print(secrets.token_urlsafe(32))')"
DIR="$APP/data/links/$COD"
mkdir -p "$DIR" && chmod 700 "$APP/data/links" "$DIR"
python3 -I - "$DIR/meta.json" "$PAC" "$COMMIT" <<'PY'
import json,sys,datetime as dt
agora=dt.datetime.now(dt.timezone.utc)
json.dump({'criado':agora.isoformat(),'expira':(agora+dt.timedelta(hours=24)).isoformat(),'pacote':sys.argv[2],'commit':sys.argv[3]},open(sys.argv[1],'w'))
PY
[ -n "$ESCOLHA" ] && install -m 600 "$ESCOLHA" "$DIR/resposta.json"
[ -s "$REPO/instalador/cloudflare.token" ] && install -m 600 "$REPO/instalador/cloudflare.token" "$DIR/cloudflare.token"

echo
echo "Cole isto no servidor do cliente (como root). Vale 1 vez, por 24 horas:"
echo
echo "  curl -fsSL $URL/i/$COD | bash"
echo
