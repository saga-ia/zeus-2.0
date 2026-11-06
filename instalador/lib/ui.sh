# shellcheck shell=bash
# Progresso, execução acompanhada, tentativas, autocorreção e checagens do instalador.
# Carregado por instalar.sh depois de LOG, ESTADO, ETAPAS, ok/aviso/erro e feito/marca.
# O fd 3 é o terminal (sem passar pelo log): o indicador de "rodando" vai só pra tela.

UI_T0=$(date +%s)
UI_TTY=0; { [ -t 3 ]; } 2>/dev/null && UI_TTY=1
UI_STALL=${UI_STALL:-480}          # segundos sem log e sem CPU = travado
UI_TOTAL=$(( $(wc -w <<<"$ETAPAS") + 1 ))   # + verificação final
UI_ETAPA="início"

ui_nome() {
  case "$1" in
    sistema) echo "Pacotes do sistema" ;;          dns) echo "DNS na Cloudflare" ;;
    docker) echo "Docker" ;;                       node) echo "Node, PM2 e Claude Code" ;;
    codigo) echo "Copiando o Zeus" ;;              claude) echo "Agentes, skills e memórias" ;;
    personalizar) echo "Personalizando (domínio, dono, chaves internas)" ;;
    dependencias) echo "Dependências dos apps" ;;  bancos) echo "Bancos de dados" ;;
    chaves) echo "Chaves do cliente" ;;            containers) echo "Containers (proxy, Evolution, MoneyPrinter)" ;;
    firewall) echo "Firewall" ;;                   pm2) echo "Subindo os apps" ;;
    central) echo "Dono da Central" ;;             proxy) echo "Subdomínios e SSL" ;;
    apis) echo "APIs no domínio novo" ;;           crontab) echo "Rotinas agendadas" ;;
    atualizacoes) echo "Atualizações automáticas" ;;
    verificacao) echo "Verificação final" ;;       *) echo "$1" ;;
  esac
}
ui_pos() { local i=0 e; for e in $ETAPAS verificacao; do i=$((i + 1)); [ "$e" = "$1" ] && { echo "$i"; return; }; done; echo "?"; }
ui_tempo() { local s=$(( $(date +%s) - ${1:-$UI_T0} )); printf '%dm%02ds' $((s / 60)) $((s % 60)); }
ui_barra() { local n=$1 t=$2 l=24 c i s=""; c=$(( n * l / t )); for ((i = 0; i < l; i++)); do [ $i -lt $c ] && s+="#" || s+="."; done; printf '%s' "$s"; }
ui_recursos() {
  local ram disco
  ram=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{printf "%.1f/%.1f GB", (t-a)/1048576, t/1048576}' /proc/meminfo)
  disco=$(df -BG --output=used,size / | awk 'NR==2{gsub("G","");printf "%s/%s GB", $1, $2}')
  printf 'RAM %s · Disco %s' "$ram" "$disco"
}

# substitui o etapa() original: mostra posição, barra, tempo e uso do servidor
etapa() {
  UI_ETAPA="$1"; local p; p=$(ui_pos "$1")
  if feito "$1"; then ok "[$p/$UI_TOTAL] $(ui_nome "$1"): já feita"; return 1; fi
  printf '\n\033[1;34m==> [%s/%s] %s\033[0m\n    \033[2m[%s]  %s decorridos · %s\033[0m\n' \
    "$p" "$UI_TOTAL" "$(ui_nome "$1")" "$(ui_barra "$p" "$UI_TOTAL")" "$(ui_tempo)" "$(ui_recursos)"
}

# CPU acumulada (s) do processo e de todos os filhos: se não muda e o log não cresce, está parado
ui_cpu() { ps -eo pid=,ppid=,times= 2>/dev/null | awk -v r="$1" '{p[$1]=$2; t[$1]=$3} END{s=0; for (k in p) {x=k; n=0; while (x>1 && n<50) {if (x==r) {s+=t[k]; break}; x=p[x]; n++}} print s}'; }
ui_mata() { local f; for f in $(pgrep -P "$1" 2>/dev/null); do ui_mata "$f"; done; kill -TERM "$1" 2>/dev/null || true; }

