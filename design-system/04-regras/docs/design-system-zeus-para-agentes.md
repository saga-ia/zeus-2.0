# Design do ZEUS: guia para os agentes

Use este guia sempre que a peça for **do ZEUS ou sobre o ZEUS**: tela, app ou página do produto, apresentação, material de venda, onboarding, documento, post ou carrossel que fala do ZEUS ou da Central, minisite do ZEUS, capa, banner, e-mail do produto. O visual é o da Central (`central.jefersonhenrike.com`) desde 17/10/2026: **"Roxo + magenta"**, com menu escuro em degradê, fundo "aurora" roxo e rosa, cards em branco tingido e faixas coloridas por seção.

Referência completa: handoff em `/root/zeus-2.0/design-system/novo-visual/design_handoff_zeus_central_magenta/` (README + protótipo) e o código que roda em `/opt/jeff-apps/jeff-central/public/zeus-visual.css`.

## 0. Qual identidade usar (decida antes de abrir o editor)

| A peça é... | Identidade | Onde está |
|---|---|---|
| Do ZEUS / da Central / sobre o ZEUS | **Design ZEUS roxo + magenta (este guia)** | tokens em `/root/zeus-2.0/design-system/01-identidade/tokens/zeus-central.css` |
| Post do @jeffhenrike (marca pessoal do Jeff) | Marca Jeff | `/opt/jeff-worker/projetos/design-modelos/marcas/g2Tg5oqEoqg/gosto.md` |
| De cliente (Farias, CIGC, EBC...) | Identidade do cliente | §8 de `/opt/jeff-worker/projetos/clientes/<slug>/contexto.md` |
| Da Alpha Digital (agência) sem pedido específico | Pergunte ao Jeff se vai no Design ZEUS ou na paleta Alpha legada (azul + dourado) | `/root/.claude/agents/gustavo-designer.md` |

Nunca misture: peça do ZEUS não leva o vermelho da marca Jeff nem o azul/dourado legado; post do Jeff não vira roxo.

Decisões do Jeff: 16/10/2026 a cor do ZEUS é o roxo `#673DE6`; 17/10/2026 o visual oficial passa a ser **roxo + magenta** (handoff acima). Histórico em `/root/zeus-2.0/design-system/01-identidade/IDENTIDADES.md`.

## 1. Cores

| Papel | Cor | Uso |
|---|---|---|
| Primária (roxo) | `#673DE6` · forte `#5429C9` · profundo `#4B26C2` | botão principal, link, ícone ativo, número em destaque |
| Noite (fundos escuros) | `#230C3F` · `#3F1690` · `#5B2BD6` | menu, faixas, cards escuros |
| Magenta (acento) | `#BE185D` · rosa `#EC4899` · rosa claro `#F9A8D4` | seção Canais, brilhos, fim do degradê da esfera, detalhe de destaque |
| Lilás de apoio | `#F0ECFD` · `#8B6CF0` · `#D9CCFF` | fundo de chip e KPI, brilho da esfera |
| Texto | `#17171A` (título), `#3C3C44` (corpo), `#66666F` (apoio), `#9A9AA3` (fraco); branco sobre fundo escuro, apoio `rgba(255,255,255,0.72)` | |
| Bordas | `#E6E6EA`, `#DADADF`; borda lilás `rgba(103,61,230,0.13 a 0.18)` sobre o fundo aurora | |
| Estados | ok `#0F7A68`, atenção `#EDA100` / `#9A6700`, info `#4A6CF7`, erro `#C0341C` (sempre sobre o fundo suave da mesma cor) | selos e pontos |

**Cor por seção** (texto / fundo do ícone): Operar `#673DE6` / `rgba(103,61,230,0.10)` · Canais `#BE185D` / `rgba(190,24,93,0.09)` · Organizar `#7C3AED` / `rgba(124,58,237,0.10)` · Contexto `#0F7A68` / `rgba(15,122,104,0.10)`.

