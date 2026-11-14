#!/usr/bin/env bash
# =====================================================================================
#  Atualizador do ZEUS no servidor do cliente
#
#  Roda pelo cron a cada 15 minutos (o instalar.sh põe no crontab). Pergunta ao servidor do Jeff qual versão
#  está APROVADA pra este cliente; se for diferente da instalada, aplica:
#    baixa (confere sha256) -> monta e personaliza numa pasta à parte -> copia por cima SEM apagar nada e com
#    cópia de segurança do que trocou -> dependências só dos apps que mudaram -> bancos/subdomínios/crons novos
#    -> reinicia só o que mudou -> confere se subiu. Se algo não subir, desfaz e avisa o Jeff (painel).
#  Nunca toca em: .env, bancos (.db), data/, logs/, sessões do WhatsApp, node_modules/venv.
#
#  Uso:  bash /opt/zeus-2.0/instalador/atualizar.sh            confere e aplica
#        bash /opt/zeus-2.0/instalador/atualizar.sh --status   só mostra a situação
#        bash /opt/zeus-2.0/instalador/atualizar.sh --forcar   tenta de novo uma versão que falhou
# =====================================================================================
set -Eeuo pipefail
ESTADO=/root/.zeus-instalador
CONF="$ESTADO/atualizacao.json"
RESP="$ESTADO/respostas.json"
BASE=/opt/zeus-atualizacao
LOG=/var/log/zeus-atualizar.log
NODE_BIN=/root/.nvm/versions/node/v20.20.2/bin
COMPOSE_APPS="jeff-evolution jeff-omniroute jeff-presenton jeff-moneyprinter"
export PATH="$NODE_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export DEBIAN_FRONTEND=noninteractive

MODO="${1:-}"
[ "$(id -u)" = 0 ] || { echo "rode como root"; exit 1; }
[ -f "$CONF" ] || { [ "$MODO" = --status ] && echo "servidor não registrado pras atualizações ($CONF não existe)"; exit 0; }
exec 9>/run/zeus-atualizar.lock
flock -n 9 || exit 0                         # já tem uma rodando

