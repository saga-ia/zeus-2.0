# Entrega no programa de edição (ou o vídeo pronto)

Como o resultado de cada etapa chega à pessoa. Escolha o caminho na entrevista e escreva as regras dele nas skills que entregam algo (cortes, motion-render, câmera, sfx).

## Regras para qualquer caminho
- **Teste curto primeiro.** Na primeira vez que um formato é usado (ou quando muda), gere um arquivo de teste com 3–4 clipes e peça para a pessoa abrir e conferir: abre, os clipes certos, o áudio certo, os marcadores visíveis, o tempo batendo. Anote o que foi confirmado num arquivo de validação na pasta de ferramentas. Só depois a etapa usa o formato de verdade.
- **Copie, não chute.** Quando não souber como o programa representa algo (uma transição, um keyframe, uma trilha estéreo), peça para a pessoa montar aquilo no programa, exportar e mandar. Copie o formato exportado.
- **Versões, nunca sobrescrever:** `<projeto>_cortes_v01`, `_v02`…; depois `<projeto>_final_v01`… Cada etapa continua a numeração.
- **Apontar para os originais**, nunca para os proxies, com caminho absoluto. A pessoa conecta os proxies no programa.
- **Tempo em frames inteiros.** Converta segundos para frames com a taxa real e arredonde para o frame mais próximo, num lugar só (uma função usada por todos os scripts). Com 29,97: `frame = round(segundos × 30000 / 1001)`, timebase 30 com NTSC ligado, timecode não-drop. Erro de taxa aparece como descompasso crescente no fim do vídeo.
- **Marcadores na linha do tempo** em vez de listas no chat: dúvida de take, sugestão, asset faltando, efeito para aplicar na pós. Use uma cor fixa para os do Claude; os da pessoa são de qualquer outra cor e, na volta, viram instrução.
- **Trilhas fixas**, sempre as mesmas, para a pessoa se acostumar. Exemplo:
  - V1 câmera;
  - V2 gravação de tela;
  - V3 animações em tela cheia;
  - V4 sobreposições;
  - A1 voz;
  - abaixo da voz, os efeitos sonoros.
- **Fades de áudio** curtos em todo clipe de áudio, para tirar os estalos: 1 frame de cada lado nas junções entre takes (um crossfade de 2 frames) e 1 frame no começo e no fim da voz e de cada efeito sonoro.

## Caminho A: XML para Premiere (e outros que leem FCP7 XML)
O formato que funcionou no fluxo de referência é o **FCP 7 XML (xmeml)**, importado em Arquivo → Importar. O DaVinci Resolve também importa XML; confira com um teste antes.
- **Áudio estéreo:** o xmeml não tem trilha estéreo; cada canal vira um `<track>`. Para o Premiere juntar os dois numa trilha só, o par precisa das marcas que o próprio Premiere grava quando exporta: `explodedTracks`, `totalExplodedTrackCount="2"`, `premiereTrackType="Stereo"` e clipes com `premiereChannelType="stereo"`. Sem elas, chegam duas trilhas mono iguais.
- **Caminho do arquivo:** `file://localhost/C:/...` no Windows.
- **Marcadores:** marcadores da sequência, com o texto no comentário e a cor por um atributo de cor do Premiere (descubra o valor exportando um marcador da cor desejada).
- **Câmera em keyframes:** o efeito de Movimento (Basic Motion) com escala e posição por keyframe. Para a curva sair como foi desenhada, use keyframes densos (vários por movimento), com a curva calculada pelo script. A posição é relativa ao centro e normalizada.
- **Fades de áudio:** `transitionitem` com o efeito Cross Fade, alinhamento `center` entre dois clipes e `start-black`/`end-black` nas pontas. O Premiere importa a duração escrita, mas **exporta** os fades com o tamanho padrão dele (ex.: 30 frames). Na volta, ignore o tamanho que vier e considere o seu.
- **Links entre clipes** (vídeo e áudio do mesmo take): o índice do clipe conta os clipes **e** as transições da trilha.
- **A volta (feedback pelo programa):** a pessoa exporta a sequência (Arquivo → Exportar → Final Cut Pro XML) para a pasta de trabalho. Um script lê os clipes de V1 (arquivo, entrada, saída) e reconstrói a lista de cortes. **Os ajustes dela valem mais que os do Claude.**
  - Os marcadores dela viram instrução naquele ponto.
  - Avise, sem tentar resolver sozinho, o que estiver fora do modelo: L-cut/J-cut, mudança de velocidade, transições de vídeo, efeitos, clipes desconhecidos.
  - O Premiere exporta com o nome da sequência: salve a cópia como `<nome>_editado.xml`, para não sobrescrever o seu.
- **Ajuste manual no programa** depois de uma etapa não volta para as etapas seguintes, salvo os cortes (pela volta acima). Combine com a pessoa: o retoque fino fica para depois da última etapa, ou é pedido por número ("cam07 mais lento").

## Caminho B: outros programas
- **Final Cut Pro:** usa FCPXML, um formato diferente do FCP7.
- **DaVinci Resolve:** importa XML e FCPXML, e tem API de scripts.
- Em qualquer um: pesquise o formato atual, gere o teste curto e copie o que o próprio programa exporta.
- **Programas sem importação aberta:** siga o caminho C e entregue o vídeo pronto.

## Caminho C: sem programa (o Claude entrega o vídeo)
- Uma etapa final de **render** monta tudo com FFmpeg: os cortes da câmera com a câmera em escala e posição, as animações por cima (tela cheia e sobreposição com transparência) e o áudio com os efeitos nos níveis certos. Exporta um MP4.
- **Revisão:** a pessoa assiste e pede pelo chat, citando o tempo ("em 01:12 tira essa frase") ou o número do item. O Claude converte o tempo do vídeo para o tempo do arquivo original pela lista de cortes.
- **Rascunho rápido:** para revisar, renderize em resolução menor; o final sai na resolução cheia.
- Cada ajuste é um render novo: agrupe vários pedidos antes de renderizar.