# rodar "descrição" comando...   roda acompanhando (tempo + última linha do log); 124 = travou e foi interrompido
rodar() {
  local desc="$1"; shift
  local t0 pid rc=0 i=0 tam ult_tam cpu ult_cpu parado=0 linha sp='|/-\'
  t0=$(date +%s)
  printf -- '---- %s\n' "$desc" >>"$LOG"
  ( trap - ERR; "$@" ) >>"$LOG" 2>&1 </dev/null &
  pid=$!
  ult_tam=$(stat -c %s "$LOG"); ult_cpu=$(ui_cpu "$pid")
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1; i=$((i + 1))
    if [ "$UI_TTY" = 1 ]; then
      linha="$(tail -n1 "$LOG" 2>/dev/null | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | tr -d '\r\t' | cut -c1-55)"
      printf '\r\033[K  \033[36m%s\033[0m %s \033[2m(%s) %s\033[0m' "${sp:i%4:1}" "$desc" "$(ui_tempo "$t0")" "$linha" >&3
    elif [ $((i % 60)) = 0 ]; then
      printf '  ... %s (%s)\n' "$desc" "$(ui_tempo "$t0")" >&3
    fi
    if [ $((i % 30)) = 0 ]; then
      tam=$(stat -c %s "$LOG"); cpu=$(ui_cpu "$pid")
      if [ "$tam" = "$ult_tam" ] && [ "$cpu" = "$ult_cpu" ]; then parado=$((parado + 30)); else parado=0; fi
      ult_tam=$tam; ult_cpu=$cpu
      if [ "$parado" -ge "$UI_STALL" ]; then
        [ "$UI_TTY" = 1 ] && printf '\r\033[K' >&3
        aviso "$desc parece travado há $((parado / 60))m$(printf '%02d' $((parado % 60)))s (sem log e sem CPU): interrompendo"
        ui_mata "$pid"; wait "$pid" 2>/dev/null || true
        return 124
      fi
    fi
  done
  wait "$pid" || rc=$?
  [ "$UI_TTY" = 1 ] && printf '\r\033[K' >&3
  if [ "$rc" = 0 ]; then ok "$desc ($(ui_tempo "$t0"))"
  else printf '\033[1;31m  falhou\033[0m %s (código %s, %s): %s\n' "$desc" "$rc" "$(ui_tempo "$t0")" \
         "$(grep -v '^----' "$LOG" | tail -n1 | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | cut -c1-120)"; fi
  return "$rc"
}

# esperar_apt: a atualização automática do Ubuntu/Debian segura o apt nos primeiros minutos de uma VPS nova
# (o unattended-upgrade-shutdown fica sempre rodando com o mesmo nome curto: por isso o caminho completo)
apt_ocupado() { pgrep -x 'apt|apt-get|dpkg|aptitude' >/dev/null 2>&1 || pgrep -f '/usr/bin/unattended-upgrade($| )' >/dev/null 2>&1; }
esperar_apt() {
  local t=0
  while apt_ocupado; do
    [ $t = 0 ] && echo "  aguardando a atualização automática do sistema liberar o apt..."
    sleep 5; t=$((t + 5))
    if [ $t -ge 900 ]; then
      aviso "apt ocupado há 15 min: parando a atualização automática"
      systemctl stop unattended-upgrades apt-daily.service apt-daily-upgrade.service >/dev/null 2>&1 || true
      pkill -f '/usr/bin/unattended-upgrade($| )' 2>/dev/null || true; sleep 5; break
    fi
  done
}

# o que costuma resolver falha de instalação entre uma tentativa e outra
ui_autocorrige() {
  esperar_apt
  dpkg --configure -a >>"$LOG" 2>&1 || true
  apt-get -f install -y -qq >>"$LOG" 2>&1 || true
}

# tentar <vezes> "descrição" comando...   repete com pausa crescente e autocorreção entre as tentativas
tentar() {
  local n="$1" desc="$2" k; shift 2
  for ((k = 1; k <= n; k++)); do
    if [ "$k" -gt 1 ]; then echo "  tentando de novo ($k de $n) em $((k * 10))s..."; ui_autocorrige; sleep $((k * 10)); fi
    rodar "$desc" "$@" && return 0
  done
  return 1
}

# apt com espera do lock e repetição
apt_inst() { esperar_apt; tentar 3 "$1" bash -c "apt-get update -qq && apt-get install -y -q ${2}"; }

