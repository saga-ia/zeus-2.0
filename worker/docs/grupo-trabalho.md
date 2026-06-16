# Protocolo Grupo de trabalho — follow-ups

Grupo `120363424213738214@g.us` é o `internal_team_group_jid`. Toda msg dele cai pra mim.

## Quando Jeff dirige pedido a alguém no grupo
Padrões: *"Vinicius, faz X até Y"*, *"@Fulano resolve Z"*, *"precisa do relatório até sexta"*.

**Ação**:
1. Criar entrada em `jeff_followups` com `owner_phone` = membro citado (cruzar com `jeff_team`), `description` = pedido, `due_at` = se Jeff disse prazo (calcular data; sem prazo = null).
2. Reaction 👍 na msg do Jeff + ack curto no grupo: *"Anotado: cobro o Vinicius sobre X até sexta."*

## Quando alguém da equipe responde a cobrança minha
Worker já dispara o agente em continuação de thread (janela 30min).

**Ação**:
- Trouxe entrega → `status='done'`, `completed_at=now`.
- Pediu detalhes/extensão → respondo + atualizo `due_at` se necessário.
- Enrolou → registro em `notes`, `status='open'`, próxima cobrança escala (0-24h leve / 24-72h firme / >72h DM pro Jeff).
- Respondo no grupo, sem reabrir DM com Jeff (a não ser que precise dele).

## Áudio do Jeff
Confiar na transcrição Groq. Se `failed`, peço pra repetir em texto. Se Jeff foi vago, abro follow-up SEM detalhes e pergunto contexto a ele em DM antes de cobrar.

## Membro novo no grupo
Phone novo entra → vira team-authorized automaticamente. Bom momento pra DM pro Jeff: "Quem é esse novo no grupo? Me diz papel/tom pra cadastrar em `jeff_team`."

## Tabelas

```bash
# Listar follow-ups ativos
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db <<'SQL'
SELECT f.id, t.name as owner, f.description, f.due_at, f.status, f.chase_count, f.last_chased_at
FROM jeff_followups f
LEFT JOIN jeff_team t ON t.phone = f.owner_phone
WHERE f.status = 'open'
ORDER BY (f.due_at IS NULL), f.due_at ASC;
SQL

# Criar follow-up
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "INSERT INTO jeff_followups (owner_phone, description, due_at)
   VALUES ('55XXXXXXXXXXX','descrição','2026-MM-DD');"

# Cobrar e marcar
/opt/labastia/whatsapp-worker/scripts/wapi.sh POST /messages/private \
  '{"to":"55XXXXXXXXXXX","body":"texto da cobrança"}'
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "UPDATE jeff_followups SET last_chased_at=datetime('now'), chase_count=chase_count+1 WHERE id=<ID>;"

# Concluir
sqlite3 /opt/labastia/whatsapp-worker/data/worker.db \
  "UPDATE jeff_followups SET status='done', completed_at=datetime('now') WHERE id=<ID>;"
```

## Cron diário
`scripts/daily-chase.sh` roda 12:00 UTC (9h BRT) — cobra owners com follow-ups vencidos e manda relatório pro Jeff em DM.

## Cadência de cobrança
- 0–24h: leve, "oi, lembra daquilo que combinamos?"
- 24–72h: firme, lembra prazo combinado.
- >72h: escala pro Jeff em DM ("não consegui cobrança em X tentativas").
