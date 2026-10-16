# Design do ZEUS: guia para os agentes

Use este guia sempre que a peça for **do ZEUS ou sobre o ZEUS**: tela, app ou página do produto, apresentação, material de venda, onboarding, documento, post ou carrossel que fala do ZEUS ou da Central, minisite do ZEUS, capa, banner, e-mail do produto. O visual é o da Central (`central.jefersonhenrike.com`): claro, limpo, roxo como única cor de marca.

## 0. Qual identidade usar (decida antes de abrir o editor)

| A peça é... | Identidade | Onde está |
|---|---|---|
| Do ZEUS / da Central / sobre o ZEUS | **Design ZEUS (este guia)** | tokens em `/root/zeus-2.0/design-system/01-identidade/tokens/zeus-central.css` |
| Post do @jeffhenrike (marca pessoal do Jeff) | Marca Jeff | `/opt/jeff-worker/projetos/design-modelos/marcas/g2Tg5oqEoqg/gosto.md` |
| De cliente (Farias, CIGC, EBC...) | Identidade do cliente | §8 de `/opt/jeff-worker/projetos/clientes/<slug>/contexto.md` |
| Da Alpha Digital (agência) sem pedido específico | Pergunte ao Jeff se vai no Design ZEUS ou na paleta Alpha legada (azul + dourado) | `/root/.claude/agents/gustavo-designer.md` |

Nunca misture: peça do ZEUS não leva o vermelho da marca Jeff nem o azul/dourado legado; post do Jeff não vira roxo.

Decisão do Jeff em 16/10/2026: a cor do ZEUS é o roxo `#673DE6`. Histórico em `/root/zeus-2.0/design-system/01-identidade/IDENTIDADES.md`.

## 1. Cores

| Papel | Cor | Uso |
|---|---|---|
| Marca (única) | `#673DE6` | botão principal, link, ícone ativo, eyebrow, número em destaque, raio do logo |
| Marca hover / escuro | `#5429C9` | hover, gradiente do logo (135°, `#673DE6` → `#5429C9`) |
| Marca suave | `rgba(103,61,230,0.10)` | fundo de chip, item ativo do menu, selo |
| Lilás (tela de voz) | `#8B6CF0`, `#F0ECFD` | brilho, partículas, cartão ativo |
| Fundo da página | `#F6F6F7` | fundo geral |
| Card | `#FFFFFF` | cards, modais, campos |
| Linha | `#E6E6EA` (card), `#DADADF` (campo, botão secundário) | bordas de 1 px |
| Superfície suave | `#F1F1F3`, `#FAFAFA` | hover, chip neutro |
| Texto | `#17171A` (título), `#3C3C44` (corpo), `#66666F` (apoio), `#9A9AA3` (fraco) | |
| Sucesso | `#0F7A68` sobre `rgba(15,122,104,0.10)` | "Publicado", "Ativo", "Liberado", ponto verde |
| Atenção | `#9A6700` sobre `rgba(237,161,0,0.14)` | "Agendado", aviso |
| Info | `#4A6CF7` sobre `rgba(74,108,247,0.10)` | "Em andamento" |
| Erro | `#C0341C` sobre `rgba(192,52,28,0.08)` | "Com erro", excluir |

Regra: **uma cor de marca só**. O resto é cinza. As cores de estado só aparecem em selo, ponto ou número de status, nunca como fundo de bloco grande. Nada de gradiente colorido de fundo, neon, dourado ou azul.

## 2. Tipografia

Google Fonts: `Space Grotesk` (500/600/700), `DM Sans` (400/500/700), `Inter` (só em UI densa).

| Elemento | Fonte | Tamanho (tela) | Em post 1080 px |
|---|---|---|---|
| Título de tela | Space Grotesk 600 | 26 a 28 px | 72 a 96 px |
| Saudação/hero ("Boa tarde, Jefferson.") | Space Grotesk 700 | 56 a 64 px | 96 a 120 px |
| Eyebrow (rótulo acima do título) | DM Sans 700, caixa alta, `letter-spacing:.14em`, roxo | 10 a 11 px | 24 a 28 px |
| Corpo | DM Sans 400 | 13 a 13.5 px | 30 a 34 px |
| Apoio / legenda | DM Sans, `#66666F` | 11.5 a 12.5 px | 24 a 26 px |
| Selo | DM Sans 700 | 10.5 px | 22 px |

Títulos com `letter-spacing:-0.01em` e cor `#17171A`. Logo "ZEUS": Space Grotesk 700, caixa alta, `letter-spacing:.08em`, ao lado do raio.

## 3. Formas, espaço e sombra

