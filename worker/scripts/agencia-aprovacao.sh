#!/usr/bin/env bash
# Helper de aprovacao da agencia (Fase 5 — Alpha Digital).
# Gerencia fila de acoes "vermelhas" que precisam OK do Jeff.
#
# Tabela: agencia_aprovacoes_pendentes
# Log:    agencia_acoes_log (insere no concluir)
#
# Uso:
#   agencia-aprovacao.sh criar  <AGENTE> "<ACAO>" ['<PAYLOAD_JSON>'] ["<CONTEXTO>"]
#   agencia-aprovacao.sh listar [pendente|aprovada|rejeitada|expirada|all]
#   agencia-aprovacao.sh mostrar  <N>
#   agencia-aprovacao.sh aprovar  <N>
#   agencia-aprovacao.sh rejeitar <N> "<MOTIVO>"
#   agencia-aprovacao.sh concluir <N> "<RESULTADO>"
#
# Env opcional:
#   JEFF_PHONE  default 5511910075450
#   DRY_RUN     se "1", nao envia DM
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="$SCRIPT_DIR/../data/worker.db"
WAPI="$SCRIPT_DIR/wapi.sh"
JEFF_PHONE="${JEFF_PHONE:-5511910075450}"

# ----- helpers -----
sql_escape() { printf "%s" "$1" | sed "s/'/''/g"; }
q() { sqlite3 "$DB" "$@"; }

dm_jeff() {
  local body="$1"
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "[DRY_RUN] DM Jeff: $body" >&2
    return
  fi
  local payload
  payload=$(jq -n --arg to "$JEFF_PHONE" --arg body "$body" '{to:$to, body:$body}')
  "$WAPI" POST /messages/private "$payload" >/dev/null
}

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

# ----- subcomandos -----
case "${1:-}" in
  criar)
    [ $# -ge 3 ] || usage
    AGENTE="$2"; ACAO="$3"; PAYLOAD="${4:-{\}}"; CONTEXTO="${5:-}"
    A_E=$(sql_escape "$AGENTE"); ACAO_E=$(sql_escape "$ACAO")
    C_E=$(sql_escape "$CONTEXTO"); P_E=$(sql_escape "$PAYLOAD")
    id=$(q "INSERT INTO agencia_aprovacoes_pendentes (agente, acao, contexto, payload_json) VALUES ('$A_E','$ACAO_E', NULLIF('$C_E',''), NULLIF('$P_E','{}')); SELECT last_insert_rowid();")
    msg="Pedido #$id ($AGENTE)
Acao: $ACAO"
    [ -n "$CONTEXTO" ] && msg="$msg
Contexto: $CONTEXTO"
    msg="$msg

Responda: ok $id  |  nao $id <motivo>"
    dm_jeff "$msg"
    echo "id=$id status=pendente agente=$AGENTE DM=enviada"
    ;;

  listar)
    filtro="${2:-pendente}"
    if [ "$filtro" = "all" ]; then
      where=""
    else
      where="WHERE status='$(sql_escape "$filtro")'"
    fi
    sqlite3 -separator "  |  " "$DB" \
      "SELECT id, status, agente, substr(acao,1,60) AS acao, datetime(created_at,'-3 hours') AS ts_brt
       FROM agencia_aprovacoes_pendentes $where
       ORDER BY created_at DESC LIMIT 30;"
    ;;

  mostrar)
    N="${2:?id obrigatorio}"
    sqlite3 -line "$DB" "SELECT * FROM agencia_aprovacoes_pendentes WHERE id=$N;"
    ;;

  aprovar)
    N="${2:?id obrigatorio}"
    rows=$(q "UPDATE agencia_aprovacoes_pendentes SET status='aprovada', aprovado_por='jeff', aprovado_em=datetime('now') WHERE id=$N AND status='pendente'; SELECT changes();")
    [ "$rows" -gt 0 ] || { echo "ERRO: id $N nao encontrado ou ja decidido"; exit 1; }
    info=$(q "SELECT agente || ' | ' || acao FROM agencia_aprovacoes_pendentes WHERE id=$N;")
    echo "id=$N aprovada"
    echo "Liberado: $info"
    ;;

  rejeitar)
    N="${2:?id obrigatorio}"
    MOTIVO="${3:?motivo obrigatorio}"
    M_E=$(sql_escape "rejeitada: $MOTIVO")
    rows=$(q "UPDATE agencia_aprovacoes_pendentes SET status='rejeitada', aprovado_por='jeff', aprovado_em=datetime('now'), resultado='$M_E' WHERE id=$N AND status='pendente'; SELECT changes();")
    [ "$rows" -gt 0 ] || { echo "ERRO: id $N nao encontrado ou ja decidido"; exit 1; }
    info=$(q "SELECT agente FROM agencia_aprovacoes_pendentes WHERE id=$N;")
    echo "id=$N rejeitada (agente=$info motivo='$MOTIVO')"
    ;;

  concluir)
    N="${2:?id obrigatorio}"
    RESULTADO="${3:?resultado obrigatorio}"
    R_E=$(sql_escape "$RESULTADO")
    rows=$(q "UPDATE agencia_aprovacoes_pendentes SET resultado='$R_E' WHERE id=$N AND status='aprovada'; SELECT changes();")
    [ "$rows" -gt 0 ] || { echo "ERRO: id $N nao encontrado ou status != aprovada"; exit 1; }
    # log auditoria
    q "INSERT INTO agencia_acoes_log (agente, acao, classe, motivo, resultado, payload_json) SELECT agente, acao, 'vermelho', 'aprovado pelo Jeff (id=$N)', '$R_E', payload_json FROM agencia_aprovacoes_pendentes WHERE id=$N;"
    dm_jeff "Pedido #$N concluido: $RESULTADO"
    echo "id=$N concluida (log gravado em agencia_acoes_log)"
    ;;

  ""|-h|--help|help)
    usage
    ;;

  *)
    echo "comando desconhecido: $1" >&2
    usage
    ;;
esac
