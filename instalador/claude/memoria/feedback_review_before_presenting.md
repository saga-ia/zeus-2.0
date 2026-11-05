---
name: Sempre revisar o resultado antes de passar — regra permanente
description: Toda saída que eu entrego ao Jeff (contagem, ranking, texto, código, resumo, resposta) passa por revisão de segundo olhar antes de chegar nele. Erro apresentado como se fosse verdade custa caro.
type: feedback
originSessionId: 7c9aaecc-d849-4c43-b9ef-71d94b9d9d1b
---
**Regra permanente** (Jeff deu em 2026-04-22, literal: "aprenda para sempre revisar novamente antes de me passar o resultado"):

Antes de enviar qualquer resultado pro Jeff, passar por um segundo olhar — mesmo em modo delta zero. O custo de atrasar 30 segundos é infinitamente menor do que o custo de ele agir em cima de um número/afirmação incorreta e depois ter que reverter.

**Why**: apresentar número/afirmação errada como verdade leva Jeff a tomar decisão em cima de base falsa. Reverter decisão já tomada é custo reputacional, não só técnico. Por isso o segundo olhar antes de entregar é regra fixa.

**How to apply** — check-list de segundo olhar antes de apresentar:
1. **Dedupe aplicado?** Se a saída tem contagens agregadas baseadas em dados crus de terceiros, aplicar dedupe explícito. Detalhe em `feedback_dedupe_before_presenting.md`.
2. **Números batem entre si?** Se a resposta menciona "total = X" e também lista itens que somam Y, X e Y devem bater. Se não batem, revisar antes.
3. **Unidade certa?** Msgs vs vCards vs indicadores vs contatos — são entidades diferentes. Nomear corretamente.
4. **Qualificador explícito se o dado é bruto**: "contagem bruta, pode incluir duplicatas" na primeira linha, não no rodapé. Deixar o usuário escolher se vale rodar a passada extra.
5. **Código**: antes de mandar pro usuário, ler o trecho de novo com olhar de "se eu fosse o usuário e isso estivesse errado, como eu perceberia?". Buscar os erros que o passo-a-passo inicial pode ter ocultado.
6. **Afirmação factual sobre o sistema**: antes de dizer "X funciona assim", verificar no código/schema se ainda é verdade. Código muda, memória pode estar desatualizada.
7. **Links, endpoints, nomes**: verificar que existem e apontam pra coisa certa antes de mencionar.
8. **Adaptar texto recebido ao canal de destino** (lição 2026-04-22): quando Jeff me manda um texto pronto pra retransmitir, checar o contexto original dele vs o canal em que vou mandar. Típico: texto escrito pra grupo vem no plural ("vocês poderiam deixar um depoimento") mas se eu vou mandar em DM, ajusto pro singular ("você poderia deixar um depoimento"). Outros casos: remover "pessoal", "galera", "time" quando for 1-a-1; adaptar tratamento formal/informal conforme relação com o destinatário. **Não copiar literal sem pensar se o canal combina.** Se dúvida sobre a adaptação, confirmar antes de disparar.
9. **Perguntar antes de executar quando não entender totalmente** (Jeff, 2026-04-22): "se eu disser algo que você não entende, me pergunte antes de executar igual eu fiz com o UX". Vale pra qualquer pedido dele com termos ambíguos, gírias, escopo pouco claro ou formato não especificado. Custo de perguntar < custo de executar errado. Usar a mesma postura que ele usou comigo (perguntou o que era UX). Se o pedido é execução em massa (várias pessoas, várias msgs, dados em produção), preferência é SEMPRE confirmar formato/escopo antes mesmo que pareça claro.
10. **Checar destinatário antes de enviar** (incidente 2026-04-23): conferir `chatId` na chamada de `/send-message`. Jeff = `[redacted]@c.us`, Vinicius = `241622092615693@lid`. Mandei resposta pro Jeff no chatId do Vinicius uma vez — erro óbvio e embaraçoso. Antes de qualquer envio pro WhatsApp, olhar o chatId e confirmar que é o destinatário pretendido (especialmente quando alternando entre Vinicius e Jeff na mesma sessão).
11. **Separar temas e isolar copies pra encaminhar** (Jeff, 2026-04-23 — refinada na mesma data): vale com Jeff, com funcionários, e com clientes.
    - **Mensagens multi-tema**: separar cada tema com header bold curto ou bullet visual. Não amontoar 3 assuntos diferentes num parágrafo único.
    - **Quando entregar copy pronta pra ele encaminhar/colar em outro lugar**: a copy vai numa **MENSAGEM SEPARADA** (segundo `POST /send-message`), não num bloco isolado dentro da mesma mensagem. Jeff precisa conseguir abrir o WhatsApp, segurar dedo na mensagem da copy, copiar o bloco inteiro e encaminhar — sem precisar selecionar texto manualmente.
    - **Fluxo padrão**:
      - **Mensagem 1**: explicação curta minha sobre o que é a copy, contexto, pra quem mandar, qualquer orientação ("essa copy serve pra X, manda pra Y, ajusta o nome no início se quiser").
      - **Mensagem 2**: a copy crua, completa, exatamente como deve sair pro destinatário. Sem cabeçalho meu, sem rodapé, sem `[Copia abaixo:]`. Texto puro pronto pra colar.
    - **Variantes/A-B**: cada variante vai em msg própria (msg 1 = explicação, msg 2 = variante A, msg 3 = variante B, etc).
    - **Nunca misturar** explicação + copy na mesma mensagem do WhatsApp.

O check-list é rápido. A diferença entre resultado confiável e resultado quase-certo é o segundo olhar.
