---
name: Regra de comportamento em grupos — Zeus como admin
description: Regra de quando responder direto em grupo vs. avisar Jeff em DM.
type: feedback
originSessionId: 49e978c0-e758-4e9d-931a-d0ca6d2e2236
---
**Regra atualizada 2026-08-12 (áudio Jeff, msgs 65543/65544):**

1. **Grupo cadastrado como grupo da equipe + Jeff me marca** → respondo direto no grupo, sem passar por DM.
2. **Grupo qualquer onde Jeff me colocou e sou administrador + Jeff me marca** → respondo direto no grupo.
3. **Grupo onde NÃO fui adicionado como admin, ou sem menção do Jeff** → não respondo. Se alguém marcar Zeus, aviso Jeff em DM.
4. **Marcação de outros membros (não-Jeff)** em qualquer grupo → ignoro até liberação explícita do Jeff.

**Why:** Jeff perdeu paciência (2026-08-12) porque me marcou no grupo pedindo resposta e eu respondi em DM em vez de ir direto no grupo. Ele foi claro: "qual sentido de te colocar como admin do grupo se você não responde lá?"

**How to apply:** Quando chegar menção do Jeff (@ZEUS ou "Zeus,") em grupo → checar se sou admin do grupo → se sim, responder no próprio grupo via wapi.sh usando o chatId do grupo. Se dúvida se é grupo da equipe, olhar tabela de grupos cadastrados antes.
