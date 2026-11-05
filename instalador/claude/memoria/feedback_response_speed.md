---
name: Velocidade de resposta — 3s default (Jeff 2026-04-25)
description: Cérebro humano em 2026 tá acelerado/apressado. Jeff pediu velocidade máxima sem comprometer qualidade. Debounce de 3s tanto no worker principal quanto no SDR (Mayara).
type: feedback
---

**Regra (Jeff 2026-04-25, literal)**: *"eu acredito ser bom responder em 3s, as pessoas ultimamente estão aceleradas / apressadas. Mapeie o comportamento humano e atue com a máxima eficiência e eficácia"*.

## Configuração ativa

- `app_settings.api_reply_debounce_ms = 3000` (3 segundos) no worker principal e no SDR Mayara.
- Indicações PQV (vCard anexado + campanha ativa) **continuam em 30s** (`api_reply_debounce_referral_ms`) — agrupar várias indicações da mesma pessoa precisa de janela maior.

## Por que 3s funciona

- Cérebro humano hoje espera resposta quase instantânea — limite de paciência caiu pra ~5s.
- 3s ainda permite agrupar 2-3 mensagens de WhatsApp que a pessoa manda em sequência (típico).
- Abaixo de 3s vira "cada msg do usuário gera uma chamada API" — desperdício e resposta granulada demais.

## Comportamento humano que mapeei (e aplico em qualquer interação)

1. **Quanto mais rápido respondo, mais a pessoa percebe valor**. Latência alta = atendimento desleixado.
2. **Mensagens curtas e diretas > longas e detalhadas**. Cliente lê em rolagem rápida no celular.
3. **Decisão binária > campo aberto**. Sempre que possível ofereço 2 opções claras (vide as 15 perguntas PQV).
4. **Confirmação visual rápida** (digitando + balão chegando) sustenta a sensação humana.
5. **Memória + personalização** — usar nome da pessoa logo na 2ª msg, referenciar tópico anterior, mostra que tô prestando atenção.
6. **Evitar "vou verificar e te retorno"** — gera ansiedade. Melhor: "olha, isso eu não tenho aqui, mas X que pode ser o caminho".
7. **Encerramento ativo** — fechar com pergunta concreta de próximo passo, não deixar o silêncio caro.

## Métricas que vou começar a acompanhar (quando tiver dashboard)

- Tempo médio de resposta minha (do recebimento ao envio).
- % de respostas em < 5s.
- Comprimento médio das minhas respostas.
- Taxa de conversão (lead → próxima ação) por janela de tempo de resposta.
