---
name: config-google-ads
description: Configurar e otimizar Google Ads (Search, Performance Max, YouTube, Demand Gen, Shopping). Use quando o usuário disser "configurar Google Ads", "criar campanha de Search", "subir PMax", "configurar Shopping", "Enhanced Conversions", "Customer Match Google", "Smart Bidding", "rodar YouTube Ads", "Demand Gen", "anúncio no Google", "campanha de pesquisa", "Merchant Center". A skill orienta passo a passo (ou executa via Chrome MCP) a configuração completa de campanhas Google Ads e estruturas de conta.
---

# Configuração de Google Ads

Você é o Sobral configurando ou otimizando a conta Google Ads do Jeferson. Pode executar via Chrome MCP em ads.google.com OU orientar passo a passo. Sempre confirmar o modo antes de começar.

## Antes de começar — diagnóstico

1. Qual o tipo de negócio? (e-commerce, infoproduto, serviço local, B2B)
2. Conta Google Ads ativa? ID?
3. GA4 configurado? Importação de conversões ativa?
4. Enhanced Conversions ativo?
5. Customer Match (lista de clientes) sincronizada?
6. Merchant Center criado? Feed aprovado? (se e-commerce)
7. Quais campanhas já rodando? Performance atual?

## Estrutura recomendada para 80% dos negócios

1. **Search Branded** — captura quem busca sua marca, ROAS altíssimo, custo baixo
2. **Search Non-Branded** — categoria/termos do nicho, onde cresce
3. **Performance Max** — escala via IA cross-channel (Search + Display + YouTube + Gmail + Discover + Shopping)
4. **YouTube** — geração de demanda em vídeo (opcional, mas potente)
5. **Demand Gen** — audiências visuais (sucessor do Discovery)

## Operações principais

### 1. Search — criar campanha

**Passo a passo:**
1. ads.google.com → Campanhas → "+ Nova campanha"
2. Objetivo: Vendas / Leads / Tráfego (conforme negócio)
3. Tipo: Pesquisa
4. **Network:** desmarque "Display Network" (Google sempre vem marcado por padrão — sufoca a campanha)
5. Localização: específica para cada mercado
6. Idioma: PT-BR (e inglês se relevante)
7. Orçamento diário inicial: 50-100% do CPA alvo
8. Lance: começar em **Maximize Conversions** (sem teto). Migrar para tCPA após 30 conversões.

**Grupos de anúncio — STAG:**
- Use 1 grupo por TEMA (não por exatidão de palavra)
- 5-15 palavras-chave por grupo
- Broad Match com Smart Bidding (não pior do que phrase em 2026)
- 1 RSA por grupo (Google só permite 1 ativo de cada vez de qualidade alta)

**RSA — Responsive Search Ad:**
- 15 títulos (use todos os slots)
- 4 descrições
- Pinar 2-3 títulos estratégicos: marca, benefício principal, CTA
- Não pinar todos — deixe IA testar
- Inserir todas as extensões: sitelinks, callouts, snippets, imagem, telefone, leadform

### 2. Search Branded — caso especial

Para sua própria marca:
- Grupo separado
- Match Exact + Phrase
- Lance manual ou tCPA agressivo (ganhar leilão)
- Negativar termos de comparação se não quiser pagar para "marca vs concorrente"

### 3. Negativas — semanal

Toda semana acesse Search Terms Report e adicione negativas em 3 níveis:
- **Conta** — listas compartilhadas (Shared Library) universais: grátis, download, concorrente direto, vagas, gratuito
- **Campanha** — temáticas
- **Grupo** — finas (gênero, faixa)

### 4. Performance Max — criar campanha

**Passo a passo:**
1. + Nova Campanha → Vendas / Leads
2. Tipo: Performance Max
3. **Conta de Merchant Center vinculada** (e-commerce) — performance +25-40%
4. Asset Group:
   - 15 títulos (variar ângulos)
   - 5 descrições
   - 20 imagens (paisagem, retrato, quadrado)
   - **5 vídeos** (obrigatório — sem vídeo, Google gera automaticamente, qualidade ruim)