cfg() { python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")' "$CONF" "$1"; }
URL="$(cfg url)"; TOKEN="$(cfg token)"
INSTALADA="$(cfg versao_instalada)"
[ -n "$INSTALADA" ] || INSTALADA="$(tr -cd '0-9' < /opt/zeus-2.0/VERSAO 2>/dev/null || true)"
DOMINIO="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["dominio"])' "$RESP" 2>/dev/null || true)"
H="Authorization: Bearer $TOKEN"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG" >&2; }
relato() {  # relato <ok:true|false> <mensagem>
  python3 -I -c 'import json,sys; print(json.dumps({"v": sys.argv[1], "ok": sys.argv[2] == "true", "msg": sys.argv[3]}))' "$V" "$1" "$2" |
    curl -fsS -m 30 -X POST -H "$H" -H 'Content-Type: application/json' --data-binary @- "$URL/atualizar/relato" >/dev/null 2>&1 || true
}

ST="$(curl -fsS -m 30 -H "$H" "$URL/atualizar/status?instalada=${INSTALADA:-0}&dominio=$DOMINIO")" || { [ "$MODO" = --status ] && echo "sem contato com $URL"; exit 0; }
read -r V SHA < <(python3 -I -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("aprovada") or "-", d.get("sha256") or "-")' "$ST")
if [ "$MODO" = --status ]; then
  echo "instalada: v${INSTALADA:-?} | aprovada pelo Jeff: v$V | domínio: $DOMINIO"
  [ -f "$ESTADO/atualizacao-falhou" ] && echo "última falha: v$(cat "$ESTADO/atualizacao-falhou") (detalhes em $LOG)"
  exit 0
fi
[ "$V" != "-" ] && [ "$V" != "$INSTALADA" ] || exit 0
if [ "$MODO" != --forcar ] && [ "$(cat "$ESTADO/atualizacao-falhou" 2>/dev/null)" = "$V" ]; then exit 0; fi   # não insiste: espera o Jeff

# ------------------------------------------------------------------------------------
log "==> atualizando v${INSTALADA:-?} -> v$V"
mkdir -p "$BASE" && chmod 700 "$BASE"
TS="$(date +%Y%m%d-%H%M%S)"
BK="$BASE/backup-v$V-$TS"; STG="$BASE/stg-v$V"; NOVO="$BASE/v$V/zeus-2.0"
SINCRONIZADO=0; AFETADOS=()

desfaz() {
  trap - ERR; set +e
  local motivo="$1"
  log "FALHOU: $motivo"
  if [ "$SINCRONIZADO" = 1 ]; then
    log "desfazendo: devolvendo os arquivos trocados ($BK)"
    [ -d "$BK/jeff-worker" ] && rsync -a "$BK/jeff-worker/" /opt/jeff-worker/
    [ -d "$BK/jeff-apps" ] && rsync -a "$BK/jeff-apps/" /opt/jeff-apps/
    [ -d "$BK/agents" ] && rsync -a "$BK/agents/" /root/.claude/agents/
    [ -d "$BK/skills" ] && rsync -a "$BK/skills/" /root/.claude/skills/
    for n in "${AFETADOS[@]}"; do pm2 restart "$n" >/dev/null 2>&1 || true; done
    pm2 save >/dev/null 2>&1 || true
  fi
  echo "$V" > "$ESTADO/atualizacao-falhou"
  relato false "$motivo (o servidor voltou pra v${INSTALADA:-?}; log em $LOG)"
  exit 1
}
trap 'desfaz "erro inesperado na linha $LINENO"' ERR

# 1) baixa e confere
curl -fsS -m 1800 -H "$H" -o "$BASE/v$V.tar.gz.tmp" "$URL/atualizar/pacote/$V" || desfaz "não baixou o pacote"
[ "$(sha256sum "$BASE/v$V.tar.gz.tmp" | cut -d' ' -f1)" = "$SHA" ] || desfaz "pacote corrompido (sha256 não confere)"
mv "$BASE/v$V.tar.gz.tmp" "$BASE/v$V.tar.gz"
rm -rf "$BASE/v$V" && mkdir -p "$BASE/v$V" && tar -xzf "$BASE/v$V.tar.gz" -C "$BASE/v$V"
[ -d "$NOVO/worker" ] && [ -d "$NOVO/apps" ] || desfaz "pacote incompleto"

# 2) monta e personaliza à parte (mesmas chaves internas da instalação: estado/chaves.json)
rm -rf "$STG"; mkdir -p "$STG/opt/jeff-worker" "$STG/opt/jeff-apps" "$STG/root/.claude"
rsync -a "$NOVO/worker/" "$STG/opt/jeff-worker/"
rsync -a "$NOVO/apps/" "$STG/opt/jeff-apps/"
rsync -a "$NOVO/instalador/claude/agents" "$NOVO/instalador/claude/skills" "$STG/root/.claude/"
python3 -I - "$RESP" "$STG/resp.json" "$STG" "$NOVO/instalador/modelos" "$ESTADO" <<'PY'
import json,os,sys
d=json.load(open(sys.argv[1])); stg=sys.argv[3]
d.update({'raiz_opt':os.path.join(stg,'opt'),'raiz_root':os.path.join(stg,'root'),'modelos':sys.argv[4],'estado':sys.argv[5]})
with open(os.open(sys.argv[2],os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600),'w') as f: json.dump(d,f)
PY
python3 -I "$NOVO/instalador/lib/personalizar.py" "$STG/resp.json" >>"$LOG" 2>&1 || desfaz "personalização falhou"
rm -f "$STG/resp.json"

# .env: só de app NOVO (os que existem são do cliente e nunca são tocados)
for e in "$STG"/opt/jeff-apps/*/.env "$STG/opt/jeff-worker/.env"; do
  [ -f "$e" ] || continue
  vivo="/opt/${e#"$STG"/opt/}"
  [ -e "$vivo" ] || { mkdir -p "$(dirname "$vivo")"; install -m 600 "$e" "$vivo"; log "  .env novo: $vivo"; }
done

# arquivo que ainda tem segredo mascarado (<REDACTED>) não substitui o do cliente (que tem a chave de verdade)
EXC="$STG/exclui.txt"
cat > "$EXC" <<'EOF'
.env
.env.*
data/
logs/
node_modules/
venv/
.venv/
.wwebjs_auth/
.wwebjs_cache/
*.db
*.db-*
*.sqlite*
EOF
( cd "$STG/opt" && grep -rlI --exclude-dir=node_modules -F '<REDACTED>' jeff-worker jeff-apps 2>/dev/null || true ) |
  while read -r f; do [ -e "/opt/$f" ] && echo "/${f#*/}"; done >> "$EXC"

