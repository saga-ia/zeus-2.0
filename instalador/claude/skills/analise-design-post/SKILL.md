---
name: analise-design-post
description: Analisa o DESIGN de posts de imagem e carrosseis do Instagram (link do post ou print) e transforma em modelo reutilizavel - tipo de post, sistema visual (fundo, tipografia, cores, tratamento de foto, destaques, componentes), estrutura lamina a lamina, por que funciona e como recriar no Zeus (HTML x IA de imagem x foto editada). Salva na biblioteca de estruturas e, quando o usuario pede um post, mostra 2 ou 3 modelos alternativos da biblioteca pra ele escolher. Acionar com "analisa esse post", "analisa o design", "quero um post nesse estilo", "salva como modelo", "me mostra modelos", "que modelos voce tem", "inspiração de post".
---

# Análise de design de post (irmã do analisador de Reels)

O analisador de Reels (Creator Lab + Jev, `social-perfil-pesquisa`) entende **o que** o vídeo diz. Esta skill entende **como o post de imagem é feito**, pra fazer um novo no mesmo conceito, com a marca e o conteúdo do usuário.

Biblioteca: `/opt/jeff-worker/projetos/design-modelos/estruturas/` (`INDICE.md` + uma pasta `<id>-<slug>/` com `ficha.md` e `referencia.jpg`). Coletas brutas: `estruturas/_coleta/<shortcode>/`.

## A. Analisar um post novo
1. **Coletar**
   - Link de post do Instagram: `/opt/jeff-worker/scripts/coletar-post.sh <url> [url2...]` (Apify, centavos). Baixa todas as lâminas, `folha.jpg` (todas lado a lado) e `post.json` (legenda, curtidas, comentários).
   - Print/imagem no chat: use o arquivo anexado direto.
2. **Olhar de verdade:** abra `folha.jpg` com Read e depois 2 ou 3 lâminas inteiras (capa, uma do miolo, CTA). Não descreva sem ter visto.
3. **Preencher a ficha** (mesmo formato das fichas existentes):
   - **Tipo:** thread de tweet, storytelling com fotos, lista/tipos, passo a passo, editorial, capa de impacto, case, comparação, meme, citação, bastidor.
   - **Quando usar:** objetivo (alcance, salvamento, venda, autoridade), nº de lâminas.
   - **Sistema visual:** fundo (cor/hex aproximado, textura), tipografia (família parecida no Google Fonts, peso, caixa, tamanho relativo), cores de destaque (hex), tratamento de foto (real, P&B, recortada, em quadro arredondado, tela cheia com degradê), destaques (tarja, gradiente, sublinhado, manuscrito, setas), componentes fixos (selo de perfil, pílula "PASSO N", paginação, botão "arrasta").
   - **Estrutura das lâminas:** papel de cada uma (gancho, contexto, virada, prova, método, oferta, CTA).
   - **Por que funciona:** gancho, leitura em 1 s, contraste, salvabilidade. Se tiver `post.json`, cite curtidas e comentários.
   - **Como recriar no Zeus:** elemento por elemento. HTML pra texto, selo, números, emoji Twemoji e "telas". IA de imagem só pra foto/cena/ilustração sem texto (`ilustra.sh`). Foto do cliente em cena nova com `editar-imagem.sh google`.
   - **Cuidados:** direitos (nunca copiar texto, logo, foto ou marca de terceiro; foto de celebridade só como notícia), dados com fonte.
4. **Salvar** (só se o usuário quiser guardar como modelo): crie `estruturas/e<NN>-<slug>/` com `ficha.md` e `referencia.jpg` (folha ou print, até 1400 px). Copie também pra `/opt/jeff-apps/jeff-central/data/social/_criacoes/estruturas-ref/v1-s<NN>-e<NN>.jpg` e acrescente a linha no `INDICE.md`.

## B. Usuário pede um post (sem referência própria)
1. Leia `INDICE.md` e escolha **2 ou 3 modelos** que combinam com o objetivo e o conteúdo (guia rápido):
   - história longa, bastidor, case → e01/e02 (tweet), e14 (bloco à mão, íntimo)
   - lista salvável ("N técnicas/erros/tipos") → e13 (marca-texto + ícones, só HTML), e05 (com personagem ilustrada)
   - método com números → e06; passo a passo curto com isca no direct → e14
   - curadoria de tendências/ferramentas/exemplos → e15 (celular com print)
   - venda/oferta → e03/e04; só capa → e07/e08/e12; lâminas de miolo com foto → e09/e10/e11
   - custo zero (sem IA de imagem): e01, e02, e06 (miolo), e13, e15 (miolo)
