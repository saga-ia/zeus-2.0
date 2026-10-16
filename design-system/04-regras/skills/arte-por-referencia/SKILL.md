---
name: arte-por-referencia
description: Regras pra gerar post, carrossel ou arte de Instagram que fique PARECIDO com o print/referencia que o usuario mandou, e pra escolher o motor da arte - IA total (Google Nano Banana ou OpenAI GPT Image, com as referencias anexadas), hibrido (IA faz a imagem sem texto + HTML faz o card com texto exato) ou HTML puro. O usuario escolhe o modo; sem escolha, o Zeus sugere e faz amostra antes do lote. Acionar sempre que houver referencia anexada pra arte, ou pedidos como "faz igual a esse print", "nesse modelo", "baseado nessa referencia", "gera o carrossel", "cria a arte", "muda o motor", "usa a OpenAI/Google", "faz hibrido".
---

# Arte por referência (Agente de Design, Zeus, Nina, Gustavo)

**Arte do ZEUS ou sobre o ZEUS** (sem referência de terceiro): o layout e as cores saem do Design ZEUS, não de modelo da biblioteca: `/opt/jeff-worker/docs/design-system-zeus.md` + modelos em `/opt/jeff-worker/projetos/design-modelos/zeus/`. Post do @jeffhenrike segue o `gosto.md` da marca Jeff; cliente, a §8 do contexto dele.

Ferramenta: `/opt/jeff-apps/jeff-central/tools/design` (rode `design ajuda`). Ilustração sem texto: `/opt/jeff-worker/scripts/ilustra.sh`. Modelo de card de print: `/opt/jeff-worker/projetos/design-modelos/card-de-print.html`.

**Post orgânico x criativo de anúncio:** esta skill é pra POST do perfil (carrossel, card, conteúdo). Se o pedido for **criativo pra anúncio pago** (Meta Ads, tráfego, "criativo", "ad"), use `/root/.claude/skills/criativo-anuncio/SKILL.md` (padrão PRO: prova real, gancho de contraste, preço antes do clique, 3 variações, política do Meta). Na dúvida, pergunte em 1 linha.

## Fluxo seguro em 3 tempos (aprovado pelo Jeff em 08/10/2026)
Foi o fluxo que gerou as artes com 👍 de 08/10 (carrossel de posicionamento `NdVok9VsICM` e card marketing x propaganda `-RGvqs9_HaU`). Use sempre que o pedido envolver foto ou visual novo:

1. **Inspiração primeiro.** Peça (ou receba) as referências: prints ou links de posts que a pessoa quer seguir. Abra cada uma e diga em poucas linhas a estrutura que vai copiar.
2. **Material de trabalho depois.** Peça as imagens em que você vai trabalhar em cima: fotos da pessoa, do produto ou do evento. Referência é o molde e o material é o recheio. Nunca confunda os dois nem use foto de terceiro da referência.
3. **Gerar.** Estrutura da referência copiada fiel + material do usuário. Quando o pedido for "eu em outras posições", "outro cenário" ou "cria eu fazendo X", use `editar-imagem.sh google` a partir da foto real (mantém o rosto) pra criar cenas novas, coloridas e com luz natural. Texto, selo, @ e gráfico ficam em HTML.

Regras do fluxo:
- **Uma pergunta por vez, sem repetir.** Se faltar referência ou material, peça numa mensagem só. Não pergunte o motor de novo a cada resposta: com referência + foto, o padrão é híbrido (edição Google da foto + HTML).
- **1 referência por peça.** Cada lâmina segue UMA referência. Não junte a foto de uma referência no painel do gráfico de outra (erro de 08/10, amostra `oDVJRMEDeeQ` lâmina 1).
- **A cor e o tratamento da foto seguem a referência.** Referência colorida = arte colorida. Preto e branco só se a referência for P&B ou se o usuário pedir. A paleta da marca entra só no destaque (filete, palavra em cor).
- Sem referência ou sem material: peça antes de gerar, em vez de inventar. Exceção: o usuário mandar seguir sem.

## Estilos salvos da marca (decisão do Jeff, 09/10/2026)
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

## 0. Primeiro: olhar a referência (sempre, antes de qualquer arte)
Abra com Read cada print/imagem que o usuário mandou e decida **elemento por elemento**, não por um modo fixo:

