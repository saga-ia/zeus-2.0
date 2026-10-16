# Identidades visuais do Zeus (estado em 16/10/2026)

Hoje o Zeus não tem uma identidade única. Existem cinco, e elas se contradizem.
Os tokens de cada uma estão em [`tokens/`](tokens/).

| Identidade | Cor principal | Fundo | Fontes | Onde aparece | Tokens |
|---|---|---|---|---|---|
| **Zeus Central** (roxo) | `#673DE6` | claro `#F6F6F7` | Space Grotesk + DM Sans + Inter | Central (`central.jefersonhenrike.com`), login, convite, posts da Central, logo (raio) | `zeus-central.css` |
| **SAGA** (lima neon) | `#C4FF0E` | escuro `#0F0F0F` | system-ui / Inter | Painel do worker, site Alpha (`/opt/jeff-sites/alpha`), reset de senha (jeff-shared) | `outras-identidades.css` → `saga` |
| **VPS** (lima + azul-noite) | `#C8FA4D` | escuro `#0D1117` | system-ui / Inter | vps-monitor, painel de clientes Alpha | `outras-identidades.css` → `vps` |
| **Gustavo** (azul + dourado) | `#007BFF` + `#F4B942` | escuro `#05070B` | Bebas Neue / Anton + Inter / Montserrat | Posts premium do agente Gustavo (maio/2026) | `outras-identidades.css` → `gustavo` |
| **Marca Jeff** (preto/branco/vermelho) | `#FF0000` | preto ou branco | Anton + DM Sans | Posts do @jeffhenrike aprovados em out/2026 | `outras-identidades.css` → `marca-jeff` |
| **Apps de post** (violeta) | `#7C3AED` / `#6C63FF` | escuro | — | jeff-zeus-post, myIG (zeuschatig), zeus-platform | `outras-identidades.css` → `apps-post` |

Ainda existem temas soltos de apps internos (ads-dashboard, sistemas, board-org, creator-lab, agenda-turbo etc.), cada um com cores próprias e sem padrão comum.

## Contradições que precisam de decisão

1. **Qual é a cor do Zeus?** A Central usa roxo `#673DE6`. O documento oficial de estética ([`estetica-e-voz-alpha.md`](estetica-e-voz-alpha.md)) diz lima `#C4FF0E`. Os apps de post usam violeta `#7C3AED`.
2. **Posts da marca Jeff:** o [`contexto-marca.md`](marca-jeff/contexto-marca.md) manda usar o "azul Alpha" (Gustavo). Já o [`gosto.md`](marca-jeff/gosto.md), escrito a partir do que o Jeff aprovou de verdade em outubro, diz preto, branco e vermelho.
3. **A skill site-premium proíbe Inter e gradiente roxo** pra sites de cliente. A Central usa os dois, o que está certo pra produto interno, mas vale deixar a regra escrita.
4. **Logo:** o único logo do Zeus é o [`zeus-favicon.svg`](logo/zeus-favicon.svg), um raio branco sobre um quadrado roxo. Não existe versão em PNG nem logotipo com o nome.
5. **Brand kit:** a Central tem brand kits de clientes e da marca Jeff, mas **não tem um do Zeus nem da Alpha**.

## Proposta (aguardando ok do Jeff)

- **Produto Zeus** (Central, apps internos, myIG, zeus-post): roxo da Central como padrão único. Os apps violeta migram aos poucos.
- **Marca pessoal @jeffhenrike**: preto, branco e vermelho, como está no `gosto.md`. Corrigir a seção 8 do `contexto.md`.
- **Alpha Digital (agência)**: escolher entre a SAGA (lima) e a Gustavo (azul + dourado). Hoje as duas aparecem como "oficiais".
