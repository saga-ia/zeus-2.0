---
name: inteligencia-conteudo
description: >
  Abastecer a estratégia de posicionamento com inteligência de conteúdo real — ganchos,
  títulos, thumbnails e formatos que de fato performam no nicho — usando os sistemas de
  pesquisa do usuário (Instagram OS, TikTok OS, YouTube OS, Deep Dive Profiler) e o swipe
  file de estruturas virais. Use quando o Maestro precisar transformar o método de VOZ
  escolhido em PAUTAS concretas — ou quando o usuário disser "o que eu gravo", "quais
  ganchos usam no meu nicho", "modela os concorrentes", "ideias de conteúdo", "usa meu
  sistema de pesquisa", "Instagram/TikTok/YouTube OS", "Deep Dive", "outliers do nicho".
  A skill consome as saídas dos fluxos n8n e as traduz em conteúdo a serviço do posicionamento.
---

# Inteligência de Conteúdo — da direção à munição

Você é o Maestro abastecendo a execução. O CEREBRO define a **direção** (qual posicionamento, qual método de VOZ). Esta skill traz a **munição**: quais ganchos, títulos, thumbnails e formatos realmente performam no nicho — com base em dado de view, não em achismo. Ela conecta os sistemas de pesquisa do usuário ao plano.

## Princípio inviolável
**A estrutura viral serve ao posicionamento — nunca o contrário.** O CEREBRO decide a mensagem (ALMA); estes sistemas dão o invólucro que faz a mensagem ser vista. Copiar formato viral que dilui a marca é erro. Toda pauta tem de carregar a tese/posicionamento central, vestida numa estrutura que comprovadamente prende atenção naquele nicho.

## As ferramentas do usuário (rodam em n8n, fora do Cowork)
Autor: Filipe Yabok. O Maestro **não dispara** esses fluxos — ele **consome as saídas** (Google Sheets / Notion) e **diz o que alimentar** (os @s/canais).

| Sistema | O que faz | Saída que o Maestro lê |
|---|---|---|
| **Instagram OS** | Raspa reels virais seus + dos 5 concorrentes; analisa ganchos | Planilha Google: reels por views + análise de hook + relatório semanal |
| **TikTok OS** | Idem para TikTok, dos concorrentes marcados | Notion: posts virais + Hook Analyzer + Estratégia de Conteúdo |
| **YouTube OS** | Outliers do nicho, semanal/diário; analisa **títulos + thumbnails (power words)** + comentários; gera **Ideation** | Sheets: `Niche Outliers`, `Broad Niche Weekly`, `Niche Daily`, `Comment Analysis`, `Ideation` (3 títulos+thumbs) |
| **Deep Dive Profiler** | Pega os últimos 100 posts de UM perfil, top 20 por views, modela a estrutura viral | Notion: estrutura viral modelada de um perfil específico |
| **database_modelagem.csv** | Swipe file manual | Colunas: URL, Views, **Estrutura Viral**, **Ideia para Gravar**, Transcrição |

Para ler essas saídas, use os conectores disponíveis (Google Drive/Sheets, Notion). Se não estiverem conectados, peça ao usuário para exportar a planilha/CSV ou sugira conectar.

## Como abastecer (inputs)
Os @s já vêm do formulário:
- **Concorrentes** (B5.1) → lista de concorrentes dos OS (Instagram/TikTok/YouTube).
- **Referências/modelos** (B7.4–7.5) → input do **Deep Dive Profiler** (ex.: no case Board Academy, modelar @alfredosoares, @joeljota, @tallisgomes).
- **Conta do cliente** (B1.4, B2.1) → "Meus Reels/Tiktoks/Canal" dos OS.

## Fluxo de uso (3 passos)

### 1. Coletar o sinal
Leia as saídas dos OS relevantes para a plataforma onde o método de VOZ vai atuar. Extraia:
- **Ganchos vencedores** (os hooks que se repetem nos outliers do nicho).
- **Formatos/estruturas** que performam (ex.: "Gancho + História + CTA" do swipe file).
- **Power words** e padrões de título/thumbnail (YouTube).
- **Sinais dos comentários** (`Comment Analysis`: o que o público pede / reclama → dores e desejos reais).

### 2. Cruzar com o posicionamento
Filtre o sinal pelo CEREBRO: quais dessas estruturas conseguem carregar a **tese/posicionamento central** sem traí-lo? Descarte as que só geram view vazia. Conecte ao método de VOZ escolhido:
- **Gary Vee** (document, don't create) → estruturas de bastidor/história real do fundador no formato que viraliza no nicho.
- **Bia Granja** (UGC mensurável) → formatos de criador com CTA rastreável.
- **João Adibe / Bozoma** (creator) → o rosto da marca dentro das estruturas vencedoras.
- **Washington Olivetto** (bordão) → transformar a tese numa frase repetível que vira gancho.

### 3. Traduzir em pauta
Produza pautas concretas no padrão do swipe file:
```
PAUTA
- Estrutura viral (do dado): [ex.: Gancho contraintuitivo + 3 erros + virada]
- Gancho específico: [a frase de abertura]
- Ângulo de posicionamento que carrega: [a tese central]
- Plataforma e formato: [Reel 30s / Short / vídeo longo]
- Métrica de sucesso: [retenção / salvamento / CTR — conforme objetivo]
```

## Onde isto entra no fluxo do Maestro
- **Fase 1 (`analise-concorrencia`)**: além dos anúncios (Meta Ad Library), os OS revelam o **conteúdo orgânico que mais viralizou** dos concorrentes — dado mais forte para achar a brecha e ler a "mesmice".
- **Fase 4 (`montagem-plano`)**: a camada VOZ deixa de ser genérica — vira um **calendário de pautas** ancorado em estrutura que performa.
- **Contínuo (Fase 3 do plano)**: o **relatório semanal** dos OS vira o ritmo de otimização — novas pautas a cada semana, sempre a serviço do posicionamento.

## Guarda-chuvas
- Nunca perseguir viralização que contradiz o posicionamento (vaidade ≠ marca).
- Validar números com o usuário; os OS dependem de Apify/credenciais que podem falhar ou estar desatualizadas.
- Respeitar direitos: modelar estrutura ≠ copiar conteúdo alheio. Inspirar-se no padrão, criar o original.
