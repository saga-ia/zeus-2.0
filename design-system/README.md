# Design System do Zeus

Tudo o que é visual do Zeus e da Alpha num lugar só: identidade, tokens, layout, componentes, templates de post e minisite, regras de arte e as ferramentas que geram as peças.

**Visual oficial do Zeus: "roxo + magenta"** (roxo `#673DE6` decidido pelo Jeff em 16/10/2026; magenta `#BE185D`, fundo aurora, menu escuro e faixas em degradê por seção desde 17/10/2026). Última conferência com a produção: 23/10/2026 (prints `novo-*` em `02-layout-componentes/central/telas/prints/` e [`visual-roxo-magenta.md`](02-layout-componentes/central/visual-roxo-magenta.md)). Toda tela, app ou peça nova usa [`01-identidade/tokens/zeus-central.css`](01-identidade/tokens/zeus-central.css). As outras identidades que existiam ficaram como legado, e a lista do que falta migrar está em [`01-identidade/IDENTIDADES.md`](01-identidade/IDENTIDADES.md).

> Esta pasta é uma **cópia de referência**. Os arquivos que rodam em produção continuam em `/opt/jeff-apps`, `/opt/jeff-worker`, `/opt/jeff-sites` e `/root/.claude` (endereços na tabela no fim). Se mudar algo lá, atualize aqui.
> Material de cliente (Farias, CIGC, EBC etc.) **não entra aqui**: fica no projeto de cada cliente.

## Estrutura

```
design-system/
├── 01-identidade/
│   ├── IDENTIDADES.md            # as 5 identidades, contradições e proposta
│   ├── estetica-e-voz-alpha.md   # doc oficial de paletas SAGA/VPS
│   ├── logo/                     # zeus-favicon.svg (raio roxo, único logo do Zeus), myig-favicon.svg
│   ├── icones/                   # os 76 ícones da Central (zeus-icones.json + index.html pra ver todos)
│   ├── tokens/
│   │   ├── zeus-central.css      # OFICIAL: tokens roxo + magenta (--zeus-mg-*, faixas por seção) e base (--zeus-*)
│   │   └── outras-identidades.css# legado: SAGA, VPS, Gustavo, Marca Jeff, Apps de post
│   └── marca-jeff/               # @jeffhenrike: gosto.md (o que o Jeff aprova), contexto, avatares, estilo salvo
│
├── 02-layout-componentes/
│   ├── central/                  # zeus-visual.css + zeus-visual.js (camada do visual roxo + magenta) e visual-roxo-magenta.md,
│   │                             # central-base.css (sidebar antiga, cards, chips, gaveta mobile), posts.css, login, convite,
│   │                             # voz-zeus.css (tela de voz /jarvis) e componentes-e-telas.md (estilos dos componentes,
│   │                             # selos de status, menu atual, padrão das telas LinkedIn/TikTok)
│   │   └── telas/                # TODAS as telas da Central, uma por seção: layout, abas, componentes, estados,
│   │                             # botões, APIs e arquivo de origem (README.md é o índice) + prints/
│   └── temas-outros-apps/        # CSS extraído dos outros apps do Zeus (SAGA, VPS, zeus-post, myIG, platform...)
│
├── 03-templates/
│   ├── biblioteca-posts/         # 15 modelos de post (INDICE.md + ficha.md + referencia.jpg cada)
│   ├── card-de-print/            # card estilo tweet usado nos carrosséis
│   ├── referencias-anuncio/      # "noob vs pro" da skill criativo-anuncio
│   ├── minisites/                # modelos testados: links (linktree) e diagnostico (quiz)
│   ├── zeus/                     # MODELOS NO DESIGN ZEUS (roxo + magenta): post 1080x1350 e slide 1920x1080 (+ prévias)
│   ├── pecas-gustavo/            # carrossel e frase de impacto no padrão azul+dourado (legado Alpha)
│   └── sites/                    # log de paletas do site-premium + DESIGN.md de exemplo
│
├── novo-visual/                  # handoff original do visual roxo + magenta (README + protótipos)
│
├── 04-regras/
│   ├── skills/                   # site-premium, arte-por-referencia, analise-design-post, criativo-anuncio,
│   │                             # minisite, social-peca, maicom-visual, time-gustavo, time-eduardo
│   ├── agentes/                  # gustavo-designer, eduardo-minisites, tome-revisor (QA visual)
│   └── docs/                     # regras de arte do time, fluxo de entrega do Gustavo e design-system-zeus-para-agentes.md
│                                 # (o guia que Gustavo, Eduardo, Tomé, site-premium e arte-por-referencia seguem em peça do ZEUS)
│
└── 05-ferramentas/
    ├── central/                  # motor de arte da Central (design.js, estilos.js) e tools design/estilo/marca/apresentacao
    └── scripts/                  # check-html-arte, check-arte, ilustra, editar-imagem, feedback-arte, site-check, minisite-check
```

