---
name: Monitoramento de sistemas — alerta imediato ao Jeff
description: Sempre que um sistema nosso sair do ar, Zeus avisa Jeff na hora e trabalha para resolver
type: feedback
originSessionId: ae566807-7540-430d-b6b3-f45af751c9db
---
Quando qualquer sistema criado para o Jeff sair do ar (erro HTTP, resposta ok=false, timeout, healthcheck falhando): avisa Jeff imediatamente via WhatsApp + trabalha para resolver + confirma quando voltar.

**Why:** Jeff pediu explicitamente em 2026-05-17 após ver o alerta do CRM de um cliente funcionar bem. Quer isso como padrão para todos os sistemas, não só o CRM.

**How to apply:** Healthchecks/monitors ativos → ao detectar falha, envia alerta curto ("ALERTA: [sistema] fora do ar") → investiga causa → resolve ou escala → confirma retorno ("[sistema] voltou ao normal").
