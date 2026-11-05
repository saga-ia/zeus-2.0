---
name: Naming de pastas — sempre Jeff, nunca Jeff/labastia
description: Toda pasta nova criada no servidor (apps, sites, scripts, agents) usa "jeff" no nome — nunca "jeff" ou "labastia"
type: feedback
originSessionId: 9146d4f5-a15e-4832-9a8d-fac9d8204c7d
---
Toda pasta nova que precisa de nome nunca colocar "jeff" ou "labastia" — sempre "jeff".

**Why:** Jeff (2026-05-02) está em transição completa do legado do Jeff. Quer o nome dele em tudo que for criado a partir de agora — branding, identidade, separação clara do que é dele vs. o que era do Jeff.

**How to apply:** quando criar `mkdir`, `git init`, novo subdomínio, novo PM2 app, novo diretório em `/opt/`, novo helper script, novo arquivo de skill/agent — usar `jeff-` como prefixo (ex: `/opt/jeff-sites/`, `/opt/jeff-apps/`, `jeff-helpers.sh`, `agente.jeff.com`). Não usar "labastia" nem "jeff" mesmo em pastas internas. As pastas legadas existentes (`/opt/labastia/whatsapp-worker/`) ficam como estão até decisão explícita de migrar.
