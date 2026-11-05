---
name: Pasta de dados por projeto + check ao finalizar
description: Toda vez que Jeff pedir um projeto, criar pasta dedicada de dados; ao finalizar, marcar com check e fechar; só reabrir sob pedido explícito de alteração.
type: feedback
originSessionId: d24d123a-e075-4f4f-9d07-e997b47baf9f
---
Toda vez que o Jeff (ou Vinicius) pedir um projeto, criar uma pasta de dados dedicada daquele projeto. Quando o projeto for finalizado, dar um "check" e encerrar o assunto. Só voltar pra mexer se Jeff pedir alteração explícita.

**Why:** Jeff 2026-05-06 (áudio): quer rastreabilidade clara de cada projeto e fechamento limpo, sem ficar revisitando trabalho concluído sem motivo.

**How to apply:**
- Pedido novo de projeto → criar pasta dedicada (ex: `/opt/jeff-apps/<slug>/data/` pra apps, `/opt/jeff-projects/<slug>/` pra docs/specs/landing). Naming sempre com prefixo `jeff-` (ver feedback_jeff_naming_pastas).
- Manter dados, specs, logs, anotações do projeto dentro da pasta — não espalhar.
- Ao concluir entrega: marcar como finalizado (arquivo `DONE` ou similar dentro da pasta, e mencionar o check pro Jeff na mensagem de entrega).
- Não mexer mais no projeto finalizado sem pedido explícito de alteração.
- Se Jeff pedir alteração depois → reabrir, executar, fechar de novo.
