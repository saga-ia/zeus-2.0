# Ofício de motion

Como as animações se movem bem, em qualquer estilo: curvas, velocidades, cortes, leitura e diagramação. Medido em referências profissionais e testado em vídeos reais. Valores em frames a 30 fps.

Vale para qualquer pessoa. **Quando o perfil dela disser outra coisa, vale o perfil.** O visual (cores, fontes, material) e o gosto (quanto overshoot, quanto movimento secundário) são sempre do perfil.

Leia junto com `hyperframes.md` na hora de construir.

## 0. Princípio
- **O que aparece na tela nasce do que está sendo explicado.** Nunca encaixar o conteúdo num template: escolher a metáfora visual que explica melhor aquela ideia e construí-la com estas regras e o perfil.
- **Uma coisa protagonista por vez:** em cada momento, só um elemento chama a atenção.
- **Mostrar a coisa de verdade, quando couber:** se a fala cita algo que dá para mostrar acontecendo (uma imagem se gerando, um efeito explodindo), isso explica melhor que um card genérico com o nome. Usar quando cabe, sem excesso.
- **Diagramação e alinhamento:** cada elemento alinhado ao que ele acompanha (a etiqueta ao ícone, as linhas de um bloco entre si). Desalinhamento é o que mais passa amadorismo.
- **Tendência, não regra:** isto é ponto de partida. Regra absoluta faz todo vídeo sair igual.

## 1. Hierarquia de velocidade
| Camada | Velocidade | Exemplo |
|---|---|---|
| Elementos entrando | ~15 f (0,5 s); opacidade e foco em 6–10 f | card, ícone, etiqueta |
| Elementos saindo | ~8 f (0,25 s), mais rápido que a entrada | card, etiqueta, legenda |
| Texto | 6–12 f por palavra | frase de ênfase |
| Câmera | lenta: 1,5–3,5 s | aproximação, recuo, deriva |
| Secundário | contínuo | órbita, partículas, luz |

O contraste de velocidades é o que dá fluidez: entrada rápida sobre câmera lenta.

## 2. Curva por papel (GSAP)
| Papel | Curva | Duração |
|---|---|---|
| Entrada de elemento | posição e escala com ease-out (o overshoot, se houver, é do perfil); opacidade e foco em `expo.out`, mais curtos | ~15 f |
| Saída de elemento | `power3.in`, um movimento só (cai ou encolhe + desfoque + fade) | ~8 f |
| Grupo se reorganizando | palavras `power3.out`; cards `power2.out` | 15 f; 21 f |
| Aproximação/recuo de câmera na abertura | `power2.out` (suave) a `circ.out` (freia mais cedo) | 1,5–3,5 s |
| Deriva de câmera depois que assenta | `none` (linear) ou `sine.out` | até o fim da cena |
| Punch para destacar um detalhe | in-out assimétrico, pico em ~30% (`expo.in` curto + `expo.out` longo, ou CustomEase) | ~1–1,7 s |
| Passo de carrossel, troca de item | `power4.inOut` ou `expo.inOut` | 13 f + ~7 f parado |
| Escurecer ou desfocar o fundo | `power1.inOut` | ~14 f |
| Acender um título solene | opacidade + desfoque, `power2.out` | ~20 f |
| Progresso, rotação, seguir uma barra | `none` | — |
| Speed ramp (troca de cena) | `power4.in` → corte → `expo.out` | ~1 s + ~1,5 s |

**Nada se move linearmente**, exceto a deriva da câmera e o que segue um progresso.

## 3. Câmera virtual (dentro da animação)
- **Aproximação e deriva correm juntas, em camadas separadas:** dois contêineres aninhados, o de fora faz a aproximação com ease-out, o de dentro faz a deriva linear a cena inteira. Encadear um ease-out que termina parado com um linear depois faz a velocidade cair a zero e voltar: o zoom "engasga".
- **Seguir** o que progride (barra, linha do tempo) em velocidade constante.
- **Punch** (~25%) com in-out assimétrico para destacar um detalhe, e voltar.
- **Mudança de zoom** (do plano aberto para um close na área de interesse e de volta), três formas para momentos diferentes:
  1. **Corte seco:** o close entra ~5–10% maior e assenta (~0,3 s), com um flash no corte.
  2. **Zoom contínuo com speed ramp, sem corte:** acelera (`power4.in`) e freia (`expo.out`) com as velocidades casadas, pico em ~30%, flash no pico.
  3. **Corte com speed ramp leve:** o plano que sai acelera na direção do zoom nos últimos frames (~0,2 s, +5%, `power4.in`), corta no frame mais rápido, e o plano que entra já chega em movimento na mesma direção e desacelera (~0,42 s, começando ~6% antes do alvo, `expo.out`). Sutil, só para suavizar.
  - Zoom num elemento (ícone, card): a aproximação contínua costuma ler melhor; um corte seco ali pode parecer troca de cena.
- **Câmera fluida:** o que mais parece amador é a câmera "truncada", com vários movimentos que começam e terminam parados em sequência. Um movimento emenda no outro sem a velocidade chegar a zero (curva única pelos pontos-chave, sobreposição, deriva por baixo). Se parar, para muito suave.
  - Depois de um movimento rápido, a chegada emenda no seguinte, em vez de frear até parar e recomeçar. Mais suave não é mais lento.
  - Um recuo que revela segue recuando devagar, no mesmo sentido, em vez de recuar e logo voltar.
