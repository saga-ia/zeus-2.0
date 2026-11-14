#!/usr/bin/env bash
# Relatório de diagnóstico do Zeus no servidor do cliente -> servidor do Jeff (zeus-instalacao).
#
#   bash /opt/zeus-2.0/instalador/relatorio.sh "o que deu errado (opcional)"
#   curl -fsSL https://zeus-instalacao.jefersonhenrike.com/relatorio.sh | bash -s -- "o que deu errado"
#
# Junta: etapas feitas, avisos, fim do log do instalador, processos PM2 (e o erro dos que caíram), containers,
# estado do WhatsApp do Zeus, Chromium, DNS/SSL, disco e memória. Tudo passa por um filtro que apaga tokens,
# senhas e chaves antes de sair do servidor. Usa o token de atualização deste servidor
# (/root/.zeus-instalador/atualizacao.json). Sem token, envia anônimo (limitado) e avisa.
# Também roda sozinho no fim do instalar.sh.
set -uo pipefail
NOTA="${1:-}"
ESTADO=/root/.zeus-instalador
LOG=/var/log/zeus-instalador.log
ATU="$ESTADO/atualizacao.json"
URL_PADRAO="https://zeus-instalacao.jefersonhenrike.com"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/relatorio.txt"

[ "$(id -u)" = 0 ] || { echo "Rode como root."; exit 1; }
jv() { python3 -I -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")
except Exception: print("")' "$1" "$2" 2>/dev/null; }
URL="$(jv "$ATU" url)"; URL="${URL:-$URL_PADRAO}"; TOKEN="$(jv "$ATU" token)"
sec() { printf '\n===== %s =====\n' "$*"; }
run() { timeout "${T:-20}" bash -c "$*" 2>&1 | tail -n "${N:-200}"; }

{
  sec "identificação"
  echo "gerado_utc: $(date -u '+%Y-%m-%d %H:%M:%S')"
  echo "hostname: $(hostname)"
  echo "so: $(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-?}") · kernel $(uname -r)"
  echo "versao_instalada: $(jv "$ATU" versao_instalada)"
  echo "dominio: $(jv "$ESTADO/respostas.json" dominio)"
  echo "cliente: $(jv "$ESTADO/respostas.json" cliente)"
  echo "ip_publico: $(curl -4fsS -m 8 https://api.ipify.org 2>/dev/null || echo '?')"
  echo "uptime: $(uptime -p 2>/dev/null)"
  [ -n "$NOTA" ] && echo "nota: $NOTA"

  sec "recursos"
  free -m 2>&1; df -h / 2>&1 | tail -n 1; nproc

  sec "etapas do instalador"
  echo "feitas: $(ls "$ESTADO" 2>/dev/null | sed -n 's/^feito\.//p' | tr '\n' ' ')"
  sec "avisos do instalador"
  [ -f "$ESTADO/avisos.txt" ] && sort -u "$ESTADO/avisos.txt" || echo "(nenhum)"

  sec "log do instalador (últimas 250 linhas, sem cores)"
  [ -f "$LOG" ] && tail -n 250 "$LOG" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | tr -d '\r' || echo "(sem log)"

  sec "pm2"
  pm2 jlist 2>/dev/null | python3 -I -c 'import json,sys
for p in json.load(sys.stdin):
    e=p["pm2_env"]; print("%-32s %-9s restarts=%-5s mem=%sMB" % (p["name"], e["status"], e.get("restart_time",0), round((p.get("monit") or {}).get("memory",0)/1e6)))' 2>&1 || echo "(pm2 indisponível)"
  for n in $(pm2 jlist 2>/dev/null | python3 -I -c 'import json,sys
for p in json.load(sys.stdin):
    e=p["pm2_env"]
    if e["status"]!="online" or e.get("restart_time",0)>5 or p["name"]=="whatsapp-worker": print(p["name"])' 2>/dev/null); do
    sec "pm2 logs $n (erro e saída, 60 linhas)"
    # só aviso/erro (nível >= 40 ou texto solto), linhas repetidas viram uma com contagem
    T=20 timeout 20 pm2 logs "$n" --lines 300 --nostream --raw 2>&1 | python3 -I -c 'import sys,re,json,collections
c=collections.OrderedDict()
for l in sys.stdin:
    l=re.sub(r"^\d{4}-\d\d-\d\dT[\d:.]+Z?:\s*","",l.rstrip())
    if not l or l.startswith(("[TAILING]","/root/.pm2/logs")): continue
    if l.startswith("{"):
        try:
            d=json.loads(l)
            if int(d.get("level",50))<40: continue
            er=d.get("err") or ""; er=er.get("message","") if isinstance(er,dict) else er
            l=("[%s] %s %s" % (d.get("level"), d.get("msg",""), er)).strip()
        except Exception: pass
    c[l]=c.get(l,0)+1
for l,n in list(c.items())[-60:]: print(("(%dx) " % n if n>1 else "")+l[:400])'
  done

  sec "docker"
  run "docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}'"

  sec "whatsapp do zeus"
  WENV=/opt/jeff-worker/.env
  WH="$(sed -n 's/^HOST=//p' "$WENV" 2>/dev/null | tr -d "\"'")"; case "$WH" in ''|0.0.0.0) WH=127.0.0.1 ;; esac
  WP="$(sed -n 's/^PORT=//p' "$WENV" 2>/dev/null | tr -d "\"'")"; WP="${WP:-3002}"
  WT="$(sed -n 's/^API_TOKEN=//p' "$WENV" 2>/dev/null | tr -d "\"'")"
  echo "health: $(curl -sS -m 10 "http://$WH:$WP/health" 2>&1 | head -c 600)"
  echo "status: $(curl -sS -m 10 -H "Authorization: Bearer $WT" -H "x-api-token: $WT" "http://$WH:$WP/status" 2>&1 | head -c 1500)"
  echo "qr: $(curl -sS -m 10 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $WT" -H "x-api-token: $WT" "http://$WH:$WP/qr?format=svg" 2>&1)"
  CHR="$(sed -n 's/^CHROMIUM_PATH=//p' "$WENV" 2>/dev/null | tr -d "\"'")"; CHR="${CHR:-/usr/bin/chromium}"
  echo "chromium: $CHR -> $(readlink -f "$CHR" 2>/dev/null) · $(timeout 15 "$CHR" --version 2>&1 | head -n 2 | tr '\n' ' ')"
  echo "chromium rodando: $(pgrep -c -f 'chrom' 2>/dev/null || echo 0) processos"
  echo "sessão (.wwebjs_auth): $(du -sh /opt/jeff-worker/.wwebjs_auth 2>/dev/null | cut -f1 || echo 'não existe')"
  echo "/dev/shm: $(df -h /dev/shm 2>/dev/null | tail -n 1)"

  sec "rede, dns e ssl"
  echo "resolv.conf: $(grep -E '^nameserver' /etc/resolv.conf 2>/dev/null | tr '\n' ' ')"
  D="$(jv "$ESTADO/respostas.json" dominio)"
  if [ -n "$D" ]; then
    for h in "$D" "sagazeus.$D"; do
      echo "$h: getent=$(timeout 8 getent hosts "$h" | awk '{print $1}' | head -1) · 1.1.1.1=$(timeout 8 dig +short +time=3 +tries=1 A "$h" @1.1.1.1 2>/dev/null | head -1) · https=$(curl -sS -m 12 -o /dev/null -w '%{http_code}' "https://$h/" 2>&1 | tail -c 120)"
    done
  fi
  echo "ufw: $(ufw status 2>/dev/null | head -n 1)"
  echo "portas: $(ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -n | uniq | tr '\n' ' ')"
} > "$OUT" 2>&1

