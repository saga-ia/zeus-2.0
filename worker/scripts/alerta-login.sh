# shellcheck shell=bash
# Alerta de login do Claude (carregado pelo agent-runner.sh com "source").
# Se o claude -p falhar por autenticação, o Zeus fica mudo. Este bloco:
#   - avisa o suporte no WhatsApp (1x a cada 30 min enquanto continuar fora);
#   - avisa o dono no WhatsApp 1x por queda, se ele tiver mensagem esperando;
#   - manda email pro suporte e pro dono pedindo pra conectar novamente (na queda, a cada 6h e na volta).
#
# Dados do cliente: lidos do /root/.claude/CLAUDE.md que o instalador escreve
# ("pertence a **X**", "Dono ... **Nome (55...)**", "Domínio deste servidor", "Acesso à Central").
# Qualquer um pode ser trocado no .env do worker:
#   ALERTA_CLIENTE, ALERTA_DOMINIO, ALERTA_DONO_WA, ALERTA_DONO_EMAIL,
#   ALERTA_SUPORTE_WA (espaço ou vírgula), ALERTA_SUPORTE_EMAIL, ALERTA_EMAILS (lista final, substitui tudo),
#   EMAIL_ALERTA_CONTA (conta Google conectada que envia; padrão: a 1a de google_oauth_tokens).
# Precisa de: $WORKER_DIR, $LOG_DIR, $LOG, $DB e a função log().

_alerta_env() { sed -n "s/^$1=//p" "$WORKER_DIR/.env" 2>/dev/null | tail -n1 | tr -d "\"'"; }
_ALERTA_MD="/root/.claude/CLAUDE.md"
_alerta_md() { python3 -I - "$_ALERTA_MD" "$1" <<'PY' 2>/dev/null
import re, sys
try: t = open(sys.argv[1], encoding='utf-8').read()
except OSError: sys.exit()
pad = {
  'cliente': r'pertence a \*\*(.+?)\*\*',
  'dono_wa': r'Dono com autoriza[cç][aã]o total: \*\*.*?\((\d{10,15})\)\*\*',
  'dominio': r'Dom[ií]nio deste servidor: \*\*(.+?)\*\*',
  'dono_email': r'Acesso [àa] Central: ([^\s,;]+@[^\s,;]+?)\.?(?:\s|$)',
}[sys.argv[2]]
m = re.search(pad, t)
print(m.group(1).strip() if m else '')
PY
}

ALERTA_CLIENTE="$(_alerta_env ALERTA_CLIENTE)";       ALERTA_CLIENTE="${ALERTA_CLIENTE:-$(_alerta_md cliente)}"
ALERTA_DOMINIO="$(_alerta_env ALERTA_DOMINIO)";       ALERTA_DOMINIO="${ALERTA_DOMINIO:-$(_alerta_md dominio)}"
ALERTA_DONO_WA="$(_alerta_env ALERTA_DONO_WA)";       ALERTA_DONO_WA="${ALERTA_DONO_WA:-$(_alerta_md dono_wa)}"
ALERTA_DONO_EMAIL="$(_alerta_env ALERTA_DONO_EMAIL)"; ALERTA_DONO_EMAIL="${ALERTA_DONO_EMAIL:-$(_alerta_md dono_email)}"
ALERTA_SUPORTE_WA="$(_alerta_env ALERTA_SUPORTE_WA | tr ',' ' ')"
ALERTA_SUPORTE_WA="${ALERTA_SUPORTE_WA:-5511910075450 5585991143501}"
ALERTA_SUPORTE_EMAIL="$(_alerta_env ALERTA_SUPORTE_EMAIL)"
ALERTA_SUPORTE_EMAIL="${ALERTA_SUPORTE_EMAIL:-vinicius.carvalho.profissional@gmail.com}"
ALERTA_EMAILS="$(_alerta_env ALERTA_EMAILS | tr ',' ' ')"
ALERTA_EMAILS="${ALERTA_EMAILS:-$ALERTA_SUPORTE_EMAIL $ALERTA_DONO_EMAIL}"
ALERTA_CLIENTE="${ALERTA_CLIENTE:-este cliente}"
ALERTA_DOMINIO="${ALERTA_DOMINIO:-$(hostname -f 2>/dev/null || hostname)}"
export EMAIL_ALERTA_CONTA="${EMAIL_ALERTA_CONTA:-$(_alerta_env EMAIL_ALERTA_CONTA)}"
export EMAIL_ALERTA_NOME="Zeus $ALERTA_CLIENTE"

AUTH_STATE="$LOG_DIR/.agent-auth-fail"   # linha 1: 1a falha | linha 2: último WhatsApp | linha 3: último email (epoch)
AUTH_RE='not logged in|please run /login|oauth token (has )?expired|invalid api key|authentication_error|invalid x-api-key|401 unauthorized'

wa_private() { # phone body
  local j; j=$(python3 -c 'import json,sys; print(json.dumps({"to":sys.argv[1],"body":sys.argv[2]}))' "$1" "$2")
  "$WORKER_DIR/scripts/wapi.sh" POST /messages/private "$j" >/dev/null 2>>"$LOG" || log "alerta: falha ao enviar pra $1"
}