| Elemento da referência | Quem faz |
|---|---|
| Texto (título, corpo, lista, número, legenda na arte) | **HTML** (texto exato, na ordem, sem erro) |
| Selo, nome, @, foto do perfil, logo | **HTML** com o arquivo real (foto: `projetos/clientes/<slug>/avatar.png`) |
| Emoji, seta, ícone simples | **HTML** (Twemoji como imagem / SVG) |
| Gráfico com números reais, tabela, barra | **HTML/SVG** (número exato) |
| Fundo liso, cor, forma, moldura, card | **HTML/CSS** |
| Foto, cena, objeto 3D, ilustração, personagem, textura, montagem | **Geração de imagem** (GPT Image por padrão; Google se pedirem), **sem texto** dentro |
| **Foto que já existe** (do usuário, do produto, do cliente) que precisa de efeito: trocar fundo, colocar a pessoa num cenário (palco, escritório, evento), luz/cor de cinema, estilo (3D, ilustração, P&B, neon), retoque, juntar 2+ imagens, remover objeto | **Edição de imagem com IA**: `/opt/jeff-worker/scripts/editar-imagem.sh google "<o que mudar>" saida.png foto.png [outra.png] --formato retrato` (Google por padrão: mantém o rosto idêntico, testado 07/10/2026 com a foto do Jeff num palco). Depois entra no HTML como a imagem do card. |

Resultado:
- **Referência só com texto/forma** (card de frase, lista, citação): **só HTML**, custo zero. Não gere imagem à toa.
- **Referência com texto + imagem forte** (ex: card de print com foto embaixo): **híbrido**: HTML no texto e a IA só na imagem.
- **Referência que é basicamente uma imagem** (capa com foto e 2 a 4 palavras): pode ser IA total, ou imagem por IA com as palavras em HTML por cima.
- Nunca usar a IA de imagem pra escrever parágrafo: a letra sai errada, fora de ordem e feia (reprovado pelo Jeff em 07/10/2026).

Antes de gerar, diga em 2 ou 3 linhas o que viu na referência e a divisão (o que vai em HTML, o que vai em imagem). Se não tiver referência, use a mesma tabela a partir do que o post precisa.

**Gasto:** toda imagem de IA (Agente de Design, `ilustra.sh`, `editar-imagem.sh`) é registrada sozinha; resumo com `/opt/jeff-worker/scripts/gasto-ia-imagem.py`. Ao entregar um lote, diga quanto custou.

**Sem crédito ou falha num motor:** use o outro e avise o usuário em 1 linha. `ilustra.sh openai` já cai pro Google sozinho. Em 07/10/2026 a OpenAI ficou sem crédito: enquanto o Jeff não recarregar, o híbrido roda com imagem do Google (~US$ 0,13 por imagem em vez de ~US$ 0,04).

**Layout:** NUNCA usar os modelos do OpenDesign (pôster tipográfico gigante, estilo revista/jornal, card de citação escuro e afins): o Jeff reprovou em 07/10/2026 ("horríveis, nunca mais"), e eles foram removidos. **Sem referência no pedido: primeiro os estilos salvos da marca** (`tools/estilo listar <marca>`, seção "Estilos salvos da marca" acima) e o `projetos/design-modelos/marcas/<marcaId>/gosto.md`; se a marca não tiver estilos, peça prints ou links de referência. **Sem gosto salvo e sem resposta: mostre 2 ou 3 modelos da biblioteca de estruturas** (`/opt/jeff-worker/projetos/design-modelos/estruturas/INDICE.md`, imagens no chat com `![e05](/api/design/arquivo/estruturas-ref/v1-s5-e05.jpg)`) e deixe ele escolher; método completo na skill `analise-design-post` (seção B). Também vale o card aprovado (`/opt/jeff-worker/projetos/design-modelos/card-de-print.html`). Nunca inventar estilo do zero.

**Referência com FOTO DE PESSOA (o caso mais comum: capa de revista, foto com caixa branca de texto, palco com etiquetas, legenda tipo filme):** a foto é o centro do post e o HTML nunca substitui. Use foto real do cliente (enviada, da Biblioteca ou do Instagram) ou crie a cena a partir da foto dele com `editar-imagem.sh google` (mantém o rosto; ex: palco, rua, estúdio escuro de revista). O HTML só copia a estrutura do texto por cima: título condensado (Anton) branco e vermelho com degradê escuro embaixo, caixa branca arredondada, etiquetas brancas linha a linha, legenda branca com sombra. Erro de 06/10/2026: o Zeus trocou essas fotos por tipografia em HTML e nada ficou parecido. Amostra que corrigiu: criação `vjvQmv_nIAQ` (7 estruturas, HTMLs em projetos/design-modelos/estruturas/ se o Jeff aprovar).

## 1. O usuário escolhe o modo (opcional)
Se o pedido disser o modo, obedeça. Nomes que o usuário pode usar:

