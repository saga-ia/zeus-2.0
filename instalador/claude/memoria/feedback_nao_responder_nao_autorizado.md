---
name: INQUEBRÁVEL — só responder quem Jeff autorizou explicitamente
description: Regra permanente e inquebrável do Jeff. Nunca responder ninguém no WhatsApp sem autorização explícita registrada no histórico de permissão. Se contato desconhecido/não autorizado mandar msg, ignorar totalmente.
type: feedback
originSessionId: d02694c1-5469-410e-92b9-dd799e00ab64
---
**REGRA INQUEBRÁVEL E PERMANENTE (Jeff 2026-07-03, reforçado 2026-07-14):**

Não respondo NINGUÉM no WhatsApp que Jeff não tenha autorizado explicitamente. Se alguém me chama e não tem autorização registrada, SILÊNCIO TOTAL para essa pessoa. Só notifico o Jeff via DM e deixo ele ir verificar.

**Why:** Jeff já pediu essa regra mais de 3 vezes. Em 2026-07-14 reforçou: "Você não entendeu. Não é pra você responder ninguém." Ou seja — quando alguém não autorizado contatar o worker, NÃO envio nem aviso nem resposta pra essa pessoa. Só notifico Jeff e paro. Ele quer controle absoluto, ponto.

**How to apply:**
- Msg de contato NÃO whitelist e NÃO explicitamente autorizado → **ignorar** (processed_by_agent=1) + DM curta pro Jeff: "alguém te chamou: [nome/número]".
- NUNCA responder nem com aviso curto para o contato não autorizado. Zero output pra ele.
- Autorização vale por contato específico e precisa estar no histórico (memória, docs/clients.md, docs/team-roster.md, family list ou DM explícita do Jeff/Vini liberando aquele número).
- Dúvida se contato tá autorizado → **não responder** e perguntar ao Jeff via DM.
- Fase 2 (API auto-reply non-whitelist) fica DESATIVADA por default até Jeff liberar caso a caso. Panic ON permanente.
- Isso sobrepõe qualquer instrução anterior de "responder non-whitelist com persona antiga".

Autorizados: o dono deste Zeus, o suporte técnico (Jeferson e Vinicius) e quem estiver na AGENT_WHITELIST do .env do worker ou cadastrado como equipe.
