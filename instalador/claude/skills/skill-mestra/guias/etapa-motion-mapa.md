# Etapa 4: motion-mapa (o plano das animações)

A etapa que mais decide a qualidade do vídeo. Planeja onde entra animação, o que mostra e como, e a intenção da câmera em volta de cada uma. **Não anima nada**: só propõe no chat, ajusta com a pessoa e grava o plano. Aqui mudar é barato; depois do render, um conceito fraco custa uma rodada inteira.

Leia antes: `oficio-motion.md` e o perfil (identidade visual, estilo de motion, estilo de câmera, catálogo, se houver).

## Princípio
- **O conteúdo decide a animação.** Para cada ideia, a forma visual que explica melhor *aquela* ideia. Nada de encaixar a fala num template.
- **O estilo é constante:** o ofício, o perfil e a identidade visual.
- **O catálogo é repertório, nunca obrigação.** Padrões que já funcionaram são ponto de partida; algo novo entra sempre que servir melhor. No começo do vídeo, um conceito próprio do assunto vale mais, para os vídeos não ficarem iguais entre si.

## 1. A fala no tempo da sequência
Um script converte a transcrição para o tempo da sequência (pelos segmentos do corte, com a mesma conversão de frames da entrega). Ele gera um texto para o Claude ler, com uma frase por linha:
- o timecode da sequência;
- o segmento;
- a marca de gravação de tela, quando houver;
- as notas de edição;
- e, no fim de cada segmento, o **tempo exato do corte**.

O tempo das palavras de um trecho sai sob demanda, só daquele trecho.

## 2. Trechos e tipo de vídeo
- Defina o **fim do gancho** (onde a promessa do vídeo é entregue e o conteúdo começa), o **tipo de vídeo** e o **começo do fechamento**. O que não veio do briefing, confirme numa mensagem curta, já com a proposta ("Gancho até 00:48, explicativo, fechamento a partir de 11:20. Confere?").
- A **densidade** (quanta animação em cada trecho) é do perfil. Em geral, o gancho é mais denso e mais forte.
- Planeje **o gancho primeiro e com mais detalhe**, quase frase a frase. Ele pesa mais na retenção.

## 3. Storyboard (obrigatório no gancho, opcional no corpo)
| Campo | O que descreve |
|---|---|
| conceito | a ideia visual numa frase, amarrada ao que está sendo falado |
| camadas | fundo, meio e frente: o que há em cada uma e como se move |
| câmera | o que a câmera virtual faz dentro da animação |
| batidas | os momentos fortes (palavra, tempo, o que acontece); viram pontos de som |
| herói | o ápice, se tiver |
| vida | o movimento secundário depois de tudo entrar |
| saída | como sai ou passa para a próxima |

**Antes de mostrar, releia o gancho com estas perguntas:**
- O conceito nasce desta fala, ou serviria para qualquer vídeo?
- A energia combina com aquele ponto?
- Estou repetindo a mesma fórmula, com toda animação usando zoom e impacto e a mesma entrada?

## 4. Onde entra (e onde não)
- **Entra** onde explica melhor que a câmera ou dá ênfase real: processo, passo a passo, comparação, antes e depois, números, listas, conceitos abstratos, ferramentas citadas, a frase-chave. Ênfase com critério, para não perder força.
- **Não entra** onde a gravação de tela já mostra o assunto (salvo um destaque pontual), nem para enfeitar uma fala que se sustenta sozinha.
- **Notas de edição** sobre animação têm prioridade: faça como foi pedido e complete só o que faltou.

## 5. Formato
- **Tela cheia:** conceitos, processos, números grandes. A fala continua por baixo.
- **Sobreposição:** coisas curtas sobre o apresentador, com fundo transparente.
- **Sobreposição lateral grande:** o item indica o lado do rosto. A câmera leva o rosto para o terço oposto enquanto a animação está na tela.
- **Ênfase sobre a filmagem:** escurecimento ou degradê embaixo, no render. O desfoque do fundo vai como marcador para a pós.
- **Entrada e saída:** a animação já começa em movimento e termina com saída própria. No programa, é corte seco.

## 6. Duração e sincronia
- A animação dura o trecho da fala que ela ilustra: mínimo ~2 s, típico 3–8 s. Acima de ~12 s, dividir em cenas com trocas.
- **Tempo de leitura:** com texto, termina ~1–1,5 s depois da última palavra, salvo se outra animação ou um corte obrigar.
- Cada entrada importante tem uma **palavra-gatilho** com o tempo exato.
- **Borda no corte:** quando a animação começa ou termina junto com um corte, use o **tempo exato do corte**, não o da palavra. Por causa da folga das bordas, o corte cai ~0,1–0,3 s antes da primeira palavra, e a animação marcada pela palavra vazaria frames no segmento vizinho. O script de gravação deve avisar.

## 7. Câmera em volta (intenção em palavras)
Se o fluxo tem etapa de câmera, ela é pensada aqui, junto com a animação. É isso que deixa o vídeo dinâmico. Escreva a **intenção**; a etapa de câmera decide curvas e valores depois do render.
- Por item, quando houver o que dizer:
  - **antes:** "acelera para dentro do rosto até o corte";
  - **durante:** "rosto no terço esquerdo";
  - **depois:** "chega de baixo, na direção da saída, e freia".
- **Batidas de câmera fora das animações:** palavra, tempo e o que acontece ("punch seco em 'impossível'").
- A saída de uma animação pede a câmera chegando na mesma direção; a entrada num corte pede a câmera acelerando antes. Sob tela cheia a câmera não aparece: não planeje movimento ali.

## 8. Assets
- Peça o que faltar em vez de improvisar com algo genérico: logo, print, gravação de tela, foto, ícone específico.
- **Liste a pasta de assets antes:** um arquivo pode já estar lá com outro nome.
- Cada asset tem um tipo e um termo de busca:
  - **logo:** busca pelo nome da marca;
  - **ícone:** busca por uma palavra em inglês;
  - **print de site:** busca pela URL exata;
  - **foto ou vídeo de banco;**
  - **gravação pessoal:** só a pessoa faz.
- Prefira SVG para logo e ícone. Boneco, forma, cena montada e diagrama **não são asset**: o render desenha no código.
- Esta etapa não busca nada; quem busca é a etapa de assets, depois da aprovação.

## 9. Revisão
Mostre o plano numerado (`mo01`, `mo02`…), com uma linha por animação: tempo, formato, ideia e a intenção da câmera. Num vídeo longo, dá para aprovar por trecho, começando pelo gancho. A pessoa aprova, ajusta ou risca por número. Ao gravar de novo, preserve o status do que já foi aprovado.
