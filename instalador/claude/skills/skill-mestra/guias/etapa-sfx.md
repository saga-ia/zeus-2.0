# Etapa 8: sfx (efeitos sonoros)

O som entra por último, sobre o corte, as animações e a câmera já travados. Decide **onde** entra som, **qual** e **como se empilha**, e entrega cada som numa trilha própria, com o nível já ajustado, para a pessoa refinar.

Tudo aqui é tendência, não regra; as regras técnicas (sincronia, nível, não repetir) podem ser firmes. Densidade, peso e sons preferidos são do perfil.

## 1. Eventos
Um script junta, no tempo da sequência, tudo o que acontece:
- **cortes:** com e sem mudança de plano;
- **câmera:** o movimento, a força e a duração;
- **animações:** entrada, saída e palavras-gatilho;
- **batidas** do storyboard;
- **eventos anotados no render:** os mais precisos, com descrição, material e força.

Cada evento ganha um id estável (que não muda numa rodada nova se o evento não mudou) e a palavra dita naquele instante. O script também mede a **loudness da voz** (em LUFS), que é a base dos níveis.

O Claude lê essa lista, mais a ideia e o storyboard de cada animação. Não precisa abrir quadros nem o código das animações.

## 2. Princípios
1. **O som segue o que se vê.** Evento visível pede som; o que não aparece, não. Jump cut sem mudança de plano é para ser invisível: em geral, sem som. Corte, zoom ou câmera sob uma tela cheia não aparece: sem som.
   - Movimento visível de câmera (chegada rápida, aceleração antes do corte, punch, rampa) é como uma animação: whoosh com o pico onde a câmera freia (chegada) ou no frame mais rápido (rampa), impacto no punch de ápice. Aproximação lenta e trava no rosto não pedem som.
2. **Um protagonista por momento.** Cada evento tem uma camada principal. No máximo 3 camadas por evento, cada uma numa faixa diferente; dois sons do mesmo tipo no mesmo frame embolam e tiram o ataque.
3. **Camadas** de um momento forte:
   - **principal:** o som que diz o que aconteceu (impacto, whoosh, pop, clique);
   - **grave:** sub por baixo do impacto, para dar peso. Só nos momentos fortes; usado sempre, perde efeito;
   - **apoio:** prepara ou acompanha (o whoosh que leva ao impacto, o riser que termina no evento);
   - **doce:** um agudo bem curto que define o ataque, baixo;
   - **cauda:** rara, uma ambiência ou reverb que segura o momento.
4. **Antecipação e resolução.** Riser e som reverso constroem; o impacto resolve. O riser termina no evento e corta seco. Fica mais forte com um respiro: nada de outros sons nos ~0,5 s antes do impacto. Às vezes o melhor som é tirar o som.
5. **Escalada.** O maior impacto do vídeo vai no ápice do começo (a frase-chave). Antes dele, sons menores. No corpo, nada maior que isso.
6. **Densidade por trecho** é do perfil. "Um whoosh em cada corte" cansa em dez minutos: varie a intensidade.
7. **Sincronia:**
   - **impacto:** o transiente cai no frame do evento;
   - **whoosh:** o **pico** cai no frame da troca ou da chegada (quando o elemento freia), não no primeiro frame do movimento;
   - **pop, clique e ding:** começam no evento;
   - **whoosh de movimento de câmera:** o pico fica perto do começo do movimento;
   - para casar com a percepção, um som pode vir 1 frame adiantado, e camadas de apoio escalonadas em 1–2 frames dão profundidade.
8. **O som combina com o movimento e o material.** Grande e lento pede whoosh grave e longo; pequeno e rápido, um som curto e agudo. Papel pede papel; tecnologia e IA, glitch e interface digital; cursor, clique; check, ding.
9. **Variação.** Não repetir o mesmo arquivo em ~20 s. Packs com variações existem para isso.
10. **Nível.** Efeito bem abaixo da voz. O script nivela cada som pela loudness da voz, com um alvo por categoria e camada e um teto de pico (os números ficam no perfil e se ajustam pelo feedback). Nada mais alto que a voz, salvo um momento intencional. A mixagem final é da pessoa.

## 3. A biblioteca
- Pastas por categoria (whoosh, impacto, grave, riser, pop, clique, glitch, interface, ding, papel…), com um índice que o script gera. Para cada som, o índice guarda:
  - a duração útil (sem o silêncio do começo);
  - o **tempo até o pico**;
  - a forma (ataque seco, crescendo…);
  - o brilho;
  - favoritos e "a conferir".
- **Escolher:** o tempo até o pico tem que caber antes do evento (um whoosh com pico em 0,4 s começa 0,4 s antes); a duração útil, até o próximo evento; a forma combina com o papel; o brilho separa as camadas (grave embaixo, agudo em cima).
- **Busca por texto:** um modelo de áudio e texto (ex.: CLAP) busca por descrição em inglês ("short bright metallic whoosh"), útil para a nuance.
- **Faltou som?** Não force um ruim: use o melhor possível ou deixe sem, e anote numa lista de sons que faltam.
- Sons novos entram por uma pasta de entrada: o Claude confere, separa por categoria, padroniza e atualiza o índice.

## 4. Gravar e entregar
- O Claude escreve um rascunho: para cada som, o evento, a camada, o arquivo e o alinhamento (pico, início ou fim). Ajuste fino em dB ou em atraso, quando precisar.
- Um script acha o arquivo, pula o silêncio do começo, alinha, calcula o nível e a trilha (sem sobrepor sons na mesma trilha) e copia os sons usados para a pasta de assets do vídeo.
- Avisos a corrigir antes de mostrar: som não achado, repetido, evento sem principal, dois principais colados, evento que mudou desde a última gravação.
- Entrega conforme `entrega-no-editor.md`: cada som numa trilha estéreo abaixo da voz, com o nome `sfxNN <som>` e o nível no volume do clipe.
- **Revisão por número:**
  - "sfx12 mais baixo": 3 dB a menos;
  - "sfx05 tira";
  - "troca o sfx07": outro som do mesmo papel;
  - "sfx03 um frame antes".
  - Se a pessoa ajustar o nível direto no programa e aprovar assim, anote a diferença: é aprendizado para o perfil.
