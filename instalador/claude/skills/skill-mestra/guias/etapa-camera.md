# Etapa 7: câmera

O movimento da câmera do apresentador, desenhado **depois** das animações prontas, casado com a fala e com a entrada e a saída de cada animação. Vai para o programa como keyframes de escala e posição no clipe original (ou, sem programa, aplicado no render final). Não renderiza vídeo.

Tudo aqui é tendência, não regra. As curvas são as mesmas do `oficio-motion.md` (§2–§4), para a câmera conversar com as animações. Quanto movimento e quanto zoom são do perfil.

## 1. Base automática (feita por script)
Para o vídeo inteiro ter ritmo sem desenhar cada corte à mão:
- **Alternância de planos:** a cada corte, o plano troca entre aberto (100%) e fechado (ex.: 125%, ou o do perfil). Isso disfarça o jump cut.
- **Aproximação lenta e contínua** por baixo de tudo (ex.: 3–8% por segmento), numa camada própria.
- **A base obedece aos movimentos desenhados:** o plano de cada corte é escolhido pelo lugar onde a câmera **de fato** terminou no take anterior. O corte sempre muda de plano.
- O primeiro segmento e um cenário novo começam abertos. Um corte que ainda fique quase sem mudança de plano (menos de 5%) deve gerar um aviso.

## 2. Casar com as animações (o que mais dá dinamismo)
- **Antes de uma animação que entra no corte:** a câmera acelera para dentro do rosto nos últimos 0,2–0,25 s (`power4.in`, +7% a +18%), na direção da entrada.
- **Depois de uma animação que sai com speed ramp ou movimento rápido:** a câmera chega andando na mesma direção e velocidade e freia (`expo.out`, 0,4–0,6 s, partindo de ~1,3–1,5× o alvo). Saída para cima → chega de baixo. Saída para a esquerda → chega da direita.
- **Sobreposição lateral:** o rosto vai para o terço (escala ~140%) só enquanto a animação está na tela, e volta ao centro quando ela sai (`power2.inOut`, ~0,7 s). Aproximação suave para o lado, começando um pouco antes, e não salto + deslize.
- **Cards que entram embaixo:** o rosto sobe um pouco, para não ficar atrás deles.
- **Sob tela cheia** a câmera não aparece: não gaste movimento ali.

## 3. Ênfases
- **Punch seco** na palavra de ápice: entra ~5–7% acima e assenta em ~0,3 s (`power2.out`).
- **Zoom com speed ramp** (pico de velocidade na palavra) quando a viagem até o close importa; **corte com speed ramp** para voltar ao aberto. Varie as formas; não repita a mesma em sequência.
- **Trava no rosto:** a câmera segue o rosto e ele fica parado na tela enquanto o fundo se mexe. Para ênfases, com zoom de ~120% ou mais (precisa de margem), de preferência de um corte a outro. Funciona em janelas curtas (~1 s) e longas (5–7 s). Não precisa ficar cravada como um rastreio profissional: é a intenção. Terminando no meio de um plano, solta devagar (~0,4 s).
  - O rosto vem de um detector de rosto (ex.: YuNet, do OpenCV), rodado no proxy, com o resultado guardado em cache.

## 4. Cuidados (cada um pareceu bug quando aconteceu)
- **Nada de salto de escala instantâneo no meio de um take visível.** Salto só onde fica escondido (saída de tela cheia, corte).
- **Todo movimento parte de onde a câmera está.** Partir de outro valor faz a câmera "pular" antes de andar.
- **Não inverter a direção no corte:** acelerar para dentro e, depois do corte, chegar mais fechado e recuar parece sem sentido.
- **Altura dos olhos no plano fechado:** com o quadro centrado no meio do rosto, os olhos ficam baixos e a cabeça encosta em cima. Com os olhos a ~35% da altura e espaço em cima, fica certo. Confira em todo plano fechado.
- **Uma coisa por vez em cada camada:** dois movimentos de escala (ou de posição) ao mesmo tempo brigam. A aproximação lenta corre em paralelo, na camada dela.
- **Nunca mostrar a borda do quadro:** com escala ≥100%, o deslocamento é limitado pela margem.

## 5. Plano e revisão
- O Claude escreve um rascunho com os movimentos numerados (`cam01`, `cam02`…): o quê, onde (palavra, tempo ou corte), duração, curva, de quanto a quanto. As travas vão à parte.
- Um script calcula a base + os movimentos, gera keyframes densos com a curva embutida e avisa sobre conflitos.
- Revisão por número: "cam07 mais lento", "cam05 mais forte", "cam12 tira", "no s014 não precisa punch".
- Ajuste de câmera feito à mão no programa não volta para o plano: peça por número.
- Se uma animação mudar depois, a câmera é recalculada.
- **Eventos para o som:** cada movimento visível (chegada rápida, aceleração antes do corte, punch, rampa) vira um evento com força e tempo, para a etapa de som.