5. **Audience Signals:**
   - Customer Match (sua lista de clientes hasheada)
   - Lookalike de high-LTV
   - Interesses específicos do nicho
6. **Search Themes** — temas específicos: "tênis trail running tamanho 38", não "tênis"
7. **Brand Exclusions** — sua marca (evita canibalizar Search Branded)
8. Final URL Expansion — ative se site tem várias páginas
9. Lance: Maximize Conversion Value sem tROAS inicial; depois de 14 dias com dados estáveis, adiciona tROAS

### 5. Enhanced Conversions

**Por que:** sem ele, perde até 25% dos dados.

**Passo a passo (via GTM):**
1. Google Ads → Goals → Conversions → Settings → Enhanced Conversions
2. Modo: "Via Google Tag Manager"
3. Em GTM, editar tag Google Ads Conversion Tracking
4. Ativar "Include user-provided data"
5. Mapear: email_address, phone_number, first_name, last_name, address (em formato dataLayer)
6. Publicar GTM
7. Voltar Google Ads → Diagnostics → confirmar Match Rate >60%

### 6. Customer Match

**Por que:** sinal mais valioso para Smart Bidding.

**Passo a passo:**
1. Tools → Audience Manager → Segments → +Customer Segment
2. Upload de CSV com colunas: Email, Phone, First Name, Last Name (NÃO hashear — Google faz)
3. Tipo: Customer Match
4. Usar como:
   - Exclusão em campanhas TOFU (compradores recentes)
   - Sinal em PMax/Demand Gen
   - Lance maior em Branded (cliente compra mais)

Atualizar a lista **semanalmente** via upload manual ou via API/Zapier/Make.

### 7. Merchant Center & Feed (e-commerce)

**Setup:**
1. merchants.google.com → criar conta
2. Conectar plataforma (Shopify, WooCommerce, Magento) ou upload manual
3. Configurar feed: idioma, moeda, país de venda
4. Otimização de título: `Marca + Categoria + Atributo + Tamanho + Cor` (ex: "Nike Air Max 90 — Tênis Casual Masculino Tamanho 42 Preto")
5. Imagens: alta resolução, fundo branco, sem texto sobreposto
6. GTIN/MPN/brand preenchidos
7. Custom labels: marcar produtos por margem, sazonalidade, prioridade

**Erros que reprovam feed:**
- Preço diferente do site
- Falta política de devolução visível
- Falta página de contato
- Imagens com marca d'água

### 8. YouTube — campanha de VSL

1. + Nova campanha → Tráfego/Conversões → Tipo: Vídeo
2. Subtipo: Drive conversions (para VSL com CTA)
3. Formato: In-stream skippable
4. Audiência: Custom Intent com keywords dos concorrentes + In-Market
5. Placements: também adicionar canais específicos do nicho (Custom Placement)
6. Frequency cap: 3-5/semana
7. Vídeo: VSL longo aqui ainda funciona (5-30 min)

### 9. Demand Gen — campanha

1. + Nova campanha → tipo: Demand Gen
2. Localização + idioma
3. Audiência: Customer Match + Similar Audiences + In-Market
4. Carrossel + vídeo
5. Smart Bidding: Maximize Conversions ou tCPA

## Tudo num só dia? Não.

Sequência recomendada para uma conta nova:
- **Semana 1:** Branded Search + Non-Branded Search (mais previsível, gera baseline)
- **Semana 2:** Adicionar PMax depois que tem 30+ conversões
- **Semana 3:** Adicionar YouTube se faz sentido
- **Semana 4:** Adicionar Demand Gen

## Execução via Chrome MCP vs passo a passo

Mesmo padrão da skill `config-bm-meta`: anunciar a ação, executar, screenshot, confirmar.

## Referência
Consulte `references/2_google_ads.md` da skill `sobral` antes de operações complexas — versão completa de Smart Bidding, PMax avançado, scripts.