# Personalizações do cliente que o pacote sobrescreveria (feitas no suporte, direto no servidor dele):
#  - CLAUDE.md do worker: regras e integrações do cliente; o do servidor fica como está
#  - .claude/settings.json do worker: as permissões dele somam com as do produto (nada é tirado)
#  - números que estavam fixos no agent-runner.sh antigo: vão pra data/agent-whitelist-extra.txt (o novo lê de lá)
echo "/CLAUDE.md" >> "$EXC"
W=/opt/jeff-worker
if [ -f "$W/scripts/agent-runner.sh" ] && grep -q "contact_phone IN ('" "$W/scripts/agent-runner.sh"; then
  mkdir -p "$W/data"
  { cat "$W/data/agent-whitelist-extra.txt" 2>/dev/null; grep -oE "contact_phone IN \([^)]*\)" "$W/scripts/agent-runner.sh" | grep -oE "[0-9]{10,13}"; } |
    sort -u > "$W/data/agent-whitelist-extra.txt.novo" && mv "$W/data/agent-whitelist-extra.txt.novo" "$W/data/agent-whitelist-extra.txt"
  log "  whitelist do agent-runner antigo guardada em data/agent-whitelist-extra.txt"
fi
if [ -f "$W/.claude/settings.json" ] && [ -f "$STG/opt/jeff-worker/.claude/settings.json" ]; then
  python3 -I - "$W/.claude/settings.json" "$STG/opt/jeff-worker/.claude/settings.json" <<'PYSET' || log "  aviso: não deu pra somar as permissões do settings.json"
import json,sys
vivo=json.load(open(sys.argv[1])); novo=json.load(open(sys.argv[2]))
a=novo.setdefault('permissions',{}).setdefault('allow',[])
for x in vivo.get('permissions',{}).get('allow',[]):
    if x not in a: a.append(x)
json.dump(novo,open(sys.argv[2],'w'),ensure_ascii=False,indent=2)
PYSET
fi

# 3) aplica por cima (sem apagar nada), guardando o que foi trocado
sinc() {  # sinc <origem> <destino> <nome no backup>
  rsync -rlptD --checksum --itemize-changes --exclude-from="$EXC" --backup --backup-dir="$BK/$3" "$1/" "$2/" |
    awk '/^>f/ {sub(/^[^ ]+ /, ""); print}' | sed "s#^#$3/#"
}
SINCRONIZADO=1
MUDOU="$( { sinc "$STG/opt/jeff-worker" /opt/jeff-worker jeff-worker
            sinc "$STG/opt/jeff-apps" /opt/jeff-apps jeff-apps
            sinc "$STG/root/.claude/agents" /root/.claude/agents agents
            sinc "$STG/root/.claude/skills" /root/.claude/skills skills; } )"
N_MUDOU="$(printf '%s\n' "$MUDOU" | grep -c . || true)"
log "  $N_MUDOU arquivo(s) atualizado(s)"
printf '%s\n' "$MUDOU" >> "$LOG"
rsync -a --ignore-existing "$NOVO/instalador/claude/memoria/" /root/.claude/projects/-opt-jeff-worker/memory/ 2>/dev/null || true

# apps que mudaram de verdade (jeff-worker conta como um); só texto (.md, docs/, projetos/) não reinicia nada
mapfile -t APPS_MUDARAM < <(printf '%s\n' "$MUDOU" | grep -vE '\.md$|/docs/|/projetos/|^jeff-worker/zeus/' |
  awk -F/ '$1=="jeff-worker"{print "jeff-worker"} $1=="jeff-apps" && NF>2 {print $2}' | sort -u)
