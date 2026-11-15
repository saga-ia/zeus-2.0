#!/bin/bash
# Atendimentos dos números comerciais (Evolution) lidos das views zv.* — SOMENTE LEITURA.
# Horários das views já estão em BRT.
#
# Uso:
#   comercial-wpp.sh resumo [dias=7]                 visão geral por número/vendedor
#   comercial-wpp.sh aguardando [limite=30]          clientes esperando resposta nossa (mais antigo primeiro)
#   comercial-wpp.sh conversas [dias=7] [limite=50]  conversas com movimento recente
#   comercial-wpp.sh buscar <texto> [limite=30]      procura nome, telefone ou texto de mensagem
#   comercial-wpp.sh historico <telefone|jid> [limite=80]   mensagens de um contato (ordem cronológica)
#   comercial-wpp.sh tempo-resposta [dias=30]        tempo médio/mediano de resposta por vendedor
set -euo pipefail
CMD="${1:-}"; shift || true
num() { [[ "${1:-}" =~ ^[0-9]{1,5}$ ]] && echo "$1" || echo "$2"; }

run() {  # $@ = -v pares; SQL vem pelo stdin (variáveis :'x' só funcionam via stdin)
  docker exec -i jeff-evolution-postgres psql -U evolution -d evolution -X -q --csv -v ON_ERROR_STOP=1 "$@"
}

case "$CMD" in
  resumo)
    D=$(num "${1:-}" 7)
    run -v d="$D" <<'SQL'
BEGIN READ ONLY;
SELECT c.instancia, coalesce(c.vendedor,'-') vendedor,
       count(*) FILTER (WHERE c.ultima_msg >= now()::timestamp - (:'d'||' days')::interval) conversas_periodo,
       count(*) FILTER (WHERE c.aguardando_resposta AND c.ultima_msg >= now()::timestamp - (:'d'||' days')::interval) aguardando_resposta,
       count(*) total_conversas,
       max(c.ultima_msg) ultima_msg
FROM zv.conversa c WHERE NOT c.is_group
GROUP BY 1,2 ORDER BY 3 DESC;
COMMIT;
SQL
    ;;
  aguardando)
    L=$(num "${1:-}" 30)
    run -v l="$L" <<'SQL'
BEGIN READ ONLY;
SELECT c.instancia, coalesce(c.nome,'') nome, c.telefone, c.ultima_msg_cliente,
       round(extract(epoch FROM now()::timestamp - c.ultima_msg_cliente)/3600,1) horas_esperando,
       (SELECT left(m.texto,160) FROM zv.msg m WHERE m.jid=c.jid AND m.instancia=c.instancia AND NOT m.from_me ORDER BY m.ts DESC LIMIT 1) ultima_msg_do_cliente
FROM zv.conversa c
WHERE c.aguardando_resposta AND NOT c.is_group AND c.ultima_msg_cliente >= now()::timestamp - interval '30 days'
ORDER BY c.ultima_msg_cliente ASC LIMIT :l;
COMMIT;
SQL
    ;;
  conversas)
    D=$(num "${1:-}" 7); L=$(num "${2:-}" 50)
    run -v d="$D" -v l="$L" <<'SQL'
BEGIN READ ONLY;
SELECT c.instancia, coalesce(c.nome,'') nome, c.telefone, c.ultima_msg, c.total_msgs, c.msgs_cliente, c.msgs_nossas, c.aguardando_resposta
FROM zv.conversa c
WHERE NOT c.is_group AND c.ultima_msg >= now()::timestamp - (:'d'||' days')::interval
ORDER BY c.ultima_msg DESC LIMIT :l;
COMMIT;
SQL
    ;;
  buscar)
    T="${1:?texto}"; L=$(num "${2:-}" 30)
    run -v t="$T" -v l="$L" <<'SQL'
BEGIN READ ONLY;
SELECT m.instancia, coalesce(m.push_name,'') nome, m.telefone, m.ts, CASE WHEN m.from_me THEN 'nós' ELSE 'cliente' END quem, left(m.texto,200) texto
FROM zv.msg m
WHERE NOT m.is_group AND (m.texto ILIKE '%'||:'t'||'%' OR m.push_name ILIKE '%'||:'t'||'%' OR m.telefone LIKE '%'||regexp_replace(:'t','\D','','g')||'%' AND length(regexp_replace(:'t','\D','','g'))>=6)
ORDER BY m.ts DESC LIMIT :l;
COMMIT;
SQL
    ;;
  historico)
    C="${1:?telefone ou jid}"; L=$(num "${2:-}" 80)
    run -v c="$C" -v l="$L" <<'SQL'
BEGIN READ ONLY;
SELECT * FROM (
  SELECT m.instancia, m.ts, CASE WHEN m.from_me THEN 'nós' ELSE coalesce(m.push_name,'cliente') END quem,
         CASE WHEN m.is_audio AND m.texto IS NULL THEN '[áudio]' WHEN m.is_midia AND m.texto IS NULL THEN '['||m.tipo||']' ELSE m.texto END texto
  FROM zv.msg m
  WHERE m.jid = :'c' OR (length(regexp_replace(:'c','\D','','g'))>=8 AND m.telefone LIKE '%'||right(regexp_replace(:'c','\D','','g'),8))
  ORDER BY m.ts DESC LIMIT :l) x
ORDER BY ts ASC;
COMMIT;
SQL
    ;;
  tempo-resposta)
    D=$(num "${1:-}" 30)
    run -v d="$D" <<'SQL'
BEGIN READ ONLY;
SELECT instancia, coalesce(vendedor,'-') vendedor, count(*) respostas,
       round(avg(minutos),1) media_min,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos))::numeric,1) mediana_min
FROM zv.resposta WHERE ts_pergunta >= now()::timestamp - (:'d'||' days')::interval
GROUP BY 1,2 ORDER BY 1;
COMMIT;
SQL
    ;;
  *) sed -n 2,12p "$0"; exit 2;;
esac