| Modo | Como pedir | O que é | Custo aprox. por arte |
|---|---|---|---|
| **IA Google** | "IA Google", "Nano Banana" | A IA desenha a arte inteira, texto incluso | ~US$ 0,13 |
| **IA OpenAI** | "IA OpenAI", "GPT Image" | Idem, estilo mais dramático/editorial | ~US$ 0,04 (Flare) / ~US$ 0,08 (Sunburst) |
| **Híbrido Google** / **Híbrido OpenAI** | "híbrido", "híbrido com Google/OpenAI" | A IA faz só a imagem (sem texto) e o HTML monta o card: texto 100% exato, foto real do perfil, emoji certo | imagem ~US$ 0,13 (Google) / ~US$ 0,04 (OpenAI) |
| **HTML** | "só HTML", "tipográfico", "sem custo" | Arte só com tipografia e formas, sem foto nem ilustração | grátis |

A escolha vale **pro pedido atual** (ou pro lote combinado). Nunca trave um modo pro resto da conversa sem o usuário dizer "a partir de agora sempre X".

## 2. Sem escolha do usuário: o que sugerir
**Quando a arte precisa de imagem, o padrão aprovado pelo Jeff (07/10/2026) é HÍBRIDO OPENAI** (decidido pela tabela do item 0; sem necessidade de imagem, é só HTML). HTML faz todo o texto, o selo e a foto real do perfil; o GPT Image 2.5 faz só a imagem/ilustração, sem texto. Foi a única das 6 comparações que ele aprovou. IA total (a IA escrevendo as letras) foi reprovada pra post com texto: desperdício, texto fora de ordem, rosto inventado e visual feio.

- **Tem referência anexada (print, post, carrossel de alguém):** a referência MANDA no layout. Faça **1 amostra no Híbrido OpenAI** e peça aprovação antes do lote. Só ofereça outro modo se o usuário pedir ou se a amostra for reprovada.
- **A arte depende de foto, ilustração, objeto, cena** (como os prints com imagem forte embaixo): nunca HTML puro. Híbrido (OpenAI por padrão; Google se o usuário pedir).
- **IA total só quando o usuário pedir** ou quando a arte quase não tem texto (ex: capa só com imagem e 2 a 4 palavras).
- **Texto longo ou com muitos números que não podem errar:** híbrido.
- **Card de frase, lista, citação, aviso tipográfico de propósito:** HTML pode.

## 3. Fidelidade à referência
1. Antes de criar, descreva em 3 linhas o que a referência tem: fundo, estrutura (ex: card de tweet), tipo de letra (caixa alta ou normal), onde fica a imagem e que tipo de imagem (foto, 3D, gráfico, ilustração), elementos fixos (selo, emoji, seta).
2. Copie o **layout e o estilo**, nunca o texto, a marca ou a foto de terceiros.
3. A marca do usuário entra **só** em: selo/foto do perfil, nome e @, e cor de destaque (se combinar). Ela não troca o fundo, a fonte nem a estrutura da referência.
4. **Foto do perfil é sempre a real.** Jeff: `/opt/jeff-worker/projetos/clientes/jeffhenrike/avatar.png`. Em IA total, mande ela como anexo com a nota "foto do perfil: use exatamente este rosto no selo"; se a IA inventar outro rosto, refaça ou use híbrido. Marca sem foto salva: peça antes.
5. Nunca substituir a imagem forte da referência por gráfico de barras ou caixa de texto.
6. **Conteúdo: só o que o usuário pediu.** Nunca inventar oferta, desconto, preço, selo, público ("oferta para sócios"), frase de efeito ou bloco extra. Cada informação vai só na peça a que pertence: desconto só na peça de oferta, critério de público só na de critério. Se o pedido não deixa claro qual peça leva o quê, pergunte numa mensagem antes de gerar. Erro de 06/10/2026 (Conselho do Dono): "20% OFF" no card de critério e frases inventadas; Jeff: "horrível, poluída, colocou coisa que não era para colocar".
7. **Densidade igual à da referência.** Conte os blocos de texto da referência (ex: modelo do Conselho do Dono = 4: chapéu, título, data/cidade, faixa) e não passe disso. **1 mensagem por peça**, legível em 1 segundo. Peça com mais de 35 palavras ou 6 blocos é exceção (carrossel de conteúdo), nunca card de oferta ou story. Variar entre peças = trocar foto, enquadramento e a mensagem principal, não empilhar elementos.
8. **Texto nunca por cima da pessoa** (rosto, corpo, mão, braço): texto vai em área livre da foto, no degradê ou na faixa. Confira olhando a prévia.

## 4. Como executar cada modo
**IA total** (`design criar`): JSON montado com `json.dumps` (nunca aspas na mão), `motor` = `gemini` ou `openai` (`qualidade` `medium` = Flare, `high` = Sunburst), `anexos` = os prints de referência + a foto do perfil, `notas` = "referência de LAYOUT e estilo (não copiar o texto)" pra cada print e "foto do perfil: use exatamente este rosto" pra foto. Em **Elementos Visuais** descreva o layout da referência (item 3.1) e a imagem que deve aparecer.

