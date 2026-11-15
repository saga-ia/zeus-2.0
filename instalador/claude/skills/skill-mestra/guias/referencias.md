# Referências e perfil

Sem referências, o Claude anima "no médio". Com elas, ele mede o que a pessoa gosta e transforma em regras do perfil dela. Isso é feito uma vez, e de novo só quando ela quiser atualizar o estilo.

## 1. Juntar
- De 5 a 10 trechos curtos (5–30 s) de vídeos com animação, câmera ou edição que a pessoa gostaria de ter. Pode ser de canais diferentes.
- Um trecho por arquivo, numa pasta de referências dentro do perfil. Para cada um, uma linha dela: o que chamou a atenção ("o jeito que os cards entram", "a câmera que nunca para").
- As referências servem para medir o **jeito de mover**. Nunca para copiar o desenho de outra pessoa.

## 2. Olhar (o que se vê)
- **Folhas de contato densas:** quadros a cada poucos frames, lado a lado, com o tempo em cada um. Mostram como um elemento entra, assenta e sai.
- **Cortes de cena:** um detector de cenas (ex.: PySceneDetect) separa as tomadas. Para cada cena, uma folha com o começo, o meio e o fim.
- **Resumo por referência:** uma faixa de 6–8 quadros de cada folha, numa imagem só. É o que o Claude relê depois, sem abrir tudo de novo (economiza muito limite).

## 3. Medir (o que se sente)
- **Câmera:** zoom, deslocamento e giro quadro a quadro, por fluxo óptico e uma transformação afim global (pontos rastreados + RANSAC). Mostra se a câmera para ou continua andando, e com que curva.
- **Elementos:** o fluxo óptico menos o que a câmera explica. Mostra o que se move por conta própria.
- **Fades e brilho:** diferença de imagem entre quadros (fade não gera fluxo óptico).
- **Curvas:** para cada movimento marcante, do primeiro quadro parado antes ao primeiro parado depois, compare a curva medida com as curvas do GSAP (`power2.out`, `expo.out`, `power4.in`…) e anote a mais parecida e a duração em frames.
- O rastreio falha em quadros escuros e muito desfocados (perto de um corte rápido): meça até 1–2 quadros antes.

Os scripts de medição são escritos na primeira análise (OpenCV, NumPy, PySceneDetect, FFmpeg) e ficam na pasta de ferramentas para as próximas.

## 4. Escrever o perfil
Uma ficha por referência (o que foi medido, com números) e uma síntese. Da síntese saem os arquivos do perfil (modelo em `../modelos/perfil.md`):
- **identidade visual:** cores, fontes, fundo, material (vidro, papel, plano, 3D), logotipo. Vem da pessoa, não das referências;
- **estilo de motion:** velocidades, curvas, se passa do ponto ao chegar (overshoot) e quanto, quanto movimento secundário, como troca de cena, densidade por trecho do vídeo;
- **estilo de câmera:** quanto zoom no plano fechado, quanto punch, quanta aproximação lenta, se segue o rosto;
- **estilo de corte:** quanto ar, o que fazer com hesitação;
- **estilo de som:** densidade, peso, sons preferidos.

Cada regra com o número medido e de onde veio ("entradas em ~15 frames, `expo.out`, refs 02 e 05"). Regra sem origem vira chute.

## 5. Conferir com a pessoa
Mostre a síntese em linguagem simples, com 3–5 frases do tipo "seus vídeos preferidos fazem X". Ela confirma, corrige ou acrescenta. O perfil é dela; as referências só ajudam a dizer em palavras o que ela já sente.
