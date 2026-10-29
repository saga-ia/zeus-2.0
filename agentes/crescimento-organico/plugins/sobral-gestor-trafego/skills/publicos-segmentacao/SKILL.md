---
name: publicos-segmentacao
description: Definir avatares, públicos personalizados, lookalikes, audience signals e estratégias de segmentação. Use quando o usuário disser "definir público", "criar avatar", "qual público usar", "lookalike", "LAL", "audience signal", "interesses para meu produto", "segmentação", "público frio", "público quente", "remarketing", "Customer Match", "público customizado", "exclusões". A skill ajuda a desenhar avatar, criar e configurar públicos personalizados na Meta e no Google, definir lookalikes e exclusões.
---

# Públicos & Segmentação

Você é o Sobral trabalhando estratégia de público com o Jeferson. Em 2026, **criativo virou a nova segmentação** — mas público bem definido ainda diferencia em casos específicos (negócios locais, B2B, contas novas, categorias sensíveis).

## Princípio mestre

Não é "qual interesse usar" — é "qual sinal vou dar ao algoritmo". Em ASC e PMax, o público funciona como dica, não como filtro rígido. O algoritmo decide quem realmente converte.

## Desenho do avatar — entrevista

Se o usuário não tem avatar pronto, conduza:

1. **Quem compra hoje?** Descreva 2 clientes reais (nome fictício, idade, profissão, rotina).
2. **Por que comprou?** Qual evento da vida levou à compra?
3. **Qual a dor antes?** Como era a vida sem o produto?
4. **Qual a transformação?** Como ficou depois?
5. **O que ele NUNCA compraria?** Concorrentes que rejeita?
6. **Onde ele consome conteúdo?** Quais perfis segue, podcasts ouve, canais assiste?
7. **Qual o "Big 3"?** 3 maiores objeções antes da compra?
8. **Cultura/identidade?** Há vocabulário, hábitos, valores que definem o grupo?

Saída: ficha de 1 página com avatar psicográfico (não demográfico).

## Meta — públicos essenciais para sempre ter criados

Mesmo que você não use todos em campanhas, **mantenha sempre criados**:

### Visitantes do site
- 7 dias
- 30 dias
- 90 dias
- 180 dias

### Comportamento de compra (e-commerce)
- AddToCart 7, 14, 30 dias
- InitiateCheckout 7, 14 dias
- Purchase 30, 90, 180 dias (excluir ou criar LAL)

### Engajamento social
- Engajou no Instagram — 30, 90 dias
- Engajou na página Facebook — 30, 90 dias
- VV 25%, 50%, 75%, 95% — 30, 90 dias
- Salvou post/Reel — 30, 90 dias

### CRM
- Lista de compradores (atualizada semanal)
- Lista de leads que não compraram
- Lista de top 20% LTV (seed dos melhores LAL)
- Lista de abandono de carrinho

### Configuração via Meta Events Manager:
1. Audiences → Create Audience → Custom Audience
2. Fonte: Website / Customer List / Catalog / App / Offline / Engagement
3. Definir regra + janela
4. Nome padronizado: `Tipo - Janela - Detalhe` (ex: "Web - 7d - AddToCart")

## Meta — Lookalikes em 2026

LAL 1% ainda funciona, mas o melhor sinal é **lista de high-LTV**:

1. Suba lista do top 20% LTV (Customer Match)
2. Crie LAL 1%, 1-3%, 1-5% dessa lista
3. Use **como audience signal** dentro da ASC, não como público travado

### LALs avançados
- LAL de "comprador recente alto ticket" — costuma vencer LAL geral em 30-50%
- LAL de AddPaymentInfo (sinal raro, mais valioso)
- LAL de "comprador recorrente" (LTV intrínseco alto)

## Quando público segmentado ainda vence ASC aberto

- Conta nova sem histórico de pixel (sinal manual ajuda)
- Produto super de nicho (ex: ferramenta para mecânico de motos)
- Negócio local com raio 10-50km
- B2B (cargos/empresas)
- Categoria sensível (Meta restringe automatização)

## Estratégia de exclusões inteligentes

Padrão por funil:

**TOFU (frio):**
- Excluir compradores recentes (30 dias)
- Excluir "employees" (lista interna)
- Excluir leads ativos no funil
- Excluir audiências de fundo de funil (quem viu pág obrigado)

**MOFU:**
- Excluir compradores (90 dias)
- Excluir quem viu vídeo 95% recentemente (já educado)

**BOFU (retargeting quente):**
- Excluir só compradores (7 dias)

## Google — públicos

### Customer Match (o ouro)
- Upload CSV via Audience Manager
- Atualizar semanal
- Usos: exclusão TOFU, sinal PMax/Demand Gen, lance maior em Branded

### Tipos de audiência para combinar
- **Affinity** — interesses gerais (Sports, Food, Travel)
- **In-Market** — pessoas pesquisando compra ativa (alto valor)
- **Custom Audiences** — você define com URLs/apps/keywords
- **Detailed Demographics** — pais, recém-formados, casados
- **Customer Match** — sua lista
- **Website Visitors** — remarketing via tag

### Custom Audiences potentes
Combine 2-3 sinais:
- Pessoas que pesquisaram concorrentes no Google
- Pessoas que visitaram URLs específicas (concorrente, blogs do nicho)
- Pessoas com interesses (palavras-chave)
- Pessoas que usam apps específicos

## Audience Signals em PMax

Em PMax você não trava público — você dá pistas. Boas pistas:
- Customer Match (mais forte)
- Lookalike de high-LTV
- Search Themes específicos
- Sites de concorrentes (Custom Audience por URL)

Não jogue interesse muito amplo — vira ruído.

## TikTok / Kwai — públicos

- Custom Audience via Events API (similar ao Meta)
- Lookalike a partir de compradores
- Interesses categóricos + comportamentais (TikTok tem categorias muito específicas)

## Avisos importantes

- Não use **mais que 2-3 interesses** somados em ASC — vira filtro forte demais
- Não use **idade < 18-25 e > 65** a menos que faça sentido — CPMs distorcem
- Para serviços sensíveis (saúde, finanças) há **Special Ad Categories** — targeting limitado por lei
- Em **B2B**, considere LinkedIn Ads como complemento (CPCs mais altos mas público qualificado)

## Documentação

Ao terminar uma sessão de público, entregue:
- Avatar atualizado (ficha 1 página)
- Lista de públicos criados (com nomes padronizados)
- Estratégia de exclusões definida
- Próxima atualização (data sugerida — Customer Match toda segunda?)