**Superfícies (os únicos degradês permitidos, use exatamente estes):**
- Fundo da página, "aurora": `radial-gradient(1100px 650px at 8% -5%, rgba(139,108,240,0.36), transparent 60%), radial-gradient(900px 600px at 98% 8%, rgba(236,72,153,0.26), transparent 60%), radial-gradient(900px 700px at 75% 105%, rgba(249,168,212,0.32), transparent 60%), #F1E8F8`
- Card "branco tingido": `linear-gradient(155deg, rgba(255,255,255,0.95) 0%, rgba(252,243,250,0.88) 45%, rgba(242,229,250,0.82) 100%)` com borda `rgba(103,61,230,0.13)`
- Menu e fundos escuros: `radial-gradient(circle at 0% 100%, rgba(236,72,153,0.38), transparent 55%), radial-gradient(circle at 100% 0%, rgba(139,108,240,0.38), transparent 50%), linear-gradient(180deg, #230C3F 0%, #3F1690 55%, #5B2BD6 100%)`
- Faixa de cabeçalho por seção (120°): Operar `#230C3F → #4B26C2 → #7C5CF0` · Canais `#230C3F → #7E1D6E → #BE185D → #EC4899` · Organizar `#230C3F → #5B21B6 → #8B5CF6` · Contexto `#230C3F → #134E4A → #4B26C2` · Base `#230C3F → #4B26C2 → #673DE6`
- Esfera do ZEUS: `radial-gradient(circle at 32% 28%, #FFFFFF 0%, #D9CCFF 14%, #8B6CF0 40%, #673DE6 66%, #BE185D 100%)`, halo `rgba(236,72,153,0.4)`
- Faixa fina de painel: `linear-gradient(90deg, #673DE6, #A43CC4, #D16BE0)` (4 px no topo)

Fora disso: nada de neon, dourado, azul, lima ou gradiente inventado. Texto nunca em degradê.

## 2. Tipografia

Google Fonts: `Space Grotesk` (500/600/700) para títulos e números, `DM Sans` (400 a 700) para interface e texto.

| Elemento | Fonte | Tamanho (tela) | Em post 1080 px |
|---|---|---|---|
| Título de página | Space Grotesk 600, `letter-spacing:-0.015em` | 28 a 32 px | 72 a 96 px |
| Hero / saudação | Space Grotesk 700 | 56 a 64 px | 96 a 120 px |
| KPI | Space Grotesk 700, `-0.02em` | 34 px | 80 a 110 px |
| Rótulo de seção | DM Sans 700, MAIÚSCULAS, `letter-spacing:.14em` | 10.5 px | 24 a 28 px |
| Corpo | DM Sans 400, base 14 px | 13 a 14 px | 30 a 34 px |
| Apoio | DM Sans, `#66666F` (ou branco 72% no escuro) | 11.5 a 12.5 px | 24 a 26 px |

Logo "ZEUS": Space Grotesk 700, caixa alta, `letter-spacing:.14em`, ao lado do raio.

## 3. Formas, espaço e sombra

- Raios: botão e ícone 8 a 11 px; chip/selo 20 px (pílula); card 14 a 16 px; faixa de cabeçalho 22 px; painel 20 px; menu flutuante 18 px.
- Card: fundo "branco tingido", borda lilás de 1 px; hover sobe 2 px com sombra `0 10px 24px rgba(23,23,26,0.07)`.
- Sombras: menu `0 18px 44px rgba(52,26,134,0.35)`; faixa `0 18px 44px rgba(52,26,134,0.22)`; painel `0 24px 60px rgba(23,23,26,0.14)`; botão roxo `0 12px 30px rgba(103,61,230,0.35)`.
- Textura: grade de pontos `radial-gradient(rgba(103,61,230,0.22) 1px, transparent 1.3px)` em 16 px, só num canto e com máscara (nunca na peça inteira).
- Espaço generoso: blocos a 16 a 22 px, margem lateral 40 px (16 px no celular).

## 4. Componentes

