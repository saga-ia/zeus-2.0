# Etapas 1 e 2: iniciar e preparar

## Iniciar
Abre o projeto e organiza o briefing. Não analisa nenhum arquivo.
- **Conferir a pasta:** parece a raiz de um projeto, no padrão combinado? Se faltar alguma subpasta, pergunte se pode criar (vazia). Se a pasta não parecer um projeto, pergunte se o Claude Code foi aberto no lugar certo.
- **Projeto já iniciado** (o arquivo de estado existe): não sobrescreva nada; mostre o status e pergunte se é só para atualizar o briefing.
- **Perfil:** com um perfil só, use esse; com mais de um, pergunte de quem é o vídeo e anote no estado.
- **Briefing:** peça numa mensagem curta, sem formulário: "Me conta, do jeito que vier, sobre o que é esse vídeo e qualquer direcionamento que você já tenha." A pessoa costuma responder ditando.
  - Organize sem inventar: preserve as palavras e a intenção dela; nada de acrescentar tom, público ou ideia que ela não disse.
  - Seções sugeridas: sobre o vídeo, direcionamentos gerais, observações por etapa (cortes, câmera, motion, som, outros). Omita as vazias.
  - Salve e mostre. Pergunte de volta só se algo estiver realmente ambíguo.
- **Encerrar** dizendo o que falta para a próxima etapa (brutos na pasta, proxies, roteiro).

## Preparar
Transforma o bruto em algo que o Claude consegue ler: o inventário, a sincronia, a transcrição com tempo por palavra e as notas faladas.

- **Ferramentas, na primeira vez:** FFmpeg/ffprobe, Python num ambiente próprio na pasta de ferramentas e a transcrição escolhida. Com GPU NVIDIA, confirme que a versão do PyTorch reconhece a placa antes de transcrever (placas novas pedem versões recentes de CUDA); se cair para CPU sem avisar, fica muito lento.
- **Inventário** (ffprobe em cada arquivo): duração, fps, resolução, codec, se tem áudio, data de gravação. Ordem pela data de gravação (metadado; se faltar, pelo nome).
  - **Alertas:** arquivo ilegível, vídeo sem áudio, fps diferente entre arquivos e **taxa de quadros variável (VFR)**, comum em gravação de tela e problemática para sync e para o programa.
  - **Vídeo principal:** a câmera. Todos os tempos do projeto ficam no tempo dos arquivos da câmera.
  - **Proxies:** ache e anote o caminho; faltar não bloqueia.
- **Sincronia de tela e áudio externo com a câmera:** correlação cruzada das formas de onda, com o áudio da câmera como referência.
  - Gravação de tela costuma ser parcial: o sync precisa achar **onde** ela começa dentro do arquivo da câmera (e pode atravessar mais de um).
  - Anote cada sync como deslocamento + confiança (`tempo_na_camera = tempo_na_tela + offset`).
  - Confiança baixa ou câmera sem áudio: avise e peça ajuda, não chute.
  - Valide conferindo uma palavra marcante nos dois arquivos.
- **Áudio principal:** o da câmera, salvo se houver áudio externo (microfone). Se o externo cobrir só parte da gravação, pergunte.
- **Transcrição:**
  - use o áudio principal, extraído em WAV 16 kHz mono;
  - o tempo por palavra precisa ser preciso (no WhisperX, com alinhamento forçado e VAD);
  - passe como contexto os nomes próprios e termos técnicos do briefing e do roteiro;
  - se a transcrição veio do áudio externo, converta os tempos para a câmera pelo offset;
  - **confira o que foi engolido:** procure trechos com energia de áudio e sem palavra, e retranscreva esses trechos **sem** o contexto inicial (o contexto às vezes faz o modelo inventar frases ou pular takes repetidos). Avise a etapa de cortes;
  - o roteiro serve só para conferir a grafia. Nunca troque o que foi falado pelo texto do roteiro.
- **Silêncios:** mapeie os trechos sem fala acima de ~0,3 s (pelos tempos das palavras e do VAD, com o `silencedetect` do FFmpeg de apoio). Esta etapa só mapeia; quem corta é a próxima.
- **Notas de edição faladas** ("nota de edição … fim da nota"):
  - procure as duas expressões tolerando variações de transcrição;
  - cada nota vale para o que acabou de ser falado, salvo se disser outra coisa;
  - anote o arquivo, o início e o fim (incluindo as expressões, para o trecho inteiro sair do corte), o texto, uma interpretação curta e a etapa a que se refere;
  - abertura sem fechamento: termina na próxima pausa longa (≥1 s), com confiança baixa.
- **Saídas para o Claude ler:** uma transcrição por frase, com timecode e pausas marcadas (é isso que as etapas leem; o arquivo por palavra é só para os scripts).
