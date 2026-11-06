#!/usr/bin/env bash
# =====================================================================================
#  Instalador ZEUS 2.0 no servidor do cliente
#
#  Num VPS limpo (Debian 12 recomendado, Ubuntu 22/24 funciona), como root:
#
#    git clone https://<TOKEN>@github.com/saga-ia/zeus-2.0.git /opt/zeus-2.0
#    bash /opt/zeus-2.0/instalador/instalar.sh
#
#  Pergunta domínio, cliente, dono, e-mail e senha de acesso, e faz o resto.
#  Pode rodar de novo quantas vezes precisar: etapas prontas são puladas
#  (ex: rodar de novo depois que o DNS propagar pra emitir o SSL).
#
#  Opções:  --formulario <arq>  resposta do formulário de instalação (preenche dados e chaves do cliente)
#           --refazer <etapa>   roda uma etapa de novo (ver lista em ETAPAS)
#           --respostas         pergunta tudo de novo
# =====================================================================================
set -Eeuo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
INST="$REPO/instalador"
ESTADO=/root/.zeus-instalador
RESP="$ESTADO/respostas.json"
LOG=/var/log/zeus-instalador.log
NODE_VER=20.20.2                      # caminhos /root/.nvm/versions/node/v20.20.2 estão fixos no código
SUPORTE_WHATS="5511910075450,5585991143501"
DOMINIO_BASE="zeusia.cloud"           # padrão: <nomecliente>.zeusia.cloud (DNS criado com dns-cliente.sh no servidor do Jeff)
COMPOSE_APPS="jeff-evolution jeff-omniroute jeff-presenton jeff-moneyprinter"
ETAPAS="sistema dns docker node codigo claude personalizar dependencias bancos chaves containers firewall pm2 central proxy apis crontab"
FORM="$ESTADO/formulario.json"
FORA="$INST/modelos/fora.txt"         # perfil enxuto: o que não vai pro cliente
fora() { [ -f "$FORA" ] && awk -v t="$1" '$1==t{print $2}' "$FORA" || true; }
fora_tem() { fora "$1" | grep -qxF "$2"; }

mkdir -p "$ESTADO"; chmod 700 "$ESTADO"
exec > >(tee -a "$LOG") 2>&1

azul()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
aviso() { printf '\033[1;33m  atenção:\033[0m %s\n' "$*"; echo "$*" >> "$ESTADO/avisos.txt"; }
erro()  { printf '\033[1;31m  erro:\033[0m %s\n' "$*"; exit 1; }
trap 'printf "\n\033[1;31mParou na linha %s. Log completo em %s. Corrija e rode de novo: as etapas prontas são puladas.\033[0m\n" "$LINENO" "$LOG"' ERR

[ "$(id -u)" = 0 ] || erro "rode como root"
[ -d "$REPO/worker" ] && [ -d "$REPO/apps" ] || erro "rode a partir do repositório clonado (ex: /opt/zeus-2.0/instalador/instalar.sh)"

REFAZER=""; PERGUNTAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --refazer) REFAZER="$2"; rm -f "$ESTADO/feito.$2"; shift 2 ;;
    --respostas) PERGUNTAR=1; shift ;;
    --formulario) [ -f "$2" ] || erro "arquivo não encontrado: $2"; install -m 600 "$2" "$FORM"; shift 2 ;;
    *) erro "opção desconhecida: $1" ;;
  esac
done

