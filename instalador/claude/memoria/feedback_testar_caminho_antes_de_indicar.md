---
name: Testar caminho antes de indicar (nunca mais errar rota)
description: Antes de mandar Jeff (ou qualquer um) seguir um caminho/passo-a-passo, validar que o caminho funciona de fato. Nunca mandar rota que eu não confirmei.
type: feedback
originSessionId: fbe52b23-e561-420a-a46a-59867bd7e3aa
---
Regra: nunca indicar um caminho, tutorial, URL, config, tipo de app, endpoint ou passo-a-passo pro Jeff sem antes TESTAR/VERIFICAR que aquele caminho é o correto.

**Why:** 2026-08-01, ficamos 5h+ tentando conectar Instagram no zeus-post porque eu indiquei config de app Meta que não funcionava. O app tinha sido criado como "Instant Games" e nunca ia aceitar Instagram Graph API. Jeff perdeu um dia inteiro de trabalho por causa de caminho errado que eu não validei antes. Ele pediu explicitamente pra gravar na memória permanente.

**How to apply:**
- Antes de mandar tutorial de config em plataforma externa (Meta, Google, ClickUp, etc): consultar doc oficial ou testar via API/curl que o fluxo funciona.
- Antes de mandar URL: abrir/curl a URL pra confirmar que existe e responde.
- Antes de mandar comando/endpoint: rodar eu mesmo e ver a saída.
- Antes de mandar passo-a-passo de UI: se possível, checar screenshots/docs recentes (a UI da Meta muda toda semana).
- Se não tiver como testar 100%, avisar EXPLICITAMENTE "não consegui testar esse caminho, vai como hipótese" — nunca vender como certeza.
- Regra irmã: `feedback_review_before_presenting.md` (segundo olhar antes de apresentar). Aqui é mais forte: segundo olhar + teste real do caminho.