## Como usar

- **Tela ou app interno novo do Zeus:** importe `01-identidade/tokens/zeus-central.css` e use só `var(--zeus-*)`. Moldura (menu flutuante, faixa, abas, celular): siga `02-layout-componentes/central/visual-roxo-magenta.md` e reaproveite `zeus-visual.css`. Tela nova dentro da Central: registre em `TELAS` do `zeus-visual.js`.
- **Peça do ZEUS (post, slide, material):** `04-regras/docs/design-system-zeus-para-agentes.md` + `03-templates/zeus/`.
- **Post do @jeffhenrike:** siga `01-identidade/marca-jeff/gosto.md` e escolha a estrutura em `03-templates/biblioteca-posts/INDICE.md`. As regras de motor (HTML, IA ou híbrido) estão em `04-regras/skills/arte-por-referencia`.
- **Criativo de anúncio:** `04-regras/skills/criativo-anuncio` + `03-templates/referencias-anuncio`.
- **Site ou landing:** `04-regras/skills/site-premium` (sem cara de IA), e registre a paleta em `03-templates/sites/log-de-paletas.md`.
- **Minisite:** parta de `03-templates/minisites/` e valide com `05-ferramentas/scripts/minisite-check.js`.
- **Antes de entregar qualquer peça:** passe pela revisão de `04-regras/agentes/tome-revisor.md`.

## Onde cada coisa vive em produção

| Aqui | Original |
|---|---|
| `01-identidade/logo/zeus-favicon.svg` | `/opt/jeff-apps/jeff-central/public/favicon.svg` |
| `01-identidade/estetica-e-voz-alpha.md` | `/opt/jeff-worker/zeus/06_estetica_voz.md` |
| `01-identidade/marca-jeff/` | `/opt/jeff-worker/projetos/design-modelos/marcas/g2Tg5oqEoqg/` + `/opt/jeff-worker/projetos/clientes/jeffhenrike/` |
| `02-layout-componentes/central/zeus-visual.css`, `zeus-visual.js` | `/opt/jeff-apps/jeff-central/public/zeus-visual.css` e `zeus-visual.js` |
| `02-layout-componentes/central/central-base.css` | blocos `<style>` de `/opt/jeff-apps/jeff-central/public/index.html` |
| `02-layout-componentes/central/posts.css` | `/opt/jeff-apps/jeff-central/public/posts/posts.css` |
| `02-layout-componentes/central/voz-zeus.css` | `const CSS` de `/opt/jeff-apps/jeff-central/public/jarvis.js` |
| `02-layout-componentes/central/componentes-e-telas.md`, `01-identidade/icones/` | constantes de estilo e objeto `ICONS` de `/opt/jeff-apps/jeff-central/public/index.html` |
| `03-templates/biblioteca-posts/` | `/opt/jeff-worker/projetos/design-modelos/estruturas/` (sem `_coleta/`) |
| `03-templates/card-de-print/`, `referencias-anuncio/` | `/opt/jeff-worker/projetos/design-modelos/` |
| `03-templates/minisites/` | `/opt/jeff-worker/projetos/minisites/_modelos/` |
| `03-templates/sites/log-de-paletas.md` | `/opt/jeff-sites/_design-log.md` |
| `04-regras/skills/`, `04-regras/agentes/` | `/root/.claude/skills/`, `/root/.claude/agents/` |
| `04-regras/docs/regras-de-arte-do-time.md` | `/opt/jeff-apps/jeff-central/zeus-time.md` |
| `05-ferramentas/central/` | `/opt/jeff-apps/jeff-central/` (`design.js`, `estilos.js`, `tools/`) |
| `05-ferramentas/scripts/` | `/opt/jeff-worker/scripts/` |
| `04-regras/docs/design-system-zeus-para-agentes.md` | `/opt/jeff-worker/docs/design-system-zeus.md` |
| `03-templates/zeus/` | `/opt/jeff-worker/projetos/design-modelos/zeus/` (contexto da marca em `/opt/jeff-worker/projetos/clientes/zeus/contexto.md`) |

## O que ainda falta

- Migrar pro roxo os apps e documentos que ainda usam outra cor (lista em `IDENTIDADES.md`).
- Logo em PNG e logotipo com o nome "ZEUS".
- Brand kit do Zeus/Alpha na Central (hoje só existem de clientes e da marca Jeff).
- Templates de e-mail e de proposta visual: não existem.
- Os brand kits salvos e as criações geradas ficam no banco e em `data/social/` da Central e não entram aqui.
