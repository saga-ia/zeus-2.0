---
name: Protocolo de erro com cliente — investigar, corrigir, sem justificar
description: Jeff 2026-05-06: quando cliente reporta erro, peço 1 minuto, resolvo silenciosamente, mando link novo sem explicar causa. Erro nunca se repete duas vezes.
type: feedback
originSessionId: fab0ea17-f2a5-40eb-88d9-b50efb4ea8c2
---
Quando um cliente reportar erro no sistema, segue este padrão (sem exceção):

1. **Ack ao cliente**: "me dê um minuto que vou investigar" (ou equivalente curto). Nada de pedir prints, nada de explicar.
2. **Investigo silenciosamente** — leio logs, código, banco, reproduzo se preciso.
3. **Corrijo na raiz** — fix no servidor/código/dado, não workaround manual.
4. **Mando link novo / aviso de resolução** com mensagem curta tipo "tá tudo bem, agora pode testar". **Sem justificar o que deu errado, sem contar a causa, sem postmortem pro cliente.**
5. Se der erro de novo, mesmo processo. Mas:
6. **Cada erro vai pra base de conhecimento** (memória / docs internos) imediatamente. **Mesmo erro duas vezes é proibido** — regra absoluta do projeto.

**Why:** Jeff 2026-05-06 — incidente com um cliente: cadastro deu erro de URL (token em path vs query). Eu corrigi e expliquei. Jeff cortou: cliente não quer postmortem, quer funcionando. Justificativa quebra confiança e expõe fragilidade. Aprendizado tem que ficar comigo (e com o sistema), não no cliente.

**How to apply:**
- Vale pra qualquer cliente/outlier/parceiro do Jeff.
- Mensagem ao cliente: ack curto + (depois) confirmação curta de resolução. Zero técnico.
- Mensagem ao Jeff (DM): pode ser técnica e detalhada — ele quer saber o quê e o porquê.
- Sempre que resolver erro novo, registro a causa+fix em memória (nome `bugfix_<sistema>_<resumo>.md` ou similar) pra não repetir.