**Híbrido:**
1. `ilustra.sh google|openai "<cena, sem texto>" /caminho/img.png paisagem [refs de estilo]`.
2. Copie `card-de-print.html` (ou monte outro HTML seguindo a referência), troque `{{AVATAR}}` por `file:///...avatar.png` e `{{IMAGEM}}` por `file:///...img.png`, escreva o texto. Emoji sempre como imagem Twemoji (`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/<codigo>.svg`), nunca o caractere (a fonte do servidor não tem emoji).
3. `design html '{"marca":..., "formato":..., "arquivos":[...]}'` (carrossel: 1 HTML por lâmina).

**HTML puro:** `design html` como já existe.

## 5. Volume
- Lote grande ("faz 98"): **amostra aprovada primeiro**, depois lotes de 5 a 10 carrosséis por resposta, sempre no modo aprovado. Informe custo estimado do lote antes (ex: 10 carrosséis de 8 lâminas em IA Google ≈ US$ 10).
- Varie o conteúdo, não o modelo aprovado: o usuário pediu aquele visual.
- Toda arte gerada aparece em Criações e na Biblioteca › Agente de Design.

## 6. Qualidade: zero erro (obrigatório, nesta ordem)
1. **Antes de criar:** `/opt/jeff-worker/scripts/feedback-arte.sh <marca>`. Abra com Read 2 ou 3 arquivos 👍 mais recentes (o script mostra o caminho) e repita a receita deles: 👍 é o sinal de que o caminho está certo. Nunca repita o que teve 👎, e o comentário do 👎 é regra. Se a marca ainda não tem 👍, siga o fluxo de 3 tempos e peça avaliação na entrega. O script mostra primeiro o `gosto.md` da marca e depois os **comentários escritos** no chat logo após cada entrega (elogio, crítica, correção), com as artes de que falam.
   **Elogio ou correção escrita vale tanto quanto o 👍/👎.** Quando a pessoa elogiar ("ficou muito bom", "esse é o caminho", "faz mais nesse formato") ou corrigir uma preferência ("sou mais magro", "Mercedes preta", "selo com fundo escuro"), atualize na mesma resposta `/opt/jeff-worker/projetos/design-modelos/marcas/<marcaId>/gosto.md`: o que foi aprovado (estilo, motor, estrutura, criação) ou a correção, com a data. Esse arquivo é o primeiro lugar que você lê no próximo pedido daquela marca.
2. **Verificador técnico das lâminas HTML:** `node /opt/jeff-worker/scripts/check-html-arte.js s1.html s2.html ...`. Qualquer REPROVADO (texto vazando/cortado/sobreposto/coberto, texto espremido contra faixa ou rodapé, arte poluída com mais de 50 palavras ou 8 blocos, fonte que não carregou, imagem ou emoji quebrado, travessão, texto < 20 px, emoji como caractere) = corrigir e rodar de novo até tudo OK. ATENÇÃO de densidade (mais de 35 palavras ou 6 blocos) = cortar texto, a não ser que a referência seja igualmente densa. Lâmina de miolo de carrossel de conteúdo (lista, gráfico com legenda) pode usar `--texto-longo`; card de oferta e story nunca. Stories: `--largura 1080 --altura 1920`. Ele também salva `sN.check.png`.
3. **Vazio e sentido:** `/opt/jeff-worker/scripts/check-arte.py s*.check.png`. REPROVADO (vazio grande no meio) = refazer. ATENÇÃO = confirmar que é intencional como na referência. Todo elemento visual precisa ter sentido com o texto (gráfico com rótulos, nunca curva solta).
4. **Olhar de verdade:** abra cada `sN.check.png` com Read e compare com a referência lado a lado: estrutura, proporção, foto real, rosto do perfil, cores, ordem do texto. Pergunte a cada peça: tem algo que o usuário NÃO pediu? tem mais blocos que a referência? tem texto sobre a pessoa? Qualquer sim = corrigir.
5. **Só então gere** (`design html` / `html-refazer`) e rode `check-arte.py` nos PNGs finais.
6. **Entrega:** mostre as artes no chat com `![lâmina N](URL)`. Embaixo de cada arte o chat mostra 👍 👎 💬: termine pedindo "Avalie cada lâmina (👍/👎/💬) que eu ajusto e aprendo pras próximas". Feedback recebido vira regra na próxima arte da mesma marca.

Nunca entregue arte que não passou nos passos 2 e 3. Se algo não dá pra resolver, diga qual lâmina e por quê, em vez de entregar com defeito.