feito()  { [ -f "$ESTADO/feito.$1" ]; }
marca()  { touch "$ESTADO/feito.$1"; }
etapa()  { if feito "$1"; then ok "etapa $1 já feita"; return 1; fi; azul "Etapa: $1"; }
campo()  { python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$RESP" "$1"; }

# ------------------------------------------------------------------------------------
# Perguntas
# ------------------------------------------------------------------------------------
form() { [ -f "$FORM" ] && python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); d=d.get("dados",d); print(str(d.get(sys.argv[2],"") or "").strip())' "$FORM" "$1" || true; }
perguntar() {
  azul "Dados da instalação"
  [ -f "$FORM" ] && echo "  (sugestões vindas do formulário; Enter confirma)"
  local dominio cliente dono whats email senha senha2 autorizados
  local f_whats; f_whats="$(form whats | tr -cd '0-9')"; [ ${#f_whats} -ge 10 ] && [ ${#f_whats} -le 11 ] && f_whats="55$f_whats"
  while :; do read -erp "  Nome da empresa do cliente: " -i "$(form empresa)" cliente; [ -n "$cliente" ] && break; done
  local sugestao; sugestao="$(echo "$cliente" | iconv -f utf-8 -t ascii//TRANSLIT 2>/dev/null | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9')"
  while :; do read -erp "  Nome do cliente no domínio (fica NOME.$DOMINIO_BASE): " -i "$sugestao" dominio
    dominio="$(echo "$dominio" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#^www\.##; s#/.*##')"
    [[ "$dominio" == *.* ]] || dominio="$dominio.$DOMINIO_BASE"   # só o nome: completa com .zeusia.cloud
    [[ "$dominio" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$ ]] && { echo "  domínio: $dominio"; break; }; echo "  nome inválido (use letras, números e hífen)"; done
  while :; do read -erp "  Nome do dono (quem manda no Zeus): " -i "$(form nome)" dono; [ -n "$dono" ] && break; done
  while :; do read -erp "  WhatsApp do dono, com 55 e DDD (ex: 5511999998888): " -i "$f_whats" whats
    whats="$(echo "$whats" | tr -cd '0-9')"; [[ "$whats" =~ ^55[0-9]{10,11}$ ]] && break; echo "  número inválido"; done
  read -erp "  Outros números autorizados a falar com o Zeus (vírgula; Enter = nenhum): " -i "$(form autorizados)" autorizados
  autorizados="$(echo "$autorizados" | tr -c '0-9\n' ' ' | xargs -n1 2>/dev/null | awk 'length>=10{ if(length<=11) $0="55"$0; print }' | paste -sd, -)"
  while :; do read -erp "  E-mail de acesso (Central, painel do proxy e SSL): " -i "$(form email)" email
    [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] && break; echo "  e-mail inválido"; done
  while :; do read -rsp "  Senha de acesso (mín. 8; Enter = gerar uma): " senha; echo
    if [ -z "$senha" ]; then senha="$(python3 -I -c 'import secrets;print(secrets.token_urlsafe(12))')"; echo "  senha gerada (aparece no final)"; break; fi
    [ ${#senha} -ge 8 ] || { echo "  mínimo 8 caracteres"; continue; }
    read -rsp "  Repita a senha: " senha2; echo; [ "$senha" = "$senha2" ] && break; echo "  não confere"; done

  echo; echo "  Domínio: $dominio | Cliente: $cliente | Dono: $dono ($whats) | Acesso: $email"
  read -rp "  Confere? [S/n] " c; [[ "${c:-S}" =~ ^[Ss]$ ]] || { perguntar; return; }

  DOMINIO="$dominio" CLIENTE="$cliente" DONO="$dono" WHATS="$whats" EMAIL="$email" SENHA="$senha" AUTORIZADOS="$autorizados" \
  SUPORTE="$SUPORTE_WHATS" ESTADO="$ESTADO" MODELOS="$INST/modelos" python3 -I - "$RESP" <<'PY'
import json,os,sys
e=os.environ
wl=[x for x in [e['WHATS']]+e['AUTORIZADOS'].split(',')+e['SUPORTE'].split(',') if x]
d={'dominio':e['DOMINIO'],'cliente':e['CLIENTE'],'dono_nome':e['DONO'],'dono_whats':e['WHATS'],
   'email':e['EMAIL'],'senha':e['SENHA'],'whitelist':','.join(dict.fromkeys(wl)),
   'estado':e['ESTADO'],'modelos':e['MODELOS']}
fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f: json.dump(d,f,ensure_ascii=False,indent=1)
PY
}

if [ ! -f "$RESP" ] || [ "$PERGUNTAR" = 1 ]; then
  command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; }
  perguntar
else
  ok "usando respostas salvas ($(campo dominio), $(campo cliente)). Pra mudar: --respostas"
fi
DOMINIO="$(campo dominio)"; EMAIL="$(campo email)"; SENHA="$(campo senha)"

export DEBIAN_FRONTEND=noninteractive
export NVM_DIR=/root/.nvm
carrega_node() { # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use -s "$NODE_VER" >/dev/null 2>&1 || true; }

# ------------------------------------------------------------------------------------
if etapa sistema; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git rsync jq sqlite3 python3 python3-pip python3-venv ffmpeg \
    build-essential ufw dnsutils cron gnupg unzip fonts-liberation fonts-noto-color-emoji locales tzdata >/dev/null
  # Chromium do sistema (WhatsApp Web). No Ubuntu o pacote é snap, então usa o Chrome .deb.
  if ! command -v chromium >/dev/null && ! [ -x /usr/bin/chromium ]; then
    if grep -qi debian /etc/os-release && apt-get install -y -qq chromium >/dev/null 2>&1; then :
    else
      curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
      apt-get install -y -qq /tmp/chrome.deb >/dev/null && rm -f /tmp/chrome.deb
      ln -sf /usr/bin/google-chrome /usr/bin/chromium
    fi
  fi
  # swap se tiver pouca memória (npm e Chromium agradecem)
  if [ "$(awk '/MemTotal/{print int($2/1024/1024)}' /proc/meminfo)" -lt 8 ] && ! swapon --show | grep -q .; then
    fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "swap de 4G criado"
  fi
  marca sistema; ok "pacotes do sistema"
fi

IP_PUB() { curl -4fsS https://api.ipify.org 2>/dev/null || curl -4fsS ifconfig.me; }
if etapa dns; then
  # Token só em memória: não vai pro disco, pro log nem pra linha de comando (ps)
  CF_API_TOKEN="${CF_API_TOKEN:-}"
  for arq in "$INST/cloudflare.token" /root/cloudflare.token; do
    [ -z "$CF_API_TOKEN" ] && [ -s "$arq" ] && CF_API_TOKEN="$(tr -d ' \r\n' < "$arq")"
  done
  if [ -z "$CF_API_TOKEN" ] && [ -t 0 ]; then
    read -rsp "  Token da API da Cloudflare (DNS:Edit em ${DOMINIO#*.}; Enter pula): " CF_API_TOKEN; echo
  fi
  if [ -n "$CF_API_TOKEN" ]; then
    if CF_API_TOKEN="$CF_API_TOKEN" python3 -I "$INST/lib/cloudflare_dns.py" "$DOMINIO" "$(IP_PUB)"; then
      marca dns
    else
      aviso "DNS na Cloudflare não foi criado (motivo acima). Rode de novo com outro token ou: --refazer dns"
    fi
  else
    aviso "DNS pulado: crie $DOMINIO e *.$DOMINIO apontando pra $(IP_PUB) (ou rode o instalador de novo e informe o token da Cloudflare)"
  fi
  unset CF_API_TOKEN
fi

if etapa docker; then
  command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker >/dev/null
  docker compose version >/dev/null || erro "docker compose não disponível"
  marca docker; ok "$(docker --version)"
fi

if etapa node; then
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VER" >/dev/null && nvm alias default "$NODE_VER" >/dev/null
  npm i -g pm2@6 @anthropic-ai/claude-code >/dev/null
  # Debian/Ubuntu protegem o Python do sistema (PEP 668) e trazem pacotes do apt (blinker, typing_extensions...)
  # que o pip não consegue desinstalar: --ignore-installed instala por cima sem tentar remover
  pip3 install -q --break-system-packages --ignore-installed gunicorn flask
  marca node; ok "node $(node -v), pm2 $(pm2 -v), claude $(claude --version 2>/dev/null | head -1)"
fi
carrega_node

if etapa codigo; then
  # remove token do remote, se o clone foi feito com ele
  if [ -d "$REPO/.git" ]; then
    git -C "$REPO" remote set-url origin "$(git -C "$REPO" remote get-url origin | sed -E 's#https://[^@]+@#https://#')" || true
  fi
  copia() { local o="$1" d="$2"; shift 2; mkdir -p "$d"; rsync -a "$@" "$o/" "$d/"; }
  excl() { local x; for x in $(fora "$1"); do printf -- '--exclude=/%s/\n' "$x"; done; }
  mapfile -t EX_APPS < <(excl app); mapfile -t EX_SITES < <(excl site); mapfile -t EX_DADOS < <(excl dado)
  copia "$REPO/worker"            /opt/jeff-worker
  copia "$REPO/apps"              /opt/jeff-apps     "${EX_APPS[@]}"
  copia "$REPO/sites"             /opt/jeff-sites    "${EX_SITES[@]}"
  copia "$REPO/projects"          /opt/jeff-projects "${EX_DADOS[@]}"
  copia "$REPO/data/jeff-data"    /opt/jeff-data
  fora_tem dado jeff-cigc || copia "$REPO/data/jeff-cigc" /opt/jeff-cigc
  copia "$REPO/data/jeff-ideias"  /opt/jeff-ideias
  ok "fora do perfil: $(fora app | wc -l) apps, $(fora site | wc -l) sites (lista em $FORA)"
  copia "$REPO/infra/zeus-backup" /opt/zeus-backup
  copia "$REPO/infra/labastia-docker" /root/labastia-setup
  mkdir -p /opt/jeff-worker/logs /opt/jeff-worker/data
  marca codigo; ok "código em /opt/jeff-* (layout igual ao servidor original)"
fi

if etapa claude; then
  mkdir -p /root/.claude
  rsync -a "$INST/claude/agents/" /root/.claude/agents/
  rsync -a "$INST/claude/skills/" /root/.claude/skills/
  [ -f /root/.claude/CLAUDE.md ] || cp "$INST/claude/CLAUDE.md" /root/.claude/CLAUDE.md
  MEMDIR=/root/.claude/projects/-opt-jeff-worker/memory   # memória do Zeus (claude roda em /opt/jeff-worker)
  mkdir -p "$MEMDIR"; rsync -a --ignore-existing "$INST/claude/memoria/" "$MEMDIR/"
  marca claude; ok "$(ls /root/.claude/agents | wc -l) agentes, $(ls /root/.claude/skills | wc -l) skills e $(($(ls "$MEMDIR" | wc -l) - 1)) memórias de regras do Zeus"
fi

if etapa personalizar; then
  # hash bcrypt da senha pro painel do WhatsApp (bcryptjs puro, sem compilar)
  TMPB="$(mktemp -d)"; (cd "$TMPB" && npm i -s bcryptjs@2 >/dev/null 2>&1)
  HASH="$(cd "$TMPB" && SENHA="$SENHA" node -e 'console.log(require("bcryptjs").hashSync(process.env.SENHA,12))')"
  rm -rf "$TMPB"
  python3 -I - "$RESP" "$HASH" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); d['hash_admin']=sys.argv[2]; json.dump(d,open(sys.argv[1],'w'),ensure_ascii=False,indent=1)
PY
  python3 -I "$INST/lib/personalizar.py" "$RESP"
  marca personalizar
fi

if etapa dependencias; then
  falhas=()
  instala() {
    local d="$1"; [ -f "$d/package.json" ] || return 0
    printf '  npm %s ... ' "${d#/opt/}"
    if (cd "$d" && { [ -f package-lock.json ] && npm ci --no-audit --no-fund -s || npm install --no-audit --no-fund -s; }) >>"$LOG" 2>&1
    then echo ok; else echo FALHOU; falhas+=("${d#/opt/}"); fi
  }
  instala /opt/jeff-worker
  for d in /opt/jeff-apps/*/; do instala "${d%/}"; done
  # Python: cada app no próprio venv (app/venv), nunca no Python do sistema
  for r in /opt/jeff-apps/*/requirements.txt; do
    [ -f "$r" ] || continue
    d="$(dirname "$r")"; a="$(basename "$d")"
    [[ " $COMPOSE_APPS " == *" $a "* ]] && continue   # roda em container: as dependências vão na imagem
    printf '  pip %s ... ' "$a"
    if { [ -x "$d/venv/bin/python" ] || python3 -m venv "$d/venv"; } >>"$LOG" 2>&1 && "$d/venv/bin/pip" install -q -r "$r" >>"$LOG" 2>&1
    then echo ok; else echo FALHOU; falhas+=("pip $a"); fi
  done
  [ ${#falhas[@]} -eq 0 ] || aviso "dependências que falharam (ver $LOG): ${falhas[*]}"
  marca dependencias
fi

if etapa bancos; then
  python3 -I "$INST/lib/bancos.py" "$INST/modelos"
  marca bancos
fi

if etapa chaves; then
  # na instalação não para pra perguntar (chave que faltar fica pra depois); só pergunta no  --refazer chaves
  SEM_PERG=--sem-perguntas; [ "$REFAZER" = chaves ] && SEM_PERG=""
  python3 -I "$INST/lib/chaves.py" "$RESP" "$INST/modelos/chaves.tsv" "$( [ -f "$FORM" ] && echo "$FORM" || echo -)" "$(IP_PUB)" $SEM_PERG
  marca chaves
fi

if etapa containers; then
  cd /root/labastia-setup
  if [ ! -f .env ]; then
    ( umask 077; cat > .env <<EOF
POSTGRES_USER=zeus
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB_N8N=n8n
N8N_HOST=n8n.$DOMINIO
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=$EMAIL
N8N_BASIC_AUTH_PASSWORD=$SENHA
N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
TZ=America/Sao_Paulo
INITIAL_ADMIN_EMAIL=$EMAIL
INITIAL_ADMIN_PASSWORD=$SENHA
EOF
    )
  fi
  # painel do proxy (81) só local; rede fixa 172.18.0.0/16 (apps apontam pro gateway 172.18.0.1); admin inicial
  python3 -I - docker-compose.yml <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('- "81:81"','- "127.0.0.1:81:81"')
s=s.replace('image: jc21/nginx-proxy-manager:latest','image: jc21/nginx-proxy-manager:2.14.0\n    environment:\n      INITIAL_ADMIN_EMAIL: ${INITIAL_ADMIN_EMAIL}\n      INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD}',1) if 'INITIAL_ADMIN_EMAIL' not in s else s
if 'subnet: 172.18.0.0/16' not in s:
    s=s.replace('  labastia:\n    driver: bridge','  labastia:\n    driver: bridge\n    ipam:\n      config:\n        - subnet: 172.18.0.0/16\n          gateway: 172.18.0.1')
open(p,'w').write(s)
PY
  mapfile -t SERVICOS < <(docker compose -p labastia-setup config --services | grep -vxF -f <(fora servico; echo '#'))
  docker compose -p labastia-setup up -d "${SERVICOS[@]}"
  if ! fora_tem servico jeff-sites-nginx; then   # container dos sites estáticos (só se algum site for junto)
    docker rm -f jeff-sites-nginx >/dev/null 2>&1 || true
    docker run -d --name jeff-sites-nginx --restart always --network labastia-setup_labastia \
      -v /opt/jeff-sites/_nginx/default.conf:/etc/nginx/conf.d/default.conf:ro -v /opt/jeff-sites:/sites:ro nginx:alpine >/dev/null
  fi
  for a in $COMPOSE_APPS; do
    [ -f "/opt/jeff-apps/$a/docker-compose.yml" ] || continue
    printf '  container %s ... ' "$a"
    if (cd "/opt/jeff-apps/$a" && docker compose up -d --build) >>"$LOG" 2>&1; then echo ok; else echo FALHOU; aviso "container $a não subiu (ver $LOG)"; fi
  done
  cd "$REPO"
  marca containers
fi

if etapa firewall; then
  SSH_PORTA="$(ss -tlnp 2>/dev/null | awk '/sshd/{split($4,a,":"); print a[length(a)]; exit}')"; SSH_PORTA="${SSH_PORTA:-22}"
  ufw --force reset >/dev/null
  ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
  ufw allow "$SSH_PORTA"/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw allow from 172.16.0.0/12 >/dev/null   # containers (proxy) alcançam os apps do host
  ufw --force enable >/dev/null
  marca firewall; ok "firewall: só SSH ($SSH_PORTA), 80 e 443 abertos pra fora"
fi

if etapa pm2; then
  pm2 install pm2-logrotate >/dev/null 2>&1 || true
  falhas=()
  while IFS=$'\t' read -r nome status cwd script interp args eco; do
    [[ "$nome" =~ ^# ]] && continue
    [ "$status" = online ] || continue
    fora_tem pm2 "$nome" && continue
    a_dir="$(printf '%s\n%s\n' "$script" "$cwd/" | sed -n 's#^/opt/jeff-apps/\([^/]*\)/.*#\1#p' | head -1)"
    [ -n "$a_dir" ] && fora_tem app "$a_dir" && continue      # app fora do perfil (pelo script ou pela pasta)
    pm2 describe "$nome" >/dev/null 2>&1 && continue
    if [ "$eco" != "-" ] && [ -f "$eco" ]; then
      (cd "$(dirname "$eco")" && pm2 start "$eco" --only "$nome") >>"$LOG" 2>&1 || falhas+=("$nome")
    elif [ -f "$script" ]; then
      # "--" só com argumentos: "pm2 start x.js --" sozinho falha com "ecosystem.config.js not found"
      cmd=(pm2 start "$script" --name "$nome" --cwd "$cwd" --interpreter "$interp")
      if [ "$args" != "-" ]; then read -ra extra <<< "$args"; cmd+=(-- "${extra[@]}"); fi
      (cd "$cwd" 2>/dev/null || cd /root; "${cmd[@]}") >>"$LOG" 2>&1 || falhas+=("$nome")
    else
      falhas+=("$nome (sem o arquivo $script)")
    fi
  done < "$INST/modelos/pm2.tsv"
  pm2 save >/dev/null
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
  # só marca como feita se tudo subiu: rodar de novo tenta só os que faltaram
  if [ ${#falhas[@]} -eq 0 ]; then marca pm2; else aviso "processos que não subiram (ver $LOG; rode o instalador de novo): ${falhas[*]}"; fi
  ok "$(pm2 jlist | python3 -I -c 'import json,sys;d=json.load(sys.stdin);print(sum(p["pm2_env"]["status"]=="online" for p in d),"de",len(d),"processos online")')"
fi

if etapa central; then
  PORTA="$(awk -F'\t' '$1=="central"{print $4}' "$INST/modelos/hosts.tsv")"; PORTA="${PORTA:-3031}"
  for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORTA/login" && break; sleep 2; done
  CLIENTE="$(campo cliente)"; DONO="$(campo dono_nome)"
  RET="$(curl -s -o /dev/null -w '%{redirect_url}' -X POST "http://127.0.0.1:$PORTA/api/signup" \
    --data-urlencode "email=$EMAIL" --data-urlencode "password=$SENHA" --data-urlencode "name=$DONO" --data-urlencode "company=$CLIENTE")" || true
  case "$RET" in *error=invite*) ok "Central já tinha proprietário";; *error=*) aviso "cadastro na Central voltou: $RET (faça pelo navegador)";; *) ok "Central: $EMAIL é o proprietário";; esac
  marca central
fi

if etapa proxy; then
  IP="$(IP_PUB)"
  echo "  IP público deste servidor: $IP"
  if python3 -I "$INST/lib/npm_proxy.py" "$RESP" "$INST/modelos/hosts.tsv" "$IP" "$(fora host | paste -sd, -)"; then
    marca proxy
  else
    if [[ "$DOMINIO" == *".$DOMINIO_BASE" ]]; then
      aviso "SSL incompleto: o DNS de $DOMINIO ainda não aponta pra $IP. Rode  --refazer dns  (token da Cloudflare) ou, no servidor do Jeff,  dns-cliente.sh ${DOMINIO%%.*} $IP ; depois rode o instalador de novo"
    else
      aviso "SSL incompleto: crie no DNS de $DOMINIO um registro A curinga  *  ->  $IP  (ou um A por subdomínio) e rode o instalador de novo"
    fi
  fi
fi

if feito proxy && etapa apis; then
  if python3 -I "$INST/lib/apis.py" "$RESP"; then marca apis
  else aviso "alguma API não configurou sozinha (detalhe acima). Corrija a chave e rode: --refazer chaves e depois --refazer apis"; fi
fi

if etapa crontab; then
  # linhas de clientes fora do perfil vão comentadas
  python3 -I - "$REPO/docs/crontab-snapshot.txt" "$(fora cron | paste -sd, -)" <<'PY' | crontab -
import sys
termos=[t for t in sys.argv[2].split(',') if t]
for l in open(sys.argv[1]):
    l=l.rstrip('\n')
    print('# fora do perfil: '+l if l and not l.startswith('#') and any(t in l for t in termos) else l)
PY
  marca crontab; ok "crontab instalado ($(crontab -l | grep -cE '^[0-9*@]') tarefas)"
fi

# ------------------------------------------------------------------------------------
ACESSOS=/root/zeus-acessos.txt
ADMIN_WA="$(sed -n 's/^ADMIN_USER=//p' /opt/jeff-worker/.env 2>/dev/null | tr -d '"'"'"'')"; ADMIN_WA="${ADMIN_WA:-admin}"
( umask 077; cat > "$ACESSOS" <<EOF
ZEUS de $(campo cliente), instalado em $(date '+%d/%m/%Y %H:%M')
Central:            https://$DOMINIO   ($EMAIL / $SENHA)
Painel WhatsApp:    https://sagazeus.$DOMINIO  (usuário $ADMIN_WA / $SENHA)
$(fora_tem servico n8n || echo "n8n:                https://n8n.$DOMINIO       ($EMAIL / $SENHA)")
Proxy (NPM):        ssh -L 81:127.0.0.1:81 root@$DOMINIO  e abrir http://localhost:81  ($EMAIL / $SENHA)
Chaves internas:    $ESTADO/chaves.json
EOF
)
azul "Pronto. Acessos salvos em $ACESSOS (só root lê)"
cat "$ACESSOS"
cat <<EOF

Falta fazer na chamada com o cliente:
  1. Claude:   rode  claude  neste servidor e faça /login com a conta (assinatura) do cliente
  2. WhatsApp: abra https://sagazeus.$DOMINIO, entre e leia o QR com o celular do número do Zeus
  3. Painéis:  os itens "Configure no painel" da etapa apis (Meta, Google, ZapSign)
  Chave nova ou trocada depois:  bash $INST/instalar.sh --refazer chaves && bash $INST/instalar.sh --refazer apis
EOF
[ -f "$ESTADO/avisos.txt" ] && { echo; echo "Atenções desta instalação:"; sort -u "$ESTADO/avisos.txt" | sed 's/^/  - /'; }
true
