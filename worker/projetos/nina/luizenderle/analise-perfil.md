# Análise de perfil — @luizenderle (08/10/2026, Nina)

Pesquisa de referência (swipe file) pra alimentar o conteúdo de @jeffhenrike. @luizenderle não é cliente, é benchmark: marketing/vendas B2B (follow-up, comercial, funil), avatar próximo ao do Jeff.

## 1. Amostra coletada e seus limites

**Bloqueio de coleta (reportar antes de tudo):** a conta Apify usada pelo servidor (plano free, US$5/mês) atingiu o **limite mensal de uso da conta inteira** durante esta tarefa — não foi o teto de US$1 desta tarefa que foi batido, foi o teto da conta toda, que ficou sem nenhuma funcionalidade (`ACTORS`, `STORAGE`, `PROXY`) disponível a partir daí (confirmado via `apify.sh whoami`: `"disabledReason": "Monthly usage hard limit exceeded"` em todas as features). Isso bloqueou:
- A coleta nova de posts (pedido: até 300; tentativa travou em "coleta vazia ou falhou" / `platform-feature-disabled`).
- O Creator Lab inteiro pro Reels (`creator-lab.sh analyze luizenderle`): rodou e falhou com 0 posts coletados (erro HTTP 402 por limite de memória/cota do Apify). Resultado: **nenhum Reel foi transcrito nem classificado por Groq/Jev nesta análise.**

**O que ficou disponível:** uma coleta anterior, feita antes do limite bater (mesmo dia), com **59 posts** (37 reels, 15 carrosséis, 2 imagens), de 05/12/2021 a 07/10/2026 — sem recorte de janela temporal controlada, a API trouxe o que tinha no cache. Processei esse lote existente (sem fazer nova chamada ao Apify) e li as capas, legendas e, nos Reels, só a tela de abertura (sem fala/transcrição).

**Limites que isso impõe na análise inteira:**
- Reels: analisados só por capa + legenda + contagem (curtidas, comentários, views). Nenhuma leitura de roteiro falado, ritmo de corte ou fala — a tabela de "Assistir os Reels" da skill não pôde ser cumprida.
- Carrosséis: **9 dos 13 carrosséis de 3+ dias têm curtida oculta** (valor -1 na coleta), o que deixa só **n=4** com dado válido de curtida — abaixo do piso de n=5 da regra N3/método da Nina. Toda conclusão sobre carrossel abaixo está marcada como padrão fraco, não causa.
- Amostra sem corte temporal: há post de 2021 misturado com posts de 2026. Mediana calculada só com posts de 3+ dias (regra padrão), mas isso não resolve a mistura de épocas.
- Não dá pra garantir que os 59 posts sejam os "últimos 300" pedidos — é o que a API trouxe numa chamada anterior, provavelmente ordenado por relevância/mix, não estritamente cronológico.

**Mediana (posts com 3+ dias):**
| Formato | n | Mediana curtidas | Mediana comentários | Mediana views |
|---|---|---|---|---|
| Reels | 37 | 60 | 4 | **943** |
| Carrossel | 4 (válidos; 9 com curtida oculta) | 212 | 8 | — |
| Imagem | 1 | — | — | n/a (não gera conclusão) |

Avisos automáticos do processamento: 9 carrosséis com curtida oculta; amostra de carrossel efetiva pequena (n=4).

## 2. Mix do perfil (lido qualitativamente em 16 peças, não no universo de 59)

Sem Jev (nenhum Reel classificado), a leitura de intenção foi manual, peça a peça, nas 16 imagens abertas (top e bottom por desempenho). Não é um mix fechado do perfil inteiro — é o que apareceu na amostra lida:

- **Conteúdo/autoridade de nicho** (regra, tutorial ou reação a algo do mercado de vendas/follow-up): maioria das peças de topo (Reels #1 a #4 do rank). Formato recorrente: selfie falando pra câmera + headline em caixa (vermelha ou branca) + print de prova (artigo, dado, vídeo de terceiro, dashboard) colado na cena.
- **Opinião/provocação sem prova** (redefine um termo do nicho, sem dado): peça isolada (DdmSdeppf0M) com a maior proporção comentário/view da amostra lida.
- **Oferta** (CTA de link na bio ou produto próprio citado, "@centr.br"): presente nos carrosséis Dd4lLUbmv78 e DdmkYhXmizt e em Reels que citam a ferramenta própria.
- **Pessoal/relacionamento**: só 1 peça lida (carrossel CXHbB1xlhSc, história de recomeço pessoal) e 1 peça de imagem de academia (DeLCtfiIux9) — ambas fora do padrão comercial do perfil, com desempenho oposto (a história pessoal rendeu acima da mediana de carrossel; a foto de academia ficou entre as piores da amostra de reels/imagem).

## 3. Achados (cada um com prova e limite declarado)

**Achado 1 — o visual padrão (selfie + headline + print de prova) aparece tanto no topo quanto na base do ranking; não é ele que diferencia.**
Prova: Reel #1 do rank (Dc1rstOo2wh, 70x a mediana de views, n=37) e o Reel DdT7ARAxMQJ (0,26x a mediana, quase o pior da amostra) usam exatamente a mesma montagem — selfie, headline em caixa vermelha, imagem de prova colada acima da cabeça. A diferença está no conteúdo da headline: "Esse é o melhor modelo de negócios que eu já vi" (genérico, sem nicho, sem tensão) vs "Leads não respondem whatsapp... quantos blocks você já tomou hoje?" (dor nomeada, específica, 28,5x a mediana).
Limite: leitura qualitativa de 6 peças desse padrão, não é classificação sistemática via Jev (que não rodou). Confirma a regra N3 (anti-genérico) só de forma observacional.

**Achado 2 — reel de tela gravada sem rosto rende abaixo da mediana, e repete um achado já validado em @jeffhenrike.**
Prova: Reel DdXHo2iICFR (dashboard de anúncios filmado, sem rosto) = 362 views, 0,38x a mediana de views (n=37). No próprio @jeffhenrike (achado de 07/10/2026, registrado na skill), tela de computador filmada sem rosto também rendeu 0,47x a mediana. Dois perfis diferentes, mesmo padrão.
Limite: n=1 nesta amostra para @luizenderle; o peso maior vem do cruzamento com o achado já validado no outro perfil.

**Achado 3 — carrossel formato "print simulado de rede social + fonte de prova" é o de melhor desempenho entre os poucos carrosséis com dado válido, e repete a mesma estrutura já validada em @lucureau.**
Prova: Dd4lLUbmv78 (1,3x a mediana de carrossel, n=4 válidos) usa a mesma montagem (print de "tweet" próprio + card de infográfico com fonte citada) da Peça 1 do swipe file de @lucureau (26.575 curtidas, 38,9x a mediana lá).
Limite: n=4 é abaixo do piso de n=5 pra generalizar dentro deste perfil; a força da conclusão vem de aparecer em dois perfis distintos com a mesma lógica, não da amostra isolada de @luizenderle.

**Achado 4 — a peça de opinião provocativa sem prova numérica teve a maior proporção de comentário por view lida na amostra.**
Prova: DdmSdeppf0M, 215 comentários em 16.201 views (1,3% comentário/view) — maior proporção entre as 16 peças lidas; o Reel #1 do rank (70x views) teve 111 comentários em 66.064 views (0,17% comentário/view), bem mais baixo.
Limite: n=1; comentário alto sinaliza debate, não necessariamente venda — não dá pra concluir que esse formato converte melhor, só que gera mais reação.

**Achado 5 — a única peça pessoal/não comercial lida rendeu acima da mediana de carrossel; o único post "corpo/academia" lido ficou entre os piores.**
Prova: CXHbB1xlhSc (história de recomeço pessoal) = 1,33x a mediana de carrossel (n=4 válidos); DeLCtfiIux9 (selfie de academia sem contexto comercial) = 16 curtidas, entre as piores peças da amostra de reels.
Limite: n=1 em cada grupo. Não dá pra separar causa de "é pessoal" de causa de "tem narrativa" (a história pessoal tem estrutura de texto longa; a foto de academia não tem texto algum). Padrão a testar, não conclusão.

## 4. Peças exemplares

Ver `referencias.md` para o swipe file completo (link, gancho literal, esqueleto, CTA, prova, limite) das 5 peças exemplares + 1 anti-referência:
1. Reel reação a vídeo de terceiro (70x mediana de views, n=37)
2. Reel regra de nicho com headline direta (28,5x, n=37)
3. Reel opinião controversa sem prova (17,2x views, maior comentário/view)
4. Carrossel "print de tweet" com história pessoal (1,33x mediana carrossel, n=4)
5. Carrossel "print de tweet" com prova numérica e fonte citada (1,3x, mesma estrutura validada em @lucureau)
6. Anti-referência: tela gravada sem rosto (0,38x a mediana)

## 5. Resumo final

- **Lógica de conteúdo do perfil em 1 frase:** vendedor/consultor comercial documentando a própria regra de vendas (follow-up, objeção, funil) em selfie com prova colada na tela, misturado com oferta da própria ferramenta (@centr.br).
- **O que rende acima da mediana (com a amostra disponível):** dor de nicho nomeada literalmente na headline (não o formato visual em si, que se repete em peças ruins também) e reação a conteúdo real e verificável de terceiro.
- **Estrutura de gancho predominante:** selfie + headline curta em caixa de cor sólida sobre a cabeça + print de prova (artigo, dashboard, vídeo de terceiro) — presente em praticamente toda a amostra lida, boa e ruim.
- **Estrutura de carrossel predominante:** "print simulado de post de rede social" como lâmina 1 (declaração provocativa) seguido de lâmina de prova com fonte citada — mesma lógica do padrão já validado em @lucureau.
- **Estrutura de post estático predominante:** não há amostra suficiente (só 1 imagem coletada) pra declarar um padrão; não generalizar.
- **O que é copiável pro @jeffhenrike (estrutura, nunca conteúdo literal — N8):**
  1. Reagir a uma peça real e nomeável do mercado de eventos, com a prova colada na cena, não narrada de memória (N1).
  2. Nomear a objeção literal que o empresário já disse em voz alta antes de derrubá-la com prova real do contexto §7.
  3. Testar 1 post de redefinição provocativa de um termo do nicho, curto, sem prova, fechando seco — no mesmo tom direto que já aparece na voz observada do Jeff.
  4. Evitar reel de tela gravada sem rosto — achado agora confirmado em 2 perfis.
  5. Carrossel "plantão de dado real" só com fonte verificável (nunca print simulado de fonte inexistente).

## 6. Custo

Coleta de posts: reaproveitada de uma chamada Apify anterior ao bloqueio (dentro do padrão de centavos documentado pela skill pra ~30-60 posts); nenhuma chamada nova de Apify foi cobrada nesta sessão porque todas falharam por limite de conta. Creator Lab: 1 tentativa de `analyze`, falhou antes de processar qualquer Reel (custo zero registrado, `"apify": null`). Groq e Jev não foram usados (não havia Reel coletado pra transcrever). Resultado: ficamos **abaixo dos 300 posts e dos 25 Reels pedidos**, por um bloqueio de infraestrutura (limite mensal da conta Apify), não pelo teto de US$1 da tarefa.