2. **Mostre as referências no chat** (a Central renderiza):
   `![e05](/api/design/arquivo/estruturas-ref/v1-s5-e05.jpg)`
   Para cada uma: nome, 1 linha de por que serve pra esse pedido. Pergunte qual (ou mistura) ele quer. No WhatsApp, mande o caminho local de `referencia.jpg` como imagem.
3. Com o modelo escolhido: leia a `ficha.md`, depois siga `/root/.claude/skills/arte-por-referencia/SKILL.md` (híbrido por elemento, amostra antes do lote, revisão zero erro da §6, pedido de 👍/👎/💬). Cores e fontes da marca do cliente (contexto §8) prevalecem sobre as da referência; a ESTRUTURA vem do modelo.
4. Usuário pediu "mais opções": mostre outros 2 ou 3 do índice que ainda não viu.

## C. Analisar um perfil inteiro de posts de imagem
`/opt/jeff-worker/scripts/social-posts.sh` traz os posts e as medianas; rode `coletar-post.sh` nos 3 com melhor desempenho por mil alcançados e faça a ficha de cada. Diga qual estrutura ganha no perfil.

## D. Estilos do cliente (por marca, até 7)
Cada marca guarda até **7 estilos**; cada estilo junta várias referências (print ou link de post, que traz todas as lâminas), a receita, as artes aprovadas nele e as correções. Ferramenta: `/opt/jeff-apps/jeff-central/tools/estilo` (rode `estilo ajuda`). A pessoa também vê e edita na aba **Estilos** do Agente de Design.
1. **Antes de criar:** `estilo listar <marca>`.
2. **Pedido cita um estilo** ("no estilo charge", "igual aquele da caixa branca"): `estilo ver <marca> <estilo>`, abra com Read as referências e as artes aprovadas, siga a receita e as correções, e rode `estilo usar <marca> <estilo>`. Não peça os prints de novo.
3. **Pedido sem estilo e sem prints, e a marca tem estilos:** mostre as capas (`estilo mostrar <marca>` imprime as linhas `![nome](url)`) e pergunte com botões qual usar, incluindo a opção de mandar referências novas:
   ```zeus-opcoes
   {"pergunta":"Qual estilo eu uso?","opcoes":[{"titulo":"Charge fundo vermelho","desc":"3 referências, 6 artes aprovadas","resposta":"Usa o estilo Charge fundo vermelho."},{"titulo":"Referência nova","desc":"Mando prints ou links agora","resposta":"Vou mandar referências novas."}]}
   ```
4. **Prints ou links novos:** fluxo de 3 tempos. Quando a pessoa aprovar a amostra (👍 ou elogio), SEMPRE pergunte antes de salvar, com botões:
   ```zeus-opcoes
   {"pergunta":"Salvo esse estilo pra usar de novo?","opcoes":[{"titulo":"Salvar como \"<nome sugerido>\"","desc":"Fica na aba Estilos, com os prints e esta arte","resposta":"Salva o estilo como <nome sugerido>."},{"titulo":"Outro nome","desc":"Eu digo o nome","resposta":"Salva o estilo com outro nome: "},{"titulo":"Não salvar","desc":"Foi só pra esta arte","resposta":"Não precisa salvar o estilo."}]}
   ```
   Sim: `estilo criar <marca> "<nome>" <caminhos dos prints e links usados>`, escreva a receita num arquivo e grave com `estilo receita <marca> <estilo> --arquivo receita.md` (tipo de post, fundo, fontes, cores, foto colorida ou P&B, blocos de texto, motor, o que copiar de cada referência) e guarde a arte aprovada com `estilo exemplo <marca> <estilo> <url da arte>`. Mais prints para um estilo que já existe: `estilo add`.
   Limite de 7: o `criar` recusa. Mostre as capas, pergunte qual substituir e só rode `estilo excluir` com o ok da pessoa.
5. **Depois de usar um estilo salvo:** arte aprovada → `estilo exemplo`; correção ("sem preto e branco", "selo escuro") → `estilo correcao`. Se a correção vale para a marca toda, também no `gosto.md`.
6. O `gosto.md` da marca guarda só o que vale para todos os estilos (selo, corpo, paleta). O `refs-marca.sh` (máximo 5 referências soltas) foi substituído pelos estilos: não use mais.

Ao analisar um print ou link que a pessoa mandou como referência, a análise vira a receita do estilo quando ele for salvo.

## Regras
- Inspiração de **estrutura e sistema visual**; o conteúdo é do usuário. Nunca reproduzir o post de terceiro.
- Sem modelos do OpenDesign (reprovados pelo Jeff).
- Ficha em PT-BR, sem travessão.
