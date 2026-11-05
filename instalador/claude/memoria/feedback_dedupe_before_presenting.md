---
name: Sempre aplicar dedupe antes de apresentar contagem/ranking que vira decisão
description: Ao apresentar número/ranking baseado em dados crus de terceiros (vCards, mensagens, anexos), sempre aplicar dedupe explícito antes — senão usuário decide em cima de número inflado e reverter fica caro.
type: feedback
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
**Regra**: qualquer contagem ou ranking que eu apresentar baseado em dados de terceiros (vCards recebidos, msgs agregadas, qualquer input repetível) deve passar por **dedupe explícito antes** da apresentação. Se não posso rodar dedupe, marcar "contagem bruta, pode ter duplicatas" em cima e pedir confirmação antes do usuário agir.

**Why**: em 2026-04-22 apresentei ao Jeff um ranking PQV de "1176 indicações" baseado em contar vCards soltos. Ele usou a métrica pra dar prêmio/sorteio. Na revisão seguinte, aplicando dedupe por (telefone ou nome normalizado), o número real era 984 — porque vários alunos mandaram os mesmos contatos em múltiplas mensagens. O Jeff já tinha decidido com o primeiro número inflado. Feedback dele: "você me quebrou". Reverter decisão tomada em cima de número cru é caro reputacionalmente; aplicar dedupe antes custa 30 segundos.

**How to apply**:
- Antes de apresentar qualquer COUNT() / contagem agregada: perguntar "isso pode ter duplicatas?". Se sim, dedupe.
- Para vCards / contatos: chave de dedupe = telefone canonical (waid ou normalizado pra só dígitos com ≥10 chars) OU nome normalizado em lower-case se telefone ausente.
- Para msgs: chave = message_id; cuidado com forwards / re-envios.
- Se o dado é "bruto e pode ter ruído", **declarar isso na primeira linha** da resposta. Não só mencionar no rodapé.
- Se o usuário vai tomar decisão em cima (sorteio, prêmio, pagamento, relatório executivo), aplicar dedupe é MANDATÓRIO, não opcional.
- Ao extrair telefone de vCard, usar `waid=\d+` quando disponível (WhatsApp ID canônico). Fallback: linha TEL completa até fim de linha, normalizar pra dígitos. Nunca fiar em match parcial tipo `+(\d+)` que pára no primeiro espaço — perde o resto do número e colapsa contatos diferentes na mesma chave.
