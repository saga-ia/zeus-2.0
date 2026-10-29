# Google Ads — Referência Técnica

## Filosofia
Meta cria demanda, Google captura demanda. Em quase todo negócio maduro, Google Ads tem o melhor ROAS de primeira ordem — mas tem teto. Use os dois.

## 7 tipos de campanha em 2026
- **Search** — pesquisa, intenção máxima
- **Performance Max (PMax)** — IA cross-channel (Search + Display + YouTube + Gmail + Discover + Shopping)
- **Display** — banners (em declínio, prefira PMax)
- **YouTube** — vídeo (in-stream, in-feed, Shorts, bumper)
- **Demand Gen** — sucessor do Discovery (YouTube + Gmail + Discover)
- **Shopping** — listagens de produto (hoje quase tudo via PMax + feed)
- **App** — instalação/engajamento de app

## Arquitetura recomendada para 80% dos negócios
1. Search Branded (capturar marca, ROAS altíssimo)
2. Search Non-Branded (categoria — onde cresce)
3. Performance Max (escala IA)
4. YouTube (geração de demanda)
5. Demand Gen (audiências visuais)

## Search em 2026
- **STAG** (Single Theme Ad Group) — agrupa por TEMA, não por exatidão
- **Broad Match com Smart Bidding** virou padrão (Google entende intenção)
- **RSA** com 15 títulos + 4 descrições, pinar 2-3 estratégicos
- **Assets** sempre: sitelinks, callouts, snippets, imagem, leadform

## Smart Bidding — como escolher
- **Maximize Conversions** — conta nova, aprendendo
- **tCPA** — quando conhece CPA alvo
- **Maximize Conversion Value** — valor de conversão varia (e-commerce)
- **tROAS** — dados consistentes, quer escalar mantendo retorno
- **Manual CPC** — quase morto

Regra: comece em Maximize Conversions → espere 30 conversões → migre para tCPA com meta 15% acima.

## PMax — configuração vencedora
- Use feed (+25-40% performance em e-commerce)
- Asset Group: 15 títulos, 5 descrições, 20 imagens, 5 vídeos (vídeo é obrigatório)
- Audience Signals com Customer Match
- Search Themes específicos ("tênis trail running tamanho 38")
- **Brand Exclusions** para não canibalizar Search Branded
- Final URL Expansion: ative em site com várias páginas

## PMax + Search — como coexistir
- Search Branded com lance manual/tCPA agressivo (trava o termo)
- PMax com Brand Exclusions
- Search Non-Branded com tROAS para escalar controlado

## Customer Match
Upload de lista de clientes (email/telefone hasheados) é o sinal mais valioso. Use para:
- Excluir clientes de campanhas TOFU
- Criar Similar Audiences
- Retargeting cross-device preciso
- Branded com lance maior (cliente compra mais)

## Enhanced Conversions
Quase obrigatório. Sem ele, perde até 25% dos dados de conversão. Setup pelo GA4 + Tag Manager hasheando email no momento da compra.

## Conversões: primária vs secundária
- **Primária** — usada para Smart Bidding (só a final: Purchase, Lead qualificado)
- **Secundária** — rastreada mas não otimizada (AddToCart, ViewItem, micro)

Erro comum: tudo como primária. Resultado: IA otimiza para AddToCart barato em vez de Purchase rentável.

## Modelo de atribuição em 2026
**Data-Driven** é o padrão. Precisa de 300+ conversões em 30 dias para ser estável.

## Palavras-chave negativas (separa amador de profissional)
Audite Search Terms Report toda semana e adicione em 3 níveis:
- **Conta** — universais (grátis, download, concorrentes)
- **Campanha** — temáticas
- **Grupo** — finas (gênero, faixa etária)

Use listas compartilhadas (Shared Library).

## Métricas-chave
- Impression Share (quanto captura do total)
- Search Lost IS (rank) — quanto perde por ranking
- Search Lost IS (budget) — quanto perde por orçamento
- CTR — Search >4%, Shopping >0,5%, Display >0,3%
- Cost / Conv
- ROAS / Conv. Value / Cost
- Cross-Device Conversions

## YouTube — formatos
- In-stream skippable (pague só quem assistiu >30s)
- In-stream non-skippable (até 15s, CPM)
- Bumper (6s)
- In-feed (Discovery antigo)
- Shorts (crescimento exponencial)
- Masthead (caro, reservado)

## YouTube VSL — estratégia
- In-stream skippable
- Custom intent: pessoas que pesquisaram concorrentes
- Custom Placement em canais do nicho
- Frequency cap 3-5/semana

## Demand Gen
Substituiu Discovery em 2023-25. Cobre YouTube (+ Shorts), Gmail, Discover. 3 bilhões de usuários.
- Carousel converte melhor em e-commerce
- Vídeo melhor em serviços
- CPMs 30-50% menores que Meta
- Use Customer Match + In-Market + Affinity como audiências

## Shopping & Merchant Center — feed
- Títulos: marca + categoria + atributo + tamanho + cor
- Imagens alta resolução, fundo branco, sem texto
- GTIN/MPN/brand sempre preenchidos
- Categoria Google no nível mais específico
- Custom labels (margem, sazonalidade, prioridade)
- Reviews sincronizados via Google Customer Reviews

## Erros que reprovam feed
- Preço diferente do site
- Disponibilidade desatualizada
- Site sem política de devolução
- Falta contato visível
- Imagens com marca d'água/texto promocional
- Categoria incorreta

## Erros fatais em Google Ads
1. Rodar só PMax sem Search Branded (canibaliza)
2. Não usar negativas
3. Smart Bidding sem volume mínimo (vira chute)
4. Configurar visualização de página como conversão primária
5. Não usar Enhanced Conversions
6. Mexer em Smart Bidding todo dia (precisa 14+ dias estáveis)
7. tROAS muito alto cedo (sufoca aprendizado)
8. Ignorar landing page (quality score → CPA)
9. Não auditar search terms
10. Acreditar 100% no relatório do Google (superestima)
