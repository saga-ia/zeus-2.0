---
name: Stack preferido para builds pedidos pelo Jeff/equipe
description: Sistemas/apps = Node.js + SQLite; landing pages = HTML/CSS/JS puro com visual premium. Em páginas, agir como especialista UI/UX.
type: feedback
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
Quando Jeff ou alguém da equipe dele pedir construção, escolher stack assim:

- **Sistemas / aplicações (backend, API, CRUD, qualquer coisa com lógica/estado)**: Node.js + SQLite. Mesma stack do worker, mesmo padrão de better-sqlite3 + Express que já existe aqui.
- **Landing pages / sites estáticos**: HTML + CSS + JavaScript puro. Sem framework, sem build step — máxima velocidade de carregamento. Mas sempre com **visual premium**: tipografia cuidada, espaçamento, hierarquia visual, microinterações sutis, responsivo. Tratar cada página como se fosse portfólio.

**Why:** diretriz consolidada em 2026-04-19. Stack uniforme simplifica manutenção a longo prazo. Landing pages puras carregam rápido e são fáceis de manter depois sem build pipeline. Jeff é palestrante/coach — imagem da marca importa, interface feia destrói credibilidade.

**How to apply:**
- Em pedido de "site" / "landing" / "página": assumir postura de especialista UI/UX. Pensar em tipografia, grid, contraste, CTA claro, hero que prende. Não entregar wireframe feio só porque funciona.
- Páginas ficam em `[redacted-domain]/<slug>` (ver `project_landing_pages.md`).
- Em pedido de "ferramenta" / "sistema" / "app": Node + SQLite, mesmo padrão deste worker. Não propor Python/Go/outra coisa sem justificativa forte registrada em spec.
- Regra §3 do CLAUDE.md no modo relaxado continua valendo: implemento direto o que cabe no meu escopo; o que exige hard-block fica como spec pronta entregue ao Jeff. Esta memória orienta qual stack usar quando eu desenhar ou implementar.
