# Identidades visuais do Zeus

## Decisão (17/10/2026, Jeff): visual "roxo + magenta" na Central

- O roxo `#673DE6` continua sendo a cor do ZEUS. Entra o **magenta** `#BE185D` (rosa `#EC4899`, rosa claro `#F9A8D4`) como acento, e a moldura muda: fundo aurora roxo e rosa, menu flutuante escuro em degradê, faixa de cabeçalho em degradê por seção, cards em branco tingido.
- Origem: handoff em [`../novo-visual/design_handoff_zeus_central_magenta/`](../novo-visual/design_handoff_zeus_central_magenta/). Na Central desde 17/10/2026 (`zeus-visual.css` + `zeus-visual.js`).
- Tokens: bloco `--zeus-mg-*` e faixas `--zeus-faixa-*` em [`tokens/zeus-central.css`](tokens/zeus-central.css). Como a Central aplica: [`visual-roxo-magenta.md`](../02-layout-componentes/central/visual-roxo-magenta.md).
- Só valem os degradês listados nos tokens. Texto nunca em degradê.

## Decisão (16/10/2026, Jeff): a cor do Zeus é o ROXO da Central

- **Oficial:** tema roxo da Central, `#673DE6` (hover `#5429C9`), com Space Grotesk nos títulos e DM Sans no texto. Os tokens estão em [`tokens/zeus-central.css`](tokens/zeus-central.css).
- Toda tela, app ou peça nova do Zeus usa esses tokens.
- As outras identidades abaixo viram **legado**: ficam documentadas só pra consulta e pra migrar os apps antigos.
- A marca pessoal @jeffhenrike (posts do Instagram) é conteúdo do Jeff, não do produto, e continua seguindo o [`gosto.md`](marca-jeff/gosto.md) até ordem contrária.

## Como estava antes da decisão

Até 16/10/2026 existiam cinco identidades que se contradiziam. Os tokens de cada uma estão em [`tokens/`](tokens/).

| Identidade | Cor principal | Fundo | Fontes | Onde aparece | Tokens |
|---|---|---|---|---|---|
| **Zeus Central** (roxo) ✅ OFICIAL | `#673DE6` | claro `#F6F6F7` | Space Grotesk + DM Sans + Inter | Central (`central.jefersonhenrike.com`), login, convite, posts da Central, logo (raio) | `zeus-central.css` |
| **SAGA** (lima neon) | `#C4FF0E` | escuro `#0F0F0F` | system-ui / Inter | Painel do worker, site Alpha (`/opt/jeff-sites/alpha`), reset de senha (jeff-shared) | `outras-identidades.css` → `saga` |
| **VPS** (lima + azul-noite) | `#C8FA4D` | escuro `#0D1117` | system-ui / Inter | vps-monitor, painel de clientes Alpha | `outras-identidades.css` → `vps` |
| **Gustavo** (azul + dourado) | `#007BFF` + `#F4B942` | escuro `#05070B` | Bebas Neue / Anton + Inter / Montserrat | Posts premium do agente Gustavo (maio/2026) | `outras-identidades.css` → `gustavo` |
| **Marca Jeff** (preto/branco/vermelho) | `#FF0000` | preto ou branco | Anton + DM Sans | Posts do @jeffhenrike aprovados em out/2026 | `outras-identidades.css` → `marca-jeff` |
| **Apps de post** (violeta) | `#7C3AED` / `#6C63FF` | escuro | — | jeff-zeus-post, myIG (zeuschatig), zeus-platform | `outras-identidades.css` → `apps-post` |

Ainda existem temas soltos de apps internos (ads-dashboard, sistemas, board-org, creator-lab, agenda-turbo etc.), cada um com cores próprias e sem padrão comum.

## Contradições encontradas

1. ~~**Qual é a cor do Zeus?**~~ **Resolvido em 16/10/2026: roxo `#673DE6`.** Antes, a Central usava roxo, o documento de estética ([`estetica-e-voz-alpha.md`](estetica-e-voz-alpha.md)) dizia lima `#C4FF0E` e os apps de post usavam violeta `#7C3AED`.
2. **Posts da marca Jeff:** o [`contexto-marca.md`](marca-jeff/contexto-marca.md) manda usar o "azul Alpha" (Gustavo). Já o [`gosto.md`](marca-jeff/gosto.md), escrito a partir do que o Jeff aprovou de verdade em outubro, diz preto, branco e vermelho.
3. **A skill site-premium proíbe Inter e gradiente roxo** pra sites de cliente. A Central usa os dois, o que está certo pra produto interno, mas vale deixar a regra escrita.
4. **Logo:** o único logo do Zeus é o [`zeus-favicon.svg`](logo/zeus-favicon.svg), um raio branco sobre um quadrado roxo. Não existe versão em PNG nem logotipo com o nome.
5. **Brand kit:** a Central tem brand kits de clientes e da marca Jeff, mas **não tem um do Zeus nem da Alpha**.

## Migração pendente

Esses lugares ainda não estão no roxo e precisam ser migrados um por um, com ok do Jeff antes de mexer em produção:

- **Documentos que ainda mandam outra cor:**
  - `worker/zeus/06_estetica_voz.md` (lima SAGA/VPS)
  - `agents/gustavo-designer.md` (azul + dourado)
  - seção 8 de `projetos/clientes/jeffhenrike/contexto.md` (azul Alpha)
- **Apps violeta:** jeff-zeus-post, myIG (zeuschatig), zeus-platform.
- **Apps SAGA/VPS:** painel do worker, site Alpha, reset de senha (jeff-shared), vps-monitor, painel de clientes Alpha.
- **Landing ZEUS Central** (`public-sites/zeus-central`): hoje em vermelho `#FF5757`.
- **Logo:** falta a versão em PNG e o logotipo com o nome "ZEUS" no roxo oficial.
- **Peças e modelos do ZEUS:** `post-zeus.html` e `slide-zeus.html` já estão no visual roxo + magenta (17/10/2026); o guia dos agentes (`design-system-zeus.md`), Gustavo, Eduardo, Tomé, site-premium, arte-por-referencia, time-gustavo e maicom-visual foram atualizados em 23/10/2026.