# filtro de sigilo: nada de token, senha, chave ou cookie sai do servidor
python3 -I - "$OUT" <<'PY'
import re,sys
f=sys.argv[1]; t=open(f,encoding='utf-8',errors='replace').read()
t=re.sub(r'(?i)((?:token|secret|senha|password|passwd|pass|api[_-]?key|apikey|key|bearer|authorization|cookie|session|credential|client_secret|access_token|refresh_token)[\w-]*["\']?\s*[:=]\s*["\']?)([^\s"\',;&]{4,})', r'\1[oculto]', t)
t=re.sub(r'(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}', r'\1 [oculto]', t)
for p in [r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}', r'\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}', r'\bsk-ant-[A-Za-z0-9_-]{10,}',
          r'\bgsk_[A-Za-z0-9]{16,}', r'\bAIza[0-9A-Za-z_-]{20,}', r'\b(?:EAA|IGAA|IGQV)[A-Za-z0-9]{20,}', r'\bgh[pousr]_[A-Za-z0-9]{20,}',
          r'\bxox[abpr]-[A-Za-z0-9-]{10,}', r'\b[a-f0-9]{32,}\b', r'\b[A-Za-z0-9+/_-]{40,}={0,2}']:
    t=re.sub(p,'[oculto]',t)
t=re.sub(r'(://[^/\s:@]+:)[^@\s/]+@', r'\1[oculto]@', t)
# telefones de terceiros (conversas): mantém DDI+DDD, esconde o resto
t=re.sub(r'(?<![\d.])(\+?\d{4})\d{6,11}(?![\d.])', r'\1******', t)
open(f,'w',encoding='utf-8').write(t[:900000])
PY

TAM="$(wc -c < "$OUT")"
if [ "${ZEUS_RELATORIO_LOCAL:-0}" = 1 ]; then cat "$OUT"; exit 0; fi
H=(-H "Content-Type: text/plain; charset=utf-8")
[ -n "$TOKEN" ] && H+=(-H "Authorization: Bearer $TOKEN") || echo "aviso: servidor sem token de atualização; o relatório vai como anônimo"
R="$(curl -sS -m 60 -X POST "${H[@]}" --data-binary @"$OUT" "$URL/relatorio" 2>&1)"
if printf '%s' "$R" | grep -q '"ok":true'; then
  echo "Relatório enviado ($((TAM / 1024)) KB): $(printf '%s' "$R" | python3 -I -c 'import json,sys;print(json.load(sys.stdin).get("id",""))' 2>/dev/null)"
else
  cp "$OUT" /root/zeus-relatorio.txt && chmod 600 /root/zeus-relatorio.txt
  echo "Não consegui enviar o relatório ($R). Ficou salvo em /root/zeus-relatorio.txt"
fi
