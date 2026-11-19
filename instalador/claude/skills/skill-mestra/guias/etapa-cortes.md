# Etapa 3: cortes

O primeiro corte limpo: escolhe os takes, tira erros, falsas largadas, notas de edição e pausas. Sem zoom, animação ou efeito. Não é o corte final: é a base que a pessoa refina.

## Como decidir
- **Leia por frase, decida por frase.** A transcrição por frase (com timecode e pausas) é o que o Claude lê. O arquivo por palavra só é aberto para um trecho específico, por script.
- **Identifique os takes:** frases repetidas ou parecidas, recomeços, frases abandonadas, "pera", "de novo", "vou repetir". Espere várias tentativas por trecho.
- **Escolha o take, nesta ordem:**
  1. a nota de edição sobre aquele trecho;
  2. o último take completo (costuma ser o mais solto);
  3. se o último tropeçou e um anterior está limpo, o anterior.
- **Antes de descartar uma frase como incompleta**, procure outro take dela que a transcrição tenha perdido (trecho com som e sem palavra).
- O Claude escolhe pelo texto, não pela entrega (voz, expressão, olhar). Com dois takes bons e escolha difícil, escolha um e **marque** o outro.
- **Escolhe e descarta entre ideias e takes, nunca no meio da frase.**
- **Pausas:** corta as consideráveis; o quanto de ar fica é do perfil.
- **Hesitações** ("ééé", "hum", "tipo"): corta só quando estiver isolada por silêncio dos dois lados e for longa. A colada na fala fica: pela transcrição não dá para saber se o corte ficaria estranho, e quem julga é a pessoa.
- **Notas de edição:** o trecho inteiro sai (de "nota de edição" até "fim da nota").
- **Ordem:** a gravada. Reordenar, só sugerir no resumo, e só se for forte (uma frase de impacto que funcionaria muito melhor no começo).
- **Na dúvida, não corta e marca.**

## Bordas (trabalho de script)
- O Claude dá o início e o fim aproximados, nas palavras de borda. O script ajusta cada borda pela **energia do áudio** (não só pelo tempo da palavra), aplica a folga do perfil (ex.: ~0,1 s, para não comer sílaba) e arredonda para frames.
- **Muleta curta que a transcrição não escreveu** aparece como energia colada na palavra de borda: o script mantém no corte e cria um marcador para a pessoa conferir. Não afirme que é fala sem ouvir; muitas vezes é só palavra mal alinhada.
- Nunca rode o ajuste de bordas sobre cortes que voltaram do programa da pessoa: ele desfaria o acerto dela.

## Marcadores (na linha do tempo, não no chat)
- **dúvida de take:** havia outro take bom; diga onde está.
- **hesitação:** pensou em cortar e não cortou.
- **nota:** nota de edição de confiança baixa ou não entendida.
- **sugestão:** ex.: reordenação.
- **alerta:** técnico (sync duvidoso, transcrição ruim no trecho).

Marcadores ficam ancorados no tempo do arquivo de origem, para sobreviver a novas versões do corte. Texto curto e direto.

## Estado e entrega
- Cada segmento: id, arquivo, início, fim (no tempo do arquivo da câmera) e o começo do texto. Tela e áudio externo vêm do sync, sem duplicar.
- Entrega conforme `entrega-no-editor.md`. Nenhum corte é destrutivo: cada clipe aponta para o arquivo inteiro.
- **Resumo curto:** duração do bruto → duração do corte, quantos marcadores e de que tipo, o que for realmente importante e o caminho do arquivo.
- **Revisão:** pelo chat (tempo da sequência, convertido para o tempo de origem pela lista de segmentos) ou pela volta do programa. Os ajustes da pessoa valem mais. Se um ajuste dela contradiz algo que o Claude afirmou, reconheça.
- **Depois de aprovado, o corte trava.** Se mudar depois do plano de animação ou da câmera, avise que eles precisam ser recalculados.
