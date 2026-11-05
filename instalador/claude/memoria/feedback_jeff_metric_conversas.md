---
name: Métrica principal de relatório de campanha CTWA = "conversas iniciadas"
description: Jeff 2026-04-27. Pra campanhas Click-to-WhatsApp (objetivo Engajamento que leva a conversa), a métrica principal de qualidade é "conversas iniciadas". Cliques importam menos. Reportar essa métrica por padrão.
type: feedback
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
**Regra Jeff 2026-04-27**:

Pra campanhas que levam pro WhatsApp (CTWA — Click to WhatsApp), o relatório padrão deve ter **conversas iniciadas** como métrica principal. Não cliques.

## Métrica Meta API
Campo: `actions` com `action_type: onsite_conversion.messaging_first_reply` (mensagem foi respondida) ou `onsite_conversion.messaging_conversation_started_7d` (conversa iniciada nos últimos 7d).

## Como reportar
- Por campanha: spend / conversas iniciadas / CPA por conversa
- Por adset: idem
- Comparativo: conversas/dia, taxa de conversão (cliques → conversas)

## Cliques só se for perguntado especificamente
- Se Jeff perguntar "cliques", aí sim reporto.
- Padrão: conversas iniciadas em 1º plano.

## Como puxar via API
```
GET /act_X/insights?level=campaign&fields=campaign_name,spend,impressions,actions,reach&date_preset=today
# Filtrar actions onde action_type='onsite_conversion.messaging_first_reply' OR 'onsite_conversion.messaging_conversation_started_7d'
```

## Aplicar em
- mchat (Insta)
- WPP campaigns (campanha de referência)
- Qualquer relatório futuro que envolver campanhas de mensagem
