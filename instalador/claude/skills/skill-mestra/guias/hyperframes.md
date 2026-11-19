# Construir animações no HyperFrames

O HyperFrames transforma HTML, CSS e GSAP em vídeo, por linha de comando (`npx hyperframes …`). Abaixo, o que foi aprendido apanhando em vídeos reais: o jeito de trabalhar e as armadilhas. Confira os comandos e as opções na documentação da versão em uso: elas mudam.

## Jeito de trabalhar
- **Versão:** a mais nova a cada vídeo novo, **fixa dentro do vídeo** (anotada no estado do vídeo; todo comando leva a versão: `npx --yes hyperframes@<versão> …`). Trocar no meio de um vídeo pode mudar o desenho do que já foi aprovado.
- **Um projeto por animação** (ou por sequência encadeada, como um gancho com várias trocas), dentro da pasta de trabalho do vídeo.
- **Componha em 1080p e renderize na resolução do vídeo** (ex.: 4K). O desenho é o mesmo, só com mais pixels. Mais rápido para trabalhar e para os snapshots.
- **Duração exata:** a duração da raiz é `(N − 0,5) / fps`, com `N` = número de frames que a animação ocupa na sequência. O render arredonda `duração × fps` para cima; com a conta direta, alguns itens saem com 1 frame a mais.
- **Desfoque de movimento** ligado na raiz (`data-motion-blur="on"`), no modo `data-motion-blur-tier="filter"` (ver armadilhas).
- **Peças-base:** a primeira vez que um elemento ficar bom (card, etiqueta, fundo, ênfase), transforme em peça reaproveitável: o visual em CSS no perfil, o movimento em funções JS. Os próximos vídeos partem delas, e a qualidade não depende de acertar tudo de novo.
- **CSS embutido** no `index.html`, nunca por `<link>`: o link mudou o desenho das letras no render.
- **Ciclo de cada animação:**
  1. `check` e corrigir todos os erros (o aviso de primeiro quadro vazio é esperado numa animação que começa chegando);
  2. `snapshot` nos momentos-chave (entrada, ápice, saída) e **olhar**: texto legível, nada encoberto, transparência certa, dentro da área segura;
  3. render;
  4. conferir um ou dois quadros do arquivo final.
- **Formatos de saída:**
  - tela cheia: MP4;
  - sobreposição: MOV ProRes 4444, com transparência, que o programa de edição lê.
  - Confira a resolução, a taxa de quadros e o número de frames do arquivo antes de entregar.
- **Fila em segundo plano:** várias animações renderizam em fila enquanto o Claude constrói a próxima. Referência: ~25 s de render para 7 s de animação em 4K; renderizar em 1080p economiza só ~8 s por animação, porque a maior parte do tempo é fixa (abrir o navegador e carregar a cena).
- **Nunca sobrescrever** um render já entregue: `_v01`, `_v02`…
- **Asset faltando:** construa com um marcador visível no lugar ("ASSET FALTANDO: logo X"), no mesmo tamanho e tempo. Quando o arquivo chegar, troque e renderize de novo só aquela animação.
- **Texto:** no mínimo 28 px em 1080p (56 px em 4K), para ler no celular, e dentro da área segura (80% do quadro).

## Eventos para o som
Ao construir, anote num arquivo de eventos tudo o que um editor de som ia querer saber: o que **chega, sai, bate, troca, clica, digita, conta, revela**. Cada evento leva:
- o tempo;
- o tipo, com palavras livres que digam o que acontece (`vidro_trinca`, `ponteiro_trava`, não só "impacto");
- a força (leve, média ou forte);
- a duração, quando dura;
- uma descrição para quem vai escolher o som ("card de vidro grande desce rápido e trava com tranco").

A etapa de som parte disso. Movimento de "vida" (deriva, partícula, reflexo) não é evento.

## Armadilhas (cada uma custou uma rodada)
- **Snapshot e render só mostram o mesmo se:**
  - todo movimento encadeado tiver a partida explícita (`fromTo`; com `to`, a partida é lida da tela);
  - todo tween novo tiver `lazy: false` (senão o GSAP adia o primeiro quadro);
  - tweens na mesma propriedade não se sobrepuserem: corte o anterior onde o próximo começa.
- **`fromTo` que começa visível** (opacidade > 0 no "from"): sempre `immediateRender: false`, senão o estado inicial aparece desde o tempo 0.
- **Origem da transformação** num tween com `immediateRender: false`: quando o quadro é calculado pulando direto (snapshot, render em paralelo), a origem não vale e o zoom sai deslocado. Fixe com `tl.set(alvo, {transformOrigin: …}, <início do tween>)`.
- **Medir layout** (largura de uma palavra, de uma etiqueta): monte a timeline dentro de `document.fonts.ready.then(…)`.
- **Texto com gradiente corta a última letra:** com `background-clip: text` e espaçamento negativo, a caixa termina antes do desenho da última letra. Sempre dar folga: `display: inline-block; padding: 0.1em 0.14em; margin: -0.1em -0.14em;` (o layout não muda). Confira a última letra de toda palavra com gradiente num quadro do render final.
- **Desfoque de movimento:**
  - no modo padrão ("capture"), os elementos animando são desenhados por cima de tudo (o fundo aparece na frente do card). Use `data-motion-blur-tier="filter"`;
  - não use `backdrop-filter` em card com texto animado: preencha o card com cor sólida (o efeito de vidro vem da borda, do gradiente e da luz);
  - não use `filter: drop-shadow` em texto com gradiente: deixa uma caixa visível enquanto anima. Faça o brilho numa camada própria atrás (mesmo texto, cor sólida, `blur`);
  - ele só borra o elemento animado **mais externo** e ignora camadas de quadro inteiro transparentes, tudo em 3D (`perspective`, `rotateX`) e elementos maiores que metade do quadro. O elemento que se move deve ser o menor possível (cada dígito, não o contador inteiro); quando não der, faça um desfoque direcional próprio (SVG `feGaussianBlur` calculado pela velocidade).
- **Vinheta de quadro inteiro:** com `box-shadow: inset`, não com `background` (o `check` acusa texto encoberto).
- **Luz ou reflexo dentro de card:** `z-index` abaixo do texto.
- **Brilho dentro de janela com `overflow: hidden`:** a janela recorta o brilho nas laterais. Recorte só no eixo do movimento, com folga para o brilho.
- **Efeitos gerados** (ruído, imagem se formando): canvas desenhado num `onUpdate`, com sorteio de **semente fixa**. Assim o render sai igual toda vez.
- **Conferir uma sobreposição sobre a câmera:** extraia o quadro do MOV para PNG e só então componha sobre o quadro da câmera. Compor direto do MOV com `-ss` no FFmpeg saiu vazio.
- **O render não é 100% determinístico:** o mesmo projeto renderizado duas vezes sai com diferenças mínimas (até ~1/255 em pouquíssimos pixels, perto de desfoque de movimento). Ao comparar antes e depois, essa é a margem de ruído.
- **O padrão do HyperFrames x o estilo da pessoa:** as orientações do próprio HyperFrames consideram "aproximação lenta contínua" e "título que continua se movendo" sinais de vídeo gerado. Se o perfil pede câmera viva, vale o perfil. O resto (cortar no frame mais rápido, sobreposição de movimentos, curva por papel) é compatível.