# checagem antes de começar: resolve o que dá sozinho e avisa o resto ANTES de qualquer instalação
checagem() {
  printf '\n\033[1;34m==> Checagem do servidor\033[0m\n'
  # shellcheck disable=SC1091
  . /etc/os-release 2>/dev/null || true
  case "${ID:-?}-${VERSION_ID:-?}" in
    debian-11|debian-12|debian-13|ubuntu-22.04|ubuntu-24.04) ok "sistema: ${PRETTY_NAME:-$ID}" ;;
    *) aviso "sistema ${PRETTY_NAME:-desconhecido} não testado (recomendado: Ubuntu 24.04 ou Debian 12)" ;;
  esac
  [ "$(uname -m)" = x86_64 ] || aviso "processador $(uname -m): o Chrome do WhatsApp só existe pra x86_64"
  local ram livre u falhou="" ocupado
  ram=$(awk '/MemTotal/{printf "%.1f", $2/1048576}' /proc/meminfo)
  if awk -v r="$ram" 'BEGIN{exit !(r < 5.5)}'; then aviso "memória ${ram} GB: o Zeus usa cerca de 3,8 GB; recomendado 8 GB (vou criar swap)"
  else ok "memória: ${ram} GB"; fi
  livre=$(df -BG --output=avail / | awk 'NR==2{gsub("G","");print $1}')
  [ "$livre" -ge 25 ] || erro "disco livre: ${livre} GB. O Zeus precisa de pelo menos 25 GB livres."
  ok "disco livre: ${livre} GB"
  for u in https://deb.debian.org https://registry.npmjs.org https://download.docker.com https://raw.githubusercontent.com \
           https://dl.google.com https://api.cloudflare.com https://acme-v02.api.letsencrypt.org/directory; do
    curl -fsS -m 15 -o /dev/null "$u" 2>/dev/null || curl -sS -m 15 -o /dev/null -I "$u" 2>/dev/null || falhou+=" ${u#https://}"
  done
  if [ -z "$falhou" ]; then ok "internet: npm, Docker, Google, Cloudflare e Let's Encrypt respondem"
  else aviso "sem resposta de:${falhou}. Confira a rede/DNS da VPS: a instalação pode falhar nesses pontos"; fi
  # imagens de VPS às vezes vêm com Apache/Nginx na porta 80/443: o proxy do Zeus precisa delas
  local s
  for s in apache2 nginx httpd lighttpd caddy; do
    if systemctl is-active --quiet "$s" 2>/dev/null; then systemctl disable --now "$s" >>"$LOG" 2>&1 && ok "parei o $s, que ocupava a porta 80/443"; fi
  done
  ocupado="$(ss -ltnpH 2>/dev/null | awk '$4 ~ /:(80|443)$/' | grep -v docker-proxy | sed -E 's/.*users:\(\("([^"]+)".*/\1/' | sort -u | tr '\n' ' ')"
  [ -z "$ocupado" ] && ok "portas 80 e 443 livres" || aviso "portas 80/443 ocupadas por: $ocupado(o SSL não vai funcionar enquanto isso rodar)"
  esperar_apt; ok "gerenciador de pacotes livre"
  timedatectl set-ntp true >/dev/null 2>&1 || true   # SSL depende da hora certa
}

# verificação final: confere e tenta consertar sozinho o que estiver parado
verificacao() {
  UI_ETAPA=verificacao; local p; p=$(ui_pos verificacao)
  printf '\n\033[1;34m==> [%s/%s] %s\033[0m\n    \033[2m[%s]  %s decorridos · %s\033[0m\n' \
    "$p" "$UI_TOTAL" "$(ui_nome verificacao)" "$(ui_barra "$p" "$UI_TOTAL")" "$(ui_tempo)" "$(ui_recursos)"
  local rodada ruins n c
  ui_ruins() { pm2 jlist 2>/dev/null | python3 -I -c 'import json,sys
for p in json.load(sys.stdin):
    if p["pm2_env"]["status"]!="online": print(p["name"])'; }
  for rodada in 1 2 3; do
    ruins="$(ui_ruins)"; [ -z "$ruins" ] && break
    echo "  apps parados (rodada $rodada de 3): $(echo $ruins)"
    for n in $ruins; do pm2 restart "$n" >>"$LOG" 2>&1 || true; done
    sleep 20
  done
  ruins="$(ui_ruins)"
  local total; total=$(pm2 jlist 2>/dev/null | python3 -I -c 'import json,sys;print(len(json.load(sys.stdin)))')
  if [ -z "$ruins" ]; then ok "apps: todos os $total no ar"
  else
    for n in $ruins; do
      aviso "app $n não ficou no ar. Último erro: $(pm2 logs "$n" --err --lines 2 --nostream 2>/dev/null | grep -v '^\s*$' | tail -n1 | cut -c1-140)"
    done
  fi
  for c in $(docker ps -a --filter status=exited --filter status=created --format '{{.Names}}' 2>/dev/null); do
    docker start "$c" >>"$LOG" 2>&1 && ok "container $c estava parado: religado" || aviso "container $c não religou (docker logs $c)"
  done
  ok "containers no ar: $(docker ps --format '{{.Names}}' | wc -l)"
  local porta_c; porta_c="$(awk -F'\t' '$1=="central"{print $4}' "$INST/modelos/hosts.tsv")"
  curl -fsS -m 10 -o /dev/null "http://127.0.0.1:${porta_c:-3031}/login" && ok "Central respondendo" || aviso "Central não respondeu na porta ${porta_c:-3031}"
  local wh wp
  wh="$(sed -n 's/^HOST=//p' /opt/jeff-worker/.env 2>/dev/null | tr -d '"')"; case "$wh" in ''|0.0.0.0) wh=127.0.0.1 ;; esac
  wp="$(sed -n 's/^PORT=//p' /opt/jeff-worker/.env 2>/dev/null | tr -d '"')"; wp="${wp:-3002}"
  curl -sS -m 10 -o /dev/null "http://$wh:$wp/" && ok "WhatsApp do Zeus respondendo (falta ler o QR)" || aviso "WhatsApp do Zeus não respondeu em $wh:$wp"
  if feito proxy; then
    curl -fsS -m 15 -o /dev/null "https://$DOMINIO/login" && ok "https://$DOMINIO no ar com SSL" || aviso "https://$DOMINIO ainda não abre (DNS/SSL): rode o instalador de novo em alguns minutos"
  fi
  ok "tempo total: $(ui_tempo) · $(ui_recursos)"
}
