# Post avulso indicado pelo Jeff — instagram.com/p/Dcn_AU0R4EO

## Autor real identificado
**NÃO é @tay.ldantas.** O post é de **@cristophergaki**.

Confirmado por duas leituras independentes da página pública do post (URL direta e URL
`/embed/`), ambas batendo nos mesmos números (218 curtidas, 90 posts / 3K seguidores no
perfil, mesma legenda e mesma lista de quem comentou). Como o Apify está sem crédito este
mês (ver `BLOQUEIO-apify.md`), não usei `instagram.sh`/`apify.sh` pra isso — usei leitura
direta da página pública (WebFetch), que é texto/HTML servido sem login, não a API oficial.
**Limite dessa fonte: não baixa o vídeo, não dá acesso a frame nenhum e não tem a mesma
confiabilidade estrutural de uma extração via API/scraper — trato como leitura, não como
dado oficial.**

Como o autor é diferente do alvo original, criei também a pasta
`/opt/jeff-worker/projetos/nina/cristophergaki/` (vazia por ora, reservada pra quando
houver crédito Apify pra fazer a análise completa do perfil dele).

## O que dá pra afirmar com a fonte disponível
- Formato: Reel (vídeo).
- Legenda: "Formatos de conteúdo para YouTube".
- Engajamento no momento da checagem: 218 curtidas, 111 comentários (sem fonte de alcance/plays
  — a página pública não mostra isso sem login).
- Postado por volta de 29/ago/2026 (texto da página dizia "há 5 semanas" a partir de hoje,
  08/out/2026 — a conta exata de semanas não fecha perfeitamente com a data citada; ambas
  vieram da mesma leitura, então registro a inconsistência em vez de arredondar sem avisar).
- Conteúdo visual do thumbnail/vídeo (segundo a leitura da página, não verificado quadro a
  quadro): meme com texto sobreposto listando "Formatos de Conteúdo para YouTube",
  numerado de 1 a 10, pessoa (barba) aparece no quadro.
- Comentários concentrados em responder com o número "10" (ex.: @davicostaac, @eduardoinojosape,
  @pedrofounders, @cardoso_igor, entre outros) — isso é o rastro de uma mecânica de lista
  numerada que convida o espectador a comentar o número, não um CTA textual explícito visto
  na legenda.

## Classificação (dentro do limite da fonte)
- **Gancho:** lista/curiosidade — "numerado de 1 a 10" promete quantidade fechada de formatos,
  gancho de checklist.
- **Estrutura:** passos/lista numerada.
- **CTA:** nenhum explícito na legenda; o comportamento dos comentários sugere CTA implícito
  de "qual desses você usa / comenta o número" dentro do próprio vídeo — não confirmado por
  fala, porque não tive acesso ao áudio/vídeo.
- **Tema:** marketing de conteúdo (YouTube).
- **Formato:** Reels.
- **Visual (capa):** tipografia por cima de vídeo com uma pessoa, formato meme — base
  "foto real + texto na tela", não ilustração nem print.
- **Intenção do post:** conteúdo (ensina/lista), não autoridade de palco nem oferta.

## Por que (aparentemente) funciona
Lista numerada fechada (10 formatos) cria curiosidade de "qual é o meu favorito/qual eu
já uso" e dá aos espectadores um motivo fácil de comentar (o número), o que historicamente
ajuda engajamento em Reels de lista — mas isso é leitura de padrão geral de formato, **não
uma prova de mediana deste perfil** (não tenho os outros Reels de @cristophergaki pra
comparar vs_mediana; são só 218 curtidas e 111 comentários de UM post, sem o que comparar).

## O que é copiável (estrutura, nunca texto/arte) pra um perfil B2B como @jeffhenrike
1. Reel de lista numerada fechada sobre um tema do nicho de posicionamento/marketing B2B
   (ex.: "7 erros de posicionamento que custam cliente"), com texto sobreposto no vídeo e
   gancho de contagem fechada nos 3 primeiros segundos.
2. Mecânica de comentário por número (em vez de "comenta a palavra X"), pedindo pra pessoa
   comentar qual item da lista mais se aplica a ela — gera comentário sem precisar de CTA
   longo na legenda.
3. Thumbnail com rosto + texto grande sobreposto (formato meme/lista), não só tipografia pura
   nem só rosto — testar esse meio-termo visual em vez do padrão atual do perfil.

## Limites desta entrega
- Amostra: **n=1 post**, sem comparação de mediana (não existe grupo pra comparar).
- Sem acesso a plays/alcance, sem transcrição de áudio, sem frame a frame real do vídeo.
- Identificação do autor tem confiança razoável (duas leituras independentes concordam),
  mas não é a mesma garantia que uma extração via API oficial teria.
- Nenhum texto ou arte deste post foi copiado — só estrutura, conforme N8.