- **Botão principal:** fundo `#673DE6` (ou `linear-gradient(140deg,#673DE6,#5429C9)`), texto branco DM Sans 700, raio 10 px. Sobre faixa escura ele fica **branco com texto `#4B26C2`**; o secundário vira vidro (`rgba(255,255,255,0.12)`, borda `rgba(255,255,255,0.35)`, texto branco).
- **Faixa de cabeçalho:** degradê da seção, raio 22 px, pontos no canto superior direito, halo rosa; dentro: caminho ("Conta Alpha Digital › Operar · Agentes"), ícone em quadrado branco 52 px com a cor da seção, título branco, descrição branca 82%, botões à direita.
- **Abas:** caixa "branco tingido" com indicador lilás que desliza; aba ativa na cor da seção.
- **Menu lateral:** flutuante (margem 12 px), fundo escuro em degradê, itens brancos 82%, item ativo numa pílula branca translúcida; cartão "Falar com o ZEUS" com a esfera; seções com ponto colorido.
- **Selo:** pílula 10.5 px 700, cor de estado sobre o fundo suave da mesma cor.
- **KPI:** número Space Grotesk grande, rótulo pequeno, fundo `#F0ECFD`, variação em selo verde/vermelho.
- **Tela de voz:** esfera central, cartões do time ao redor (agente trabalhando ganha borda e anel `conic-gradient(#673DE6,#D16BE0)`), fonte de dados acesa em degradê roxo → magenta, painel de resultado entra pela direita com a faixa fina degradê.
- **Celular:** barra inferior flutuante escura (raio 26 px) com a esfera no centro, elevada.

Valores exatos: `/opt/jeff-apps/jeff-central/public/zeus-visual.css` e `/root/zeus-2.0/design-system/02-layout-componentes/central/componentes-e-telas.md`.

## 5. Ícones e logo

- Ícones de linha: traço 1.7, pontas redondas, viewBox 24, cor herdada. Biblioteca: `/root/zeus-2.0/design-system/01-identidade/icones/zeus-icones.json`. Nunca emoji como ícone de interface.
- Logo: raio branco sobre quadrado com degradê `140deg, #8B6CF0 → #673DE6` (no claro) + "ZEUS" em Space Grotesk 700.

## 6. Como as telas são (referência visual)

Abra com Read 2 ou 3 prints do visual novo em `/root/zeus-2.0/design-system/02-layout-componentes/central/telas/prints/` (arquivos `novo-*`) e o protótipo `Zeus Central - Padrao.html` do handoff. Descrição de cada tela: `/root/zeus-2.0/design-system/02-layout-componentes/central/telas/README.md`.

## 7. Modelos prontos (comece por eles)

Pasta `/opt/jeff-worker/projetos/design-modelos/zeus/`:
- `post-zeus.html`: post 1080 × 1350 (faixa escura com eyebrow e título, cards tingidos com ícone, selo, logo).
- `slide-zeus.html`: slide 1920 × 1080 para apresentação (fundo aurora, faixa à esquerda, card de passos à direita).

Prévias: `post-zeus-previa.png` e `slide-zeus-previa.png` (abra com Read para ver o resultado esperado).

Copie, troque o texto e mantenha a estrutura. Gere com `/opt/jeff-apps/jeff-central/tools/design html` (formato do pedido). Post: confira com `node /opt/jeff-worker/scripts/check-html-arte.js` (não passe de 50 palavras e 8 blocos). Slide e tela: o verificador é calibrado para post de Instagram e reprova slide por tamanho de fonte; confira tirando o print e comparando com a prévia.

## 8. Checklist antes de entregar uma peça ZEUS

1. Cores só da paleta (roxo, noite, magenta, lilás, cinzas e estados) e degradês só os da seção 1. Nenhum azul, dourado, vermelho vivo, lima, neon ou degradê inventado; texto nunca em degradê.
2. Títulos e números em Space Grotesk, texto em DM Sans.
3. Fundo aurora (ou faixa/menu escuro), cards "branco tingido" com borda lilás, raios da seção 3.
4. Ícones de linha da biblioteca, nunca emoji na interface.
5. Logo é o raio + "ZEUS". Nada de logo inventado.
6. Selos com as cores de estado certas.
7. Compare lado a lado com um print `novo-*` da Central: tem que parecer a mesma família.
8. Sem travessão no texto.
