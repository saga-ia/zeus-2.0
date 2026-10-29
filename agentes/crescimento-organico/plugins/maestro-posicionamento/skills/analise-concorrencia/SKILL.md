---
name: analise-concorrencia
description: >
  Mapear concorrentes de uma marca e achar a brecha de posicionamento. Use quando o Maestro
  precisar entender o mercado ao redor — ou quando o usuário disser "analise meus concorrentes",
  "o que meus concorrentes fazem", "Meta Ad Library", "que anúncios rodam no meu nicho", "onde
  tem espaço no mercado", "qual a brecha", "como me diferenciar deles". A skill audita 3 a 5
  concorrentes (posicionamento, oferta, ângulos de anúncio, tom) e devolve a brecha de
  posicionamento que a marca pode ocupar.
---

# Análise de Concorrência — achar a brecha

Você é o Maestro lendo o mercado. Diferente de uma análise de tráfego, aqui o foco é **posicionamento**: como cada concorrente ocupa a mente do público, e qual território está vago para a sua marca cravar.

## Princípio
Você procura 3 coisas: **a mesmice** (o que todos dizem igual — a B5.6 do formulário), **os padrões vencedores** (o que funciona e dá pra adaptar) e **o espaço vazio** (o ângulo que ninguém ocupou). A brecha quase sempre mora na mesmice: se todos dizem a mesma coisa, dizer outra é o atalho da diferenciação.

## Insumos (do formulário)
Concorrentes citados (B5.1), como o cliente acha que se diferencia (B5.2), concorrentes que ele acha fracos (B5.5), a mesmice que o incomoda (B5.6), e o que o mercado "não entendeu" sobre ele (B5.4).

## Fontes
0. **Inteligência de conteúdo orgânico** (skill `inteligencia-conteudo`) — se o usuário tem os sistemas de pesquisa (Instagram/TikTok/YouTube OS), use as saídas para ver o **conteúdo orgânico que mais viralizou** dos concorrentes — sinal mais forte que anúncio para ler a "mesmice" e a brecha. Alimente os OS com os concorrentes da B5.1.
1. **Meta Ad Library** (`facebook.com/ads/library`) — todos os anúncios ativos do concorrente. Anúncio rodando >60 dias = provável vencedor; 5+ variações = teste agressivo. Leia os hooks e ângulos, não só o visual.
2. **Google Ads Transparency** (`adstransparency.google.com`) — anúncios de Search/Display/YouTube.
3. **Sites e redes dos concorrentes** (`web_fetch` / Chrome MCP) — posicionamento, oferta, ticket aparente, tom.
4. **Pesquisa web** (`WebSearch`): "concorrentes de [marca]", "melhores [categoria]", "tendências [nicho] 2026", "[concorrente] estratégia".
5. **Reviews/comunidades** — onde os clientes dos concorrentes reclamam (a reclamação do cliente alheio é a sua brecha).

## Auditoria de cada concorrente (até 5)
Para cada um, responda curto:
- **Posicionamento**: como se posiciona? categoria, preço, persona, a "ideia central" dele?
- **Oferta**: ticket, garantia, bônus, formato de entrega.
- **Ângulo de comunicação**: top 3 hooks/ângulos que repete nos anúncios; estilo dominante (UGC, autoridade, demo, lifestyle).
- **Tom**: sério, divertido, premium, agressivo?
- **Força**: o que faz melhor que a sua marca.
- **Fraqueza**: onde tem espaço pra atacar.

## Síntese — MAPA DE MERCADO + BRECHA
```
MAPA DE MERCADO — [nicho]
- Como o mercado se posiciona (o consenso): [o que todos fazem igual]
- A MESMICE: [a frase/ângulo que todos repetem]
- Padrões vencedores: [o que funciona e dá pra adaptar]
- Reclamações recorrentes dos clientes do nicho: [dores não atendidas]
- A BRECHA: [o território de posicionamento vago que a marca pode ocupar]
- Eixo de diferenciação sugerido: [preço / propósito / nicho / experiência / personagem / categoria nova...]
```

A brecha é o presente que essa skill entrega ao roteamento: ela aponta qual **ângulo de Alma** o CEREBRO deve perseguir (ex.: brecha de propósito → Loducca/McKnight; brecha de categoria → Mateschitz; brecha de "ninguém fala a língua do povo" → Olivetto/Adibe).

## Limites
Não invente gasto nem dados de tráfego sem fonte. Se a Ad Library não mostrar anúncios, registre "não anuncia ou não rastreável". Distinga fato observado de hipótese.

→ Depois desta skill, rode **`roteamento-cerebro`** com objetivo + momento + brecha em mãos.
