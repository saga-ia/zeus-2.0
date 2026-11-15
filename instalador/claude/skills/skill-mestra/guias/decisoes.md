# Decisões da entrevista

Siga esta ordem. Para cada decisão: explique as opções em poucas linhas, dê a sua sugestão para o caso da pessoa, registre a escolha no `montagem.md`. Detalhes que mudam com o tempo (preço, versão, recurso novo), pesquise na hora antes de recomendar.

## 1. Onde a pessoa revisa (pergunte primeiro: muda o fluxo inteiro)
- **Num programa de edição** (Premiere, DaVinci Resolve, Final Cut, outro): o Claude entrega um arquivo de projeto (XML ou similar) que abre no programa com os cortes, as animações, a câmera e os sons em trilhas separadas. A pessoa revisa, faz o retoque fino à mão e continua dona do acabamento. É o caminho mais flexível para quem já edita.
- **Sem programa:** o Claude entrega o vídeo pronto, renderizado. A pessoa revisa assistindo e pede ajustes pelo chat. Mais simples, mas cada ajuste vira um render novo, e o retoque fino é sempre por pedido.
- **Programas sem formato de importação aberto** (ex.: alguns editores de celular): na prática, é o caminho "sem programa". O Claude renderiza e a pessoa importa o vídeo pronto, se quiser acabar lá.
- Detalhes de cada caminho: `entrega-no-editor.md`.

## 2. Tipo de vídeo e formato
- Tipo: apresentador falando para a câmera, tutorial com gravação de tela, vídeo narrado (só voz sobre imagens), reels/shorts, podcast em vídeo, outro.
- Formato: horizontal 16:9, vertical 9:16, quadrado. Resolução e taxa de quadros da câmera dela (24, 25, 29,97, 30, 60). Use sempre a taxa real do material; 29,97 é diferente de 30 e o erro aparece como descompasso no fim.
- Duração típica. Vídeos longos se beneficiam de trabalhar por trecho.

## 3. Pasta e organização
- Como a pessoa organiza um projeto hoje. Se não tiver um padrão, sugira um simples: `AAAA-MM-DD_Nome/` com `Brutos/`, `Assets/`, `Docs/` (roteiro), `Renders/`, e a pasta de trabalho do Claude (`_CLAUDE/`).
- Pasta de ferramentas, compartilhada entre os vídeos (ex.: `~/.edicao/`): scripts, ambiente Python, perfil, biblioteca de sons, `montagem.md`.
- Proxies: se o programa dela usa, onde ficam.

## 4. Transcrição (a base de tudo)
O que importa comparar:
- **Tempo por palavra**, preciso. Os cortes, as animações e os sons se alinham por ele.
- **Mantém as hesitações** ("ééé", "hum", recomeços)? Para cortar, ajuda ver as muletas. Transcrição que limpa o texto esconde o que precisa sair.
- **Português** bem reconhecido, incluindo nomes próprios e termos técnicos (dá para passar uma lista de termos).
- **Local ou nuvem:** local é gratuito e privado, mas precisa de máquina boa (GPU acelera muito). Nuvem é rápida em qualquer máquina e cobra por hora de áudio.
- **Opções conhecidas:** WhisperX (local, gratuito, Whisper + alinhamento por palavra) e ElevenLabs Scribe (nuvem, marca hesitações e eventos de áudio como risada). Existem outras; pesquise o estado atual.
- **Armadilha:** o Whisper às vezes "engole" takes repetidos ou inventa frases quando recebe um contexto inicial. Depois de transcrever, procure trechos com som e sem palavra e retranscreva esses trechos.

## 5. Notas faladas na gravação
Sugira o costume de deixar instruções faladas para o editor durante a gravação: "nota de edição, usa esse take, fim da nota". A etapa de preparar acha cada nota, a etapa certa executa e o trecho da nota sai do corte. Combine a frase de abertura e de fechamento com a pessoa.

## 6. Cortes
- Quanto ar entre as frases (ritmo apertado ou respirado), se corta hesitações e o que fazer na dúvida (o padrão seguro: não corta e marca).
- Se usa roteiro. O roteiro serve para reconhecer os takes e a grafia dos termos, nunca para trocar o que foi falado.

## 7. Animações (motion)
- Se quer animação e quanta: muita no começo (o gancho), menos no corpo? Só ênfases?
- **Ferramenta:** o fluxo de referência usa o **HyperFrames** (animações em HTML/CSS/GSAP renderizadas em vídeo, por linha de comando, com transparência). Alternativas existem (Remotion, After Effects com scripts); pesquise licença e custo para o caso dela.
- Tela cheia (a animação ocupa o quadro) e sobreposição (elementos com fundo transparente sobre o apresentador). Os dois pedem coisas diferentes na entrega.

## 8. Câmera
- Se quer movimento de câmera no apresentador: zoom alternando nos cortes (disfarça o jump cut), punch nas ênfases, aproximação lenta, câmera que segue o rosto.
- Seguir o rosto precisa de um detector de rosto (ex.: YuNet, do OpenCV, roda local e leve).
- Câmera casada com as animações (a câmera acelera antes de uma animação entrar, chega na direção em que ela saiu) é o que mais dá dinamismo. Isso pede que a câmera seja feita **depois** das animações prontas.

## 9. Som
- Se quer efeitos sonoros e quanto.
- **Biblioteca:** uma pasta curada de sons, organizada por categoria, que o Claude consegue listar e medir (duração, tempo até o pico). Sugestão para começar: pergunte ao Claude quais categorias fazem falta (whoosh, impacto, pop, clique, glitch, riser…) e monte uma primeira base com sons gratuitos de licença clara. Com assinatura de um banco de sons com API, o Claude busca e baixa o que faltar. Confira sempre a licença de uso.
- Música de fundo: decida se o fluxo cuida dela ou se a pessoa prefere fazer à mão. Escolher e encaixar música bem é difícil de automatizar.

## 10. Revisão e aprovação
- Em que etapas a pessoa quer revisar no programa (ex.: depois dos cortes, das animações, da câmera e do som) e quais aprova só pelo chat (ex.: o plano das animações).
- Como ela prefere devolver correções: pelo chat, citando o tempo ou o número do item ("mo04 mais lento"), ou com marcadores no próprio programa.

## 11. Nome e comandos
- Prefixo das skills (ex.: `edit-` gera `/edit-cortes`) e nome da skill central (ex.: `/editar`). Sem acento e sem espaço.
