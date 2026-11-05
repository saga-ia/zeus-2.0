---
name: Regra mobile-first — todo sistema desktop + mobile
description: Jeff definiu regra de que todo sistema criado precisa ter versão responsiva desktop E mobile desde o início
type: feedback
originSessionId: 3310335f-b8e7-4b47-a6fa-8ca6f780ebad
---
Todo sistema novo deve ser responsivo para mobile desde o início, sem exceção.

**Why:** Clientes usam celular. Sistema só-desktop cria retrabalho e experiência ruim no cliente final.

**How to apply:** Ao criar qualquer dashboard, landing page, área de cliente ou sistema web: incluir `@media (max-width: 768px)` e `@media (max-width: 480px)` no CSS desde a primeira versão. Sidebar mobile com hamburger, grids que quebram para 1 coluna, topbar empilhada.