dir_de() { [ "$1" = jeff-worker ] && echo /opt/jeff-worker || echo "/opt/jeff-apps/$1"; }

# 4) dependências só de quem mudou
for a in "${APPS_MUDARAM[@]}"; do
  d="$(dir_de "$a")"
  [[ " $COMPOSE_APPS " == *" $a "* ]] && { log "  $a roda em container: a imagem só muda com rebuild manual"; continue; }
  pref="$([ "$a" = jeff-worker ] && echo jeff-worker || echo "jeff-apps/$a")"
  if [ -f "$d/package.json" ] && { printf '%s\n' "$MUDOU" | grep -qxE "$pref/(package\.json|package-lock\.json)" || [ ! -d "$d/node_modules" ]; }; then
    log "  npm: $a"
    ( cd "$d" && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund || npm install --no-audit --no-fund; else npm install --no-audit --no-fund; fi ) >>"$LOG" 2>&1 \
      || desfaz "dependências npm de $a não instalaram"
  fi
  if [ -f "$d/requirements.txt" ] && { printf '%s\n' "$MUDOU" | grep -qxF "$pref/requirements.txt" || [ ! -x "$d/venv/bin/python" ]; }; then
    log "  pip: $a"
    { [ -x "$d/venv/bin/python" ] || python3 -m venv "$d/venv"; } >>"$LOG" 2>&1 && "$d/venv/bin/pip" install -q -r "$d/requirements.txt" >>"$LOG" 2>&1 \
      || desfaz "dependências Python de $a não instalaram"
  fi
done

# 5) bancos de app novo e configurações padrão novas (o que já existe não é tocado)
python3 -I "$NOVO/instalador/lib/bancos.py" "$NOVO/instalador/modelos" >>"$LOG" 2>&1 || log "  atenção: bancos.py falhou (ver log)"

