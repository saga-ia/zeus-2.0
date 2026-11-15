#!/usr/bin/env bash
# Guardião dos WhatsApps (whatsapp-worker, jeff-wa-relay, jeff-sdrs). Cron a cada 5 min.
# Por quê: o Chrome do whatsapp-web.js cresce sem parar; em 01/10/2026 um chegou a 2,5 GB, o servidor (12 GB, sem swap)
# ficou sem memória e o kernel derrubou o PM2 inteiro. Restart do app mantém a sessão (LocalAuth no disco): não pede QR.
#   1. Chrome de um app passou do limite        -> restart daquele app
#   2. Servidor com pouca memória livre          -> restart do app com o maior Chrome
#   3. Madrugada (04h BRT), uma vez por dia      -> restart de cada app, um de cada vez (zera a memória acumulada)
# Proteção contra laço: o mesmo app não reinicia de novo em menos de 30 min.
# Alerta de WhatsApp só quando o restart FALHA (uma vez por dia por app). Restart que dá certo fica só no log.
# (Até 15/10/2026 o cron não achava o pm2: nenhum restart acontecia e o alerta "reiniciado" saía a cada 30 min.)
set -u
PM2=/usr/local/bin/pm2
LOG="/opt/jeff-worker/logs/wa-guardiao.log"
STATE="/opt/jeff-worker/data/wa-guardiao"
ALERTA="/opt/jeff-worker/scripts/wa-alerta.sh"
MIN_LIVRE_MB=900
mkdir -p "$STATE" "$(dirname "$LOG")"
log() { echo "$(TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S BRT') $*" >> "$LOG"; }

# app | pasta das sessões (user-data-dir do Chrome) | limite MB | minuto da janela das 04h BRT
APPS="whatsapp-worker|/opt/jeff-worker/data/.wwebjs_auth|1800|0
jeff-wa-relay|/opt/jeff-apps/jeff-wa-relay/session|1800|10
jeff-sdrs|/opt/jeff-apps/jeff-sdrs/sessions|2400|20"

# Memória (MB) de todos os processos Chrome de cada app, somando a árvore inteira (renderers não têm user-data-dir)
MEM=$(python3 - <<'EOF'
import os
procs={}
for p in os.listdir('/proc'):
    if not p.isdigit(): continue
    try:
        st=open(f'/proc/{p}/stat').read().rsplit(')',1)[1].split()
        rss=int(open(f'/proc/{p}/statm').read().split()[1])*os.sysconf('SC_PAGE_SIZE')//1048576
        cmd=open(f'/proc/{p}/cmdline','rb').read().replace(b'\0',b' ').decode(errors='ignore')
        procs[int(p)]=(int(st[1]),rss,cmd)
    except Exception: pass
raiz={}
for pid,(pp,rss,cmd) in procs.items():
    if 'user-data-dir=' in cmd:
        raiz[pid]=cmd.split('user-data-dir=')[1].split()[0]
tot={}
for pid,(pp,rss,cmd) in procs.items():
    cur,seen=pid,0
    while cur in procs and cur not in raiz and seen<20: cur=procs[cur][0]; seen+=1
    if cur in raiz: tot[raiz[cur]]=tot.get(raiz[cur],0)+rss
for d,m in tot.items(): print(d,m)
EOF
)
mem_app() { echo "$MEM" | awk -v p="$1" 'index($1,p)==1 {s+=$2} END {print s+0}'; }

reiniciar() { # app motivo
  local app="$1" motivo="$2" ult="$STATE/ultimo-$1"
  if [ -f "$ult" ] && [ $(( $(date +%s) - $(stat -c %Y "$ult") )) -lt 1800 ]; then log "$app: restart pulado (já reiniciou há menos de 30 min) — $motivo"; return 1; fi
  touch "$ult"
  log "$app: RESTART — $motivo"
  if "$PM2" restart "$app" >> "$LOG" 2>&1; then log "$app: reiniciado ok"; return 0; fi
  log "$app: FALHA no restart — $motivo"
  if [ "$(cat "$STATE/falha-$app" 2>/dev/null)" != "$HOJE" ]; then
    echo "$HOJE" > "$STATE/falha-$app"
    bash "$ALERTA" "guardiao-falha-$app" "[guardião] Não consegui reiniciar $app ($motivo). Precisa olhar no servidor: log em $LOG." >/dev/null 2>&1 &
  fi
  return 1
}

LIVRE=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
HORA=$(TZ=America/Sao_Paulo date +%H); MIN=$((10#$(TZ=America/Sao_Paulo date +%M))); HOJE=$(TZ=America/Sao_Paulo date +%F)
linha="livre=${LIVRE}MB"
maior_app=""; maior_mem=0

while IFS='|' read -r app pasta limite janela; do
  m=$(mem_app "$pasta"); linha="$linha $app=${m}MB"
  [ "$m" -gt "$maior_mem" ] && { maior_mem=$m; maior_app=$app; }
  if [ "$m" -gt "$limite" ]; then
    reiniciar "$app" "Chrome com ${m} MB (limite ${limite} MB)"
    continue
  fi
  # Restart noturno: 04h BRT a partir do minuto da janela, uma vez por dia
  if [ "$HORA" = "04" ] && [ "$MIN" -ge "$janela" ] && [ "$(cat "$STATE/noturno-$app" 2>/dev/null)" != "$HOJE" ]; then
    echo "$HOJE" > "$STATE/noturno-$app"
    reiniciar "$app" "restart noturno (zera a memória do Chrome; ${m} MB)"
  fi
done <<< "$APPS"

log "$linha"

if [ "$LIVRE" -lt "$MIN_LIVRE_MB" ] && [ -n "$maior_app" ]; then
  reiniciar "$maior_app" "servidor com só ${LIVRE} MB livres; maior Chrome: $maior_app (${maior_mem} MB)"
fi
wait
exit 0
