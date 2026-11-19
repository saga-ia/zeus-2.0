#!/usr/bin/env bash
# Publica uma versão nova do Zeus pros servidores dos clientes (roda no servidor do Jeff).
#
#   bash /root/zeus-2.0/instalador/publicar.sh "o que mudou nesta versão"
#
# Sai SEMPRE do ramo main (/root/zeus-2.0), que é a versão validada dos clientes. Não copia mais a produção do Jeff:
# novidades testadas no Zeus do Jeff (ramo jeff) entram no main uma a uma com instalador/promover.sh.
# 1. confere que está no main, sem nada pendente e em dia com o GitHub
# 2. monta o pacote limpo (lib/pacote.py): só o produto, sem nada que é só do Jeff (regras no modelos/fora.txt);
#    se aparecer nome de cliente do Jeff fora das pendências conhecidas, NÃO publica
# 3. registra a versão no painel e envia o main e a marcação zeus-vN pro GitHub. Nenhum cliente recebe nada até
#    alguém aprovar em https://zeus-instalacao.jefersonhenrike.com/admin/versoes (por cliente ou pra todos)
set -euo pipefail
REPO=/root/zeus-2.0
APP=/opt/jeff-apps/zeus-instalacao
DIRV="$APP/data/versoes"
ARQV="$APP/data/versoes.json"
PAINEL=https://zeus-instalacao.jefersonhenrike.com/admin/versoes

[ "${1:-}" = --sem-producao ] && shift   # aceito por compatibilidade: agora nunca copia a produção
case "${1:-}" in --*) echo "Opção desconhecida: $1 (a cópia da produção do Jeff foi tirada daqui; use promover.sh)"; exit 1 ;; esac
NOTAS="${1:-}"
[ -n "$NOTAS" ] || { echo 'Uso: publicar.sh "o que mudou nesta versão"'; exit 1; }
cd "$REPO"
exec 9>/tmp/zeus-publicar.lock
flock -n 9 || { echo "Já tem uma publicação rodando."; exit 1; }

RAMO="$(git rev-parse --abbrev-ref HEAD)"
[ "$RAMO" = main ] || { echo "RECUSADO: publicar só sai do ramo main (versão validada dos clientes); aqui é '$RAMO'."; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "RECUSADO: há mudanças sem commit em $REPO. Faça o commit (ou desfaça) antes de publicar:"; git status --short | head -20; exit 1
fi
echo "==> Conferindo o GitHub..."
git fetch -q origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "O GitHub tem mudanças no main que não estão aqui. Trazendo (git pull --ff-only)..."
  git pull -q --ff-only origin main || { echo "RECUSADO: o main daqui e o do GitHub divergiram. Resolva antes de publicar."; exit 1; }
fi
COMMIT="$(git rev-parse HEAD)"

mkdir -p "$DIRV" && chmod 700 "$DIRV"
read -r V ULTIMO < <(python3 -I - "$ARQV" <<'PY'
import json,sys
try: vs=json.load(open(sys.argv[1]))['versoes']
except Exception: vs=[]
u=max(vs,key=lambda x:x['v']) if vs else None
print((u['v'] if u else 0)+1, u['commit'] if u else '-')
PY
)
if [ "$ULTIMO" = "$COMMIT" ]; then
  echo "Nada mudou desde a v$((V - 1)) (commit ${COMMIT:0:8}). Nada publicado."
  exit 0
fi

echo "==> Montando o pacote da v$V (commit ${COMMIT:0:8})..."
if ! RES="$(python3 -I instalador/lib/pacote.py montar "$REPO" "$COMMIT" "$DIRV/$V.tar.gz" --versao "$V")"; then
  echo
  echo "NÃO PUBLICADO: o pacote tem nome de cliente seu (lista acima, linhas SIGILO)."
  echo "Pra cada arquivo: tire o nome do código, ou ponha no instalador/modelos/fora.txt como"
  echo "  arquivo <caminho>   (não vai pro cliente)   ou   aceito <caminho>   (pendência conhecida, só avisa)"
  exit 1
fi
SHA="$(sha256sum "$DIRV/$V.tar.gz" | cut -d' ' -f1)"
TAM="$(stat -c %s "$DIRV/$V.tar.gz")"

python3 -I - "$ARQV" "$V" "$COMMIT" "$NOTAS" "$SHA" "$TAM" "$RES" <<'PY'
import json,os,sys,datetime as dt
arq,v,commit,notas,sha,tam,res=sys.argv[1:8]
try: d=json.load(open(arq))
except Exception: d={'versoes':[]}
d['versoes'].append({'v':int(v),'commit':commit,'data':dt.datetime.now(dt.timezone.utc).isoformat(),'notas':notas,
                     'sha256':sha,'tam':int(tam),'pendencias':json.loads(res).get('pendencias',0)})
tmp=arq+'.tmp'
with open(os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600),'w') as f: json.dump(d,f,ensure_ascii=False,indent=1)
os.replace(tmp,arq)
PY
git tag -f "zeus-v$V" "$COMMIT" >/dev/null
git push -q origin main "zeus-v$V" 2>/dev/null || echo "aviso: não consegui enviar o main/zeus-v$V pro GitHub agora (rode: git push origin main --tags)"

# guarda os 6 pacotes mais novos e qualquer um que algum cliente ainda use ou tenha aprovado
python3 -I - "$DIRV" "$APP/data/clientes-zeus.json" <<'PY'
import glob,json,os,sys
d,arq=sys.argv[1:3]
try: cs=json.load(open(arq)).values()
except Exception: cs=[]
usadas={c.get(k) for c in cs for k in ('aprovada','instalada')}
ps=sorted(glob.glob(os.path.join(d,'*.tar.gz')),key=lambda p:int(os.path.basename(p).split('.')[0]),reverse=True)
for p in ps[6:]:
    if int(os.path.basename(p).split('.')[0]) not in usadas: os.remove(p)
PY

echo
echo "Publicada a v$V: $NOTAS ($((TAM / 1000000)) MB)"
echo "Nenhum cliente recebeu ainda. Aprove em $PAINEL"
