#!/usr/bin/env bash
# Gera o comando de instalação de UM cliente (roda no servidor do Jeff).
#
#   bash /root/zeus-2.0/instalador/gerar-link.sh
#
# Mostra as respostas do formulário, você escolhe a do cliente e ele devolve uma linha só:
#   curl -fsSL https://zeus-instalacao.jefersonhenrike.com/i/<código> | bash
# Cole essa linha no servidor do cliente (como root). O link leva o Zeus, a resposta do formulário e o
# token da Cloudflare, funciona uma vez e expira em 24 horas. O cliente não precisa de token do GitHub.
# O pacote é a última versão publicada com publicar.sh (limpa); o servidor fica registrado pras atualizações.
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

# 2) pacote do Zeus: a última versão publicada (publicar.sh), já limpa, sem nada que é só do Jeff
read -r VERSAO PAC < <(python3 -I - "$APP/data/versoes.json" "$APP/data/versoes" <<'PY'
import json,os,sys
try: vs=sorted(json.load(open(sys.argv[1]))['versoes'],key=lambda x:-x['v'])
except Exception: vs=[]
v=next((x['v'] for x in vs if os.path.exists(os.path.join(sys.argv[2],f"{x['v']}.tar.gz"))),None)
print(v or '-', os.path.join(sys.argv[2],f'{v}.tar.gz') if v else '-')
PY
)
[ "$VERSAO" != "-" ] || { echo "Nenhuma versão publicada. Rode antes: bash $REPO/instalador/publicar.sh \"primeira versão\""; exit 1; }
echo "Pacote: versão $VERSAO"
COMMIT="v$VERSAO"
NOME="sem formulário"; FORM_ID=""
if [ -n "$ESCOLHA" ]; then
  NOME="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("dados",{}).get("empresa") or "cliente")' "$ESCOLHA")"
  FORM_ID="$(basename "$ESCOLHA" .json)"
fi

# 3) link de uso único
COD="$(python3 -I -c 'import secrets;print(secrets.token_urlsafe(32))')"
DIR="$APP/data/links/$COD"
mkdir -p "$DIR" && chmod 700 "$APP/data/links" "$DIR"
python3 -I - "$DIR/meta.json" "$PAC" "$COMMIT" "$NOME" "$FORM_ID" <<'PY'
import json,sys,datetime as dt
agora=dt.datetime.now(dt.timezone.utc)
json.dump({'criado':agora.isoformat(),'expira':(agora+dt.timedelta(hours=24)).isoformat(),'pacote':sys.argv[2],'commit':sys.argv[3],
           'nome':sys.argv[4],'form_id':sys.argv[5] or None},open(sys.argv[1],'w'))
PY
[ -n "$ESCOLHA" ] && install -m 600 "$ESCOLHA" "$DIR/resposta.json"
[ -s "$REPO/instalador/cloudflare.token" ] && install -m 600 "$REPO/instalador/cloudflare.token" "$DIR/cloudflare.token"

echo
echo "Cole isto no servidor do cliente (como root). Vale 1 vez, por 24 horas:"
echo
echo "  curl -fsSL $URL/i/$COD | bash"
echo