# 6) reinicia só os processos dos apps que mudaram; sobe os processos novos
declare -A REINICIOS
if [ ${#APPS_MUDARAM[@]} -gt 0 ]; then
  mapfile -t AFETADOS < <(pm2 jlist | python3 -I -c '
import json,sys
mud=set(sys.argv[1:])
for p in json.load(sys.stdin):
    e=p.get("pm2_env") or {}
    for c in (e.get("pm_exec_path") or "", (e.get("pm_cwd") or "")+"/"):
        a="jeff-worker" if c.startswith("/opt/jeff-worker/") else (c.split("/")[3] if c.startswith("/opt/jeff-apps/") else None)
        if a in mud: print(p["name"]); break' "${APPS_MUDARAM[@]}")
fi
while IFS=$'\t' read -r nome status cwd script interp args eco; do
  [[ "$nome" =~ ^# ]] || [ "$status" != online ] && continue
  pm2 describe "$nome" >/dev/null 2>&1 && continue
  a_dir="$(printf '%s\n%s\n' "$script" "$cwd/" | sed -n 's#^/opt/jeff-apps/\([^/]*\)/.*#\1#p' | head -1)"
  [ -z "$a_dir" ] || [ -d "/opt/jeff-apps/$a_dir" ] || continue
  log "  processo novo: $nome"
  if [ "$eco" != "-" ] && [ -f "$eco" ]; then (cd "$(dirname "$eco")" && pm2 start "$eco" --only "$nome") >>"$LOG" 2>&1 || desfaz "processo novo $nome não subiu"
  elif [ -f "$script" ]; then
    cmd=(pm2 start "$script" --name "$nome" --cwd "$cwd" --interpreter "$interp")
    if [ "$args" != "-" ]; then read -ra extra <<< "$args"; cmd+=(-- "${extra[@]}"); fi
    (cd "$cwd" 2>/dev/null || cd /root; "${cmd[@]}") >>"$LOG" 2>&1 || desfaz "processo novo $nome não subiu"
  else continue; fi
  AFETADOS+=("$nome")
done < "$NOVO/instalador/modelos/pm2.tsv"

reinicios() { pm2 jlist | python3 -I -c 'import json,sys; [print(p["name"], (p.get("pm2_env") or {}).get("restart_time",0)) for p in json.load(sys.stdin)]'; }
while read -r n r; do REINICIOS[$n]=$r; done < <(reinicios)
for n in "${AFETADOS[@]}"; do
  log "  reiniciando $n"
  pm2 restart "$n" >>"$LOG" 2>&1 || desfaz "pm2 não reiniciou $n"
done

# 7) confere: cada processo afetado online e sem ficar reiniciando
if [ ${#AFETADOS[@]} -gt 0 ]; then
  sleep 25
  ruins=()
  while read -r n r; do
    for a in "${AFETADOS[@]}"; do
      [ "$a" = "$n" ] || continue
      s="$(pm2 jlist | python3 -I -c 'import json,sys; print(next(((p.get("pm2_env") or {}).get("status") for p in json.load(sys.stdin) if p["name"]==sys.argv[1]),"?"))' "$n")"
      if [ "$s" != online ] || [ $((r - ${REINICIOS[$n]:-0})) -gt 3 ]; then ruins+=("$n ($s)"); fi
    done
  done < <(reinicios)
  [ ${#ruins[@]} -eq 0 ] || desfaz "não ficaram de pé: ${ruins[*]}"
fi
pm2 save >/dev/null 2>&1 || true
trap - ERR

# 8) extras que não derrubam a atualização: subdomínios e rotinas novas
python3 -I "$NOVO/instalador/lib/npm_proxy.py" "$RESP" "$NOVO/instalador/modelos/hosts.tsv" "$(curl -fsS -m 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')" "" >>"$LOG" 2>&1 \
  || log "  atenção: algum subdomínio novo não configurou (ver log)"
ATUAL="$(crontab -l 2>/dev/null || true)"
printf '%s\n' "$ATUAL" > "$BASE/crontab-atual.txt"
NOVAS="$(python3 -I - "$NOVO/docs/crontab-snapshot.txt" "$BASE/crontab-atual.txt" <<'PY' 2>/dev/null || true
import sys
atual=open(sys.argv[2]).read()
cmd=lambda l: ' '.join(l.split()[5:])
tem={cmd(l) for l in atual.splitlines() if l.strip() and not l.lstrip().startswith('#')}
tem|={cmd(l.lstrip('# ').replace('fora do perfil: ','')) for l in atual.splitlines() if l.lstrip().startswith('#')}
for l in open(sys.argv[1]):
    l=l.rstrip('\n')
    if l.strip() and not l.startswith('#') and len(l.split())>5 and cmd(l) not in tem: print(l)
PY
)"
if [ -n "$NOVAS" ]; then printf '%s\n# rotinas novas da v%s\n%s\n' "$ATUAL" "$V" "$NOVAS" | crontab -; log "  $(printf '%s\n' "$NOVAS" | wc -l) rotina(s) nova(s) no crontab"; fi

# 9) pronto: guarda a versão nova do instalador e limpa o que é velho
rm -rf /opt/zeus-2.0.antigo; [ -d /opt/zeus-2.0 ] && mv /opt/zeus-2.0 /opt/zeus-2.0.antigo
mv "$NOVO" /opt/zeus-2.0; rm -rf "$BASE/v$V" "$STG"
python3 -I - "$CONF" "$V" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); d['versao_instalada']=sys.argv[2]; json.dump(d,open(sys.argv[1],'w'))
PY
rm -f "$ESTADO/atualizacao-falhou" "$BASE/crontab-atual.txt"
ls -dt "$BASE"/backup-v* 2>/dev/null | tail -n +4 | xargs -r rm -rf
ls -t "$BASE"/v*.tar.gz 2>/dev/null | tail -n +3 | xargs -r rm -f
RESUMO="$N_MUDOU arquivo(s); apps: ${APPS_MUDARAM[*]:-nenhum}; reiniciados: ${AFETADOS[*]:-nenhum}"
log "ok: v$V aplicada ($RESUMO)"
relato true "$RESUMO"