- **O conteúdo principal entra centralizado no quadro desde o começo**, mesmo com o zoom maior; o recuo revela o resto e recentraliza.

## 4. Troca de cena
- **Speed ramp:** a cena acelera numa direção (`power4.in`, ~1 s), desfoque de movimento direcional no pico, corte no frame mais rápido, a cena nova chega na mesma direção e velocidade e freia (`expo.out`, ~1,5 s). A saída é mais longa que a entrada.
  - **Percurso:** o conteúdo ainda tem de estar no quadro no corte. Em 1080p, ~700 px na saída e ~560 px na chegada. Com ~1.300 px o conteúdo some antes do corte e sobram frames vazios.
  - **Casar a velocidade no corte:** velocidade final do `power4.in` = 4·D/T; inicial do `expo.out` ≈ 6,93·D/T. Ex.: 700 px em 1 s → 2.800 px/s; 560 px em 1,5 s → ~2.590 px/s.
  - A cena nova já chega com o conteúdo principal no quadro; os detalhes entram em cascata ~0,2 s depois.
- **Movimento rápido no mesmo mundo:** o que sai acelera, o que entra freia, mesma direção. Um pouco mais longo que ~20 f; mais curto que isso fica "duro".
- **A chegada de um speed ramp nunca para seco:** freia longa e suave e continua andando.
- **Corte com assentamento:** a cena nova entra ~5% maior e assenta em ~6 f.
- Variar o tipo de troca ao longo do vídeo; não repetir a mesma em sequência.

## 5. Entradas e saídas
- **Entrada:** ~0,5 s, opacidade e foco antes. Do zero (ou de ~60% + opacidade 0) ao tamanho final.
- **Cascata e sobreposição:** 2–4 f entre itens irmãos; o próximo movimento começa antes de o anterior assentar. É isso que faz tudo virar um movimento contínuo.
- **Cursor e clique:** o cursor anda em arco, como uma mão; cada clique afunda e volta com mola.
- **Grupos que chegam em sequência ficam sempre centralizados, como um grupo só:** o primeiro nasce no centro; quando o seguinte chega, o grupo inteiro desliza até ficar centrado de novo. Nunca deixar o primeiro sozinho, deslocado, esperando o espaço do outro.
- **Linhas no ritmo da fala:** as palavras entram uma a uma, na hora em que são ditas, e a linha desliza a cada palavra para continuar centrada (~0,5 s, `power3.out`). Alternativa: a linha inteira aparece apagada e cada palavra acende quando é dita. Revelar palavra por palavra **sem** recentralizar deixa o começo torto: nunca. Títulos curtos entram inteiros, e a palavra-chave ganha o punch na hora em que é dita.
- **Sincronia com a fala:** o elemento que representa uma palavra entra **na palavra** (tempo da transcrição), não num intervalo fixo.
- **Saídas:** mais rápidas que a entrada (~0,25 s, `power3.in`), um movimento só, ou carregadas pelo movimento da câmera ou pela troca de cena.
- **Tempo de leitura:** um letreiro não sai colado na última palavra. Sem outra animação ou corte logo depois, ele segura ~1–1,5 s depois da palavra final.
- **O herói do fim tem tempo de ser visto** (o logo, a revelação). Sem nada depois, a animação pode avançar um pouco sobre o take seguinte.

## 6. Texto vivo
- Texto digitado: ~23 caracteres por segundo, cada letra entra com borda suave (opacidade e desfoque); várias linhas em paralelo com 3–4 f de defasagem.

## 7. Camadas e profundidade
- **Profundidade de campo para dar foco:** desfocar o que não é o assunto do momento.
- **Fundo e frente se movem com sutileza, na periferia:** deriva lenta, nos cantos e nas bordas. Nunca atravessam o quadro em direção à área de interesse nem se misturam à animação principal.

## 8. Movimento secundário
- O que continua se movendo depois que tudo entrou tem propósito (mostra fluxo, dados, energia), não é flutuar por flutuar. Quanto movimento secundário o estilo quer é do perfil.
- Luz ou pulso correndo por um trilho ou conector passa **por trás** dos nós, não na frente.

## 9. Sobre o apresentador
- Elementos curtos e pontuais (etiquetas, ícones, números, ênfase embaixo) com fundo transparente.
- **Flash em sobreposição fica no próprio elemento.** Um flash de quadro inteiro sobre o apresentador parece bug.
- Elemento lateral grande: a câmera leva o rosto para o terço do lado oposto enquanto a animação está na tela e o devolve ao centro depois.

## 10. Render ou pós
- **No render:** câmera e zoom dentro da animação, profundidade de campo, desfoque de movimento, brilho, luz, partículas.
- **Na pós (no programa de edição, com marcador):** o "look" do vídeo inteiro (efeitos de lente, grão, glitch, texturas, desfoque do fundo sob uma ênfase). Assim não soma em dobro e continua ajustável.

## 11. Evitar
Tudo entrando com o mesmo fade e deslize; vários protagonistas ao mesmo tempo; efeito de lente aplicado no render; câmera que para e recomeça em sequência.

## 12. Como saber se ficou fluido
Renderize e meça: a curva medida no vídeo (mesmo método do `referencias.md`) tem de bater com a curva pretendida e com as durações daqui. Ajuste até bater. Feedback de qualidade geral ("básico", "sem vida") pede refazer a animação, não retocar.
