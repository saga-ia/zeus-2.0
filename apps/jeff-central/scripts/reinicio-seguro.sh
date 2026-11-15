#!/usr/bin/env bash
# Reinício seguro da jeff-central: só reinicia quando NADA estiver em andamento (resposta do Zeus no chat, rotina,
# publicação no LinkedIn, arte sendo gerada, time rodando, chat de vendas, ou qualquer processo filho como claude/ffmpeg).
# Se ficar ocupada além do limite, desiste e NÃO reinicia.
# Motivo: em 15/11/2026 um reinício cortou uma resposta do chat no meio ("isso não pode ocorrer" - Jeff).
#
# Uso: scripts/reinicio-seguro.sh [espera_max_segundos=900]
#   --checar   só mostra o que está rodando agora, não reinicia
set -u
APP=jeff-central
DB=/opt/jeff-apps/jeff-central/data/central.db
PORTA=3031
ESPERA_MAX=900
INTERVALO=5
SO_CHECAR=0
for a in "$@"; do
  case "$a" in
    --checar) SO_CHECAR=1 ;;
    ''|*[!0-9]*) echo "argumento desconhecido: $a" >&2; exit 2 ;;
    *) ESPERA_MAX=$a ;;
  esac
done

# Imprime uma linha por tipo de trabalho em andamento; nada = livre
ocupado() {
  local q
  while IFS='|' read -r rotulo sql; do
    local n
    n=$(sqlite3 -readonly -cmd ".timeout 3000" "$DB" "$sql" 2>/dev/null || echo "?")
    if [ "$n" != "0" ]; then echo "$rotulo: $n"; fi
  done <<'EOF'
resposta do Zeus no chat|SELECT count(*) FROM messages WHERE role='zeus' AND status='pending'
rotina rodando|SELECT count(*) FROM rotina_runs WHERE status='rodando'
post do LinkedIn publicando|SELECT count(*) FROM linkedin_posts WHERE status='publicando'
arte sendo gerada|SELECT count(*) FROM social_criacoes WHERE status='gerando'
time de agentes rodando|SELECT count(*) FROM team_runs WHERE status='running'
chat de vendas rodando|SELECT count(*) FROM vendas_chat WHERE status='rodando'
EOF
  local pid filhos
  pid=$(pm2 pid "$APP" 2>/dev/null)
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    filhos=$(ps --ppid "$pid" -o comm= 2>/dev/null | sort | uniq -c | awk '{printf "%s%s(%s)", (NR>1?", ":""), $2, $1}')
    [ -n "$filhos" ] && echo "processos trabalhando: $filhos"
  fi
}

agora() { TZ=America/Sao_Paulo date '+%H:%M:%S'; }

if [ "$SO_CHECAR" = 1 ]; then
  o=$(ocupado); if [ -z "$o" ]; then echo "[$(agora)] livre: nada em andamento"; else echo "[$(agora)] ocupada:"; echo "$o" | sed 's/^/  - /'; fi
  exit 0
fi

ini=$(date +%s); livres=0; ultimo=""
while :; do
  o=$(ocupado)
  if [ -z "$o" ]; then
    livres=$((livres + 1))
    # duas checagens seguidas livres (5 s) para não pegar um pedido que acabou de chegar
    if [ "$livres" -ge 2 ]; then break; fi
  else
    livres=0
    if [ "$o" != "$ultimo" ]; then echo "[$(agora)] esperando terminar:"; echo "$o" | sed 's/^/  - /'; ultimo="$o"; fi
  fi
  if [ $(( $(date +%s) - ini )) -ge "$ESPERA_MAX" ]; then
    echo "[$(agora)] continua ocupada depois de ${ESPERA_MAX}s. NÃO reiniciei. Tente de novo mais tarde." >&2
    exit 1
  fi
  sleep "$INTERVALO"
done

echo "[$(agora)] livre. Reiniciando $APP..."
pm2 restart "$APP" >/dev/null || { echo "pm2 restart falhou" >&2; exit 1; }
for i in $(seq 1 30); do
  c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORTA/" || true)
  if [ "$c" != "000" ]; then echo "[$(agora)] $APP no ar de novo (HTTP $c)."; exit 0; fi
  sleep 1
done
echo "[$(agora)] $APP não respondeu em 30 s depois do reinício. Veja: pm2 logs $APP" >&2
exit 1
