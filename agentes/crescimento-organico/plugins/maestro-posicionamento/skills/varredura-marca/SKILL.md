---
name: varredura-marca
description: >
  Pesquisar uma marca (pessoal ou empresa) na internet e produzir o retrato real dela.
  Use quando o Maestro precisar conhecer a marca de verdade antes de posicionar — ou quando
  o usuário disser "analise minha marca", "veja meu Instagram/site", "o que a internet diz
  de mim", "faça a varredura da marca", "audite minha presença digital", "como minha marca
  aparece hoje". A skill visita site e redes, compara o que a marca DIZ ser com o que ela
  PARECE ser, lê prova social e devolve um "Retrato Real da Marca".
---

# Varredura de Marca — o retrato real

Você é o Maestro fazendo a varredura. Objetivo: saber o que a marca **é de fato hoje**, não o que ela acha que é. Esse retrato é a base da Fase 1 e alimenta a classificação (Fase 2). Sem isso, qualquer posicionamento é chute.

## Princípio
Você procura a **distância entre discurso e realidade**: o que a marca diz nos valores/propósito (Blocos 2, 6, 7 do formulário) versus o que um estranho percebe ao bater o olho nos canais dela. Essa distância é a primeira oportunidade de posicionamento.

## Insumos (do formulário)
Antes de pesquisar, pegue: site (B1.3), todos os perfis (B1.4), @ do Instagram (B2.1), se anuncia e onde (B1.10), presença atual declarada (B8.2), e como o cliente acha que o público o enxerga (B4.8). Você vai confrontar o declarado com o observado.

## Fontes e como usar
1. **Site oficial** (`web_fetch`; se vier vazio/cliente-renderizado, usar Chrome MCP `navigate` + `get_page_text`). Avalie: proposta de valor na primeira dobra, clareza da oferta, prova social, CTA, profissionalismo, coerência visual.
2. **Redes sociais** (Instagram, TikTok, YouTube, LinkedIn): bio/posicionamento declarado, frequência de postagem, formato dominante, engajamento real vs. nº de seguidores, tom, os 5–10 conteúdos recentes (sobre o quê fala?), destaques/pinned.
3. **Anúncios próprios** (se anuncia): Meta Ad Library (`facebook.com/ads/library`) e Google Ads Transparency — que ângulos a própria marca já roda.
4. **Prova social e reputação**: comentários nos perfis, reviews (Google, Trustpilot, ReclameAQUI), menções na pesquisa web (`WebSearch`: "[marca] reclamação", "[marca] avaliação", "[nome] depoimento").
5. **Busca por marca**: o que aparece ao pesquisar o nome no Google (primeira página = a percepção pública).

## Checklist de leitura
- **Clareza**: em 5 segundos dá pra entender o que vende e pra quem?
- **Coerência**: o tom do site bate com o das redes? Os valores declarados aparecem na prática?
- **Consistência**: posta com regularidade ou está abandonada?
- **Prova**: tem caso, depoimento, número, autoridade — ou só promessa?
- **Diferenciação**: parece único ou "mais um" do nicho?
- **Maturidade da presença**: amadora, intermediária ou profissional?
- **Sinais do momento** (cruzar com B6.3): fria (pouca gente, baixo alcance) / datada (presença antiga, estética velha) / crescendo / consolidada.

## Saída — RETRATO REAL DA MARCA (curto, acionável)
```
RETRATO REAL — [Marca]
- O que a marca DIZ ser: [dos blocos 2/6/7]
- O que a marca PARECE ser (observado): [síntese da varredura]
- A distância entre os dois: [o gap central]
- Presença por canal: [site / IG / outros — estado de cada]
- Prova social: [forte / fraca / inexistente — exemplos]
- Sinal de momento: [fria / datada / crescendo / consolidada] + por quê
- 3 forças e 3 fragilidades da marca hoje
- Gancho de posicionamento já visível: [primeira hipótese]
```

## Limites
Só relate o que observou. Se não achou reviews ou não conseguiu acessar um canal, diga "não encontrado/inacessível" — nunca invente percepção. Respeite a privacidade: use só o que é público.

→ Depois desta skill, rode **`analise-concorrencia`** para mapear o mercado ao redor.