email_alerta() { # assunto corpo
  [ -n "${ALERTA_EMAILS// /}" ] || { log "email: sem destinatário"; return 1; }
  local out ec
  # shellcheck disable=SC2086
  out=$(timeout 60 python3 "$WORKER_DIR/scripts/email-alerta.py" "$1" "$2" $ALERTA_EMAILS 2>&1); ec=$?
  log "email: $out"
  return $ec
}

auth_fail() { # pending_count msg_ids
  local now first last last_mail; now=$(date +%s)
  if [ -f "$AUTH_STATE" ]; then
    first=$(sed -n 1p "$AUTH_STATE"); last=$(sed -n 2p "$AUTH_STATE"); last_mail=$(sed -n 3p "$AUTH_STATE")
  else first=$now; last=0; last_mail=0; fi
  first=${first:-$now}; last=${last:-0}; last_mail=${last_mail:-0}

  if [ $((now - last)) -ge 1800 ]; then
    local desde; desde=$(TZ=America/Sao_Paulo date -d "@$first" '+%d/%m %H:%M')
    for p in $ALERTA_SUPORTE_WA; do
      wa_private "$p" "[ALERTA ZEUS $ALERTA_DOMINIO] Claude Code deslogado: o agente parou de responder desde $desde BRT ($1 msg(s) na fila, ids $2). Corrigir: abrir o terminal do servidor, rodar claude e fazer /login. Log: $LOG"
    done
    log "alerta de login enviado ao suporte (falhando desde $desde BRT)"
    last=$now
  fi

  if [ ! -f "$AUTH_STATE" ] && [ -n "$ALERTA_DONO_WA" ] && [ -n "$2" ]; then
    local dono_pend; dono_pend=$(sqlite3 "$DB" "SELECT COUNT(*) FROM messages WHERE id IN ($2) AND substr(contact_phone,-8)='${ALERTA_DONO_WA: -8}';" 2>/dev/null || echo 0)
    if [ "${dono_pend:-0}" -gt 0 ]; then
      wa_private "$ALERTA_DONO_WA" "Tive um problema técnico aqui e já estou resolvendo. Recebi suas mensagens e te respondo assim que normalizar."
      log "aviso de instabilidade enviado pro dono"
    fi
  fi

  if [ $((now - last_mail)) -ge 21600 ]; then
    local desde_m lembrete=""; desde_m=$(TZ=America/Sao_Paulo date -d "@$first" '+%d/%m/%Y às %H:%M')
    [ "$last_mail" -gt 0 ] && lembrete="[LEMBRETE] "
    if email_alerta "${lembrete}Zeus $ALERTA_CLIENTE desconectado do Claude: é preciso conectar novamente" \
"Olá,

O Zeus da $ALERTA_CLIENTE está desconectado da conta do Claude desde $desde_m (horário de Brasília) e por isso parou de responder as mensagens no WhatsApp.

Há $1 mensagem(ns) aguardando resposta. Nenhuma mensagem se perde: assim que a conexão voltar, o Zeus responde todas automaticamente.

O QUE FAZER: é preciso conectar novamente a conta do Claude.
1. Acesse o terminal do servidor $ALERTA_DOMINIO.
2. Rode o comando: claude
3. Digite /login e siga o link para entrar na conta do Claude.
4. Pronto. O Zeus volta a responder sozinho em até 1 minuto.

Se você não tem acesso ao servidor, chame o suporte da Alpha Digital no WhatsApp que fazemos a reconexão com você.

Enquanto continuar desconectado, este aviso é repetido a cada 6 horas.

Zeus $ALERTA_CLIENTE (aviso automático)"; then
      last_mail=$now
    else
      last_mail=$((now - 21600 + 1800))   # falhou: tenta de novo em 30 min
    fi
  fi
  printf '%s\n%s\n%s\n' "$first" "$last" "$last_mail" > "$AUTH_STATE"
}

auth_ok() {
  [ -f "$AUTH_STATE" ] || return 0
  local first mailed desde
  first=$(sed -n 1p "$AUTH_STATE"); mailed=$(sed -n 3p "$AUTH_STATE"); rm -f "$AUTH_STATE"
  desde=$(TZ=America/Sao_Paulo date -d "@${first:-$(date +%s)}" '+%d/%m %H:%M')
  for p in $ALERTA_SUPORTE_WA; do
    wa_private "$p" "[OK ZEUS $ALERTA_DOMINIO] Claude Code voltou a responder (estava fora desde $desde BRT)."
  done
  if [ "${mailed:-0}" -gt 0 ]; then
    email_alerta "Zeus $ALERTA_CLIENTE conectado novamente" \
"Olá,

O Zeus da $ALERTA_CLIENTE voltou a se conectar ao Claude e já está respondendo normalmente (estava fora desde $desde, horário de Brasília). As mensagens que ficaram na fila estão sendo respondidas agora.

Não é preciso fazer mais nada.

Zeus $ALERTA_CLIENTE (aviso automático)"
  fi
  log "login normalizado, aviso de retorno enviado"
}