- Raios: botão e campo **10 px**; chip/selo **20 px** (pílula); card **14 a 16 px**; logo **8 px**.
- Card: fundo branco, borda `1px solid #E6E6EA`, raio 16 px, padding 22 a 24 px. Sem sombra no estado normal.
- Sombra só em coisa que flutua: menu e popover `0 16px 40px rgba(23,23,26,0.16)`; modal `0 24px 60px rgba(23,23,26,0.25)`.
- Espaço generoso: blocos separados por 16 a 22 px, página com margem lateral de 40 px. Conteúdo de leitura em até 860 px de largura.
- Fundo da Início: grade de pontos e símbolos cinza bem claros sobre `#F6F6F7` (textura sutil, nunca chamativa).

## 4. Componentes

- **Botão principal:** fundo `#673DE6`, texto branco DM Sans 700 13 px, raio 10 px, padding 10 × 16 px, ícone à esquerda.
- **Botão secundário:** branco, borda `#DADADF`, texto `#17171A` 600.
- **Selo:** pílula 10.5 px 700, cor de estado sobre o fundo suave da mesma cor (tabela da seção 1).
- **Chip de filtro:** pílula; ativo = fundo `#17171A` e texto branco, ou fundo roxo suave e texto roxo.
- **Campo:** branco, borda `#DADADF`, raio 10 px, padding 10 × 13 px, texto 13.5 px.
- **Card de lista:** ícone em quadrado roxo suave (raio 9 px) à esquerda, título 13.5 px, linha de apoio 11.5 px cinza.
- **Composer do chat:** caixa branca grande (raio 14 a 16 px), placeholder cinza, rodapé com chip "ZEUS 2.3 MAX", anexos, "@ agente / habilidade", microfone e botão redondo roxo com seta.
- **Tela de voz:** orbe central com foto e anéis de traços roxos, cartões brancos do time ao redor com status de ponto verde, linhas tracejadas com rótulos (pílulas brancas), fundo radial branco → lilás.

Constantes exatas: `/root/zeus-2.0/design-system/02-layout-componentes/central/componentes-e-telas.md`.

## 5. Ícones e logo

- Ícones de linha: traço 1.7, pontas redondas, viewBox 24, cor herdada. Biblioteca dos 76 ícones (SVG prontos): `/root/zeus-2.0/design-system/01-identidade/icones/zeus-icones.json`. Nunca use emoji como ícone de interface.
- Logo: raio branco sobre quadrado roxo com gradiente 135° (`/root/zeus-2.0/design-system/01-identidade/logo/zeus-favicon.svg`) + "ZEUS" em Space Grotesk 700.

## 6. Como as telas são (referência visual)

Antes de desenhar algo que imita a Central, abra com Read 2 ou 3 prints de `/root/zeus-2.0/design-system/02-layout-componentes/central/telas/prints/` (Início, voz, Conversas, LinkedIn, Agentes ZEUS, Rotinas...). Descrição de cada tela: `/root/zeus-2.0/design-system/02-layout-componentes/central/telas/README.md`. Tema escuro: a Central inverte as cores (fundo `#111114`); só desenhe a versão escura se pedirem.

## 7. Modelos prontos (comece por eles)

Pasta `/opt/jeff-worker/projetos/design-modelos/zeus/`:
- `post-zeus.html`: post 1080 × 1350 (eyebrow, título, texto, cards com ícone, rodapé com logo).
- `slide-zeus.html`: slide 1920 × 1080 para apresentação.

Prévias: `post-zeus-previa.png` e `slide-zeus-previa.png` (abra com Read para ver o resultado esperado).

Copie, troque o texto e mantenha a estrutura. Gere com `/opt/jeff-apps/jeff-central/tools/design html` (formato do pedido). Post: confira com `node /opt/jeff-worker/scripts/check-html-arte.js` (o modelo passa com 45 palavras e 8 blocos; não passe disso). Slide e tela: o verificador é calibrado para post de Instagram e reprova slide por tamanho de fonte; confira tirando o print e comparando com a prévia.

## 8. Checklist antes de entregar uma peça ZEUS

1. Só uma cor de marca (`#673DE6`) e cinzas. Nenhum azul, dourado, vermelho, lima ou gradiente colorido.
2. Títulos em Space Grotesk, texto em DM Sans. Nenhuma outra fonte.
3. Cards brancos com borda `#E6E6EA` e raio 14 a 16 px; sombra só em elemento flutuante.
4. Ícones de linha da biblioteca, nunca emoji na interface.
5. Logo é o raio roxo + "ZEUS". Nada de logo inventado.
6. Selos com as cores de estado certas (Publicado verde, Agendado âmbar, Erro vermelho).
7. Compare lado a lado com um print da Central: se não parecer a mesma família, ajuste.
8. Sem travessão no texto.
