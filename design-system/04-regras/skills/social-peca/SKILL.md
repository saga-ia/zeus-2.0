---
name: social-peca
description: Skill 3 da Nina (social media). Transforma ideia + gancho escolhidos em peca pronta - carrossel de 10 cards com legenda (gancho nos primeiros 125 caracteres, max 2.100) ou roteiro de Reels. Pode mandar o carrossel direto pro CarrosseIA ou pro Gustavo. Acionar com "monta o carrossel", "escreve o post", "roteiro de reels", "faz a legenda", "transforma em carrossel".
---

# Nina — Skill 3: A peca

**Entrada:** ideia + gancho escolhidos (Skill 2). Se a pessoa chegar so com tema, gerar 3 ganchos rapidos e pedir escolha antes.

Pasta: `/opt/jeff-worker/projetos/nina/<perfil>/`. Ler `/opt/jeff-worker/projetos/clientes/<perfil>/contexto.md`: §4 Voz (escrever como os exemplos reais), §7 Provas (unica fonte de numero/case), §9 CTAs, §8 visual, §10 restricoes.

## Carrossel — 10 cards nesta ordem
1. **Capa** com o gancho.
2. **O erro comum**, escrito como se fosse a primeira coisa que a pessoa ve. Precisa segurar sozinho (muita gente so ve o card 2 quando o carrossel reaparece no feed).
3. **A prova:** dado, caso ou estudo. Sem fonte: escrever "sem fonte" e seguir. Nunca inventar numero, estudo ou pesquisa. Preferir caso real do Jeff/cliente.
4. **O mecanismo** em 1 frase, sem jargao.
5 a 8. **A entrega**, 3 ou 4 itens, cada um no padrao "parece X, funciona por Y".
9. **O cuidado:** quando isso nao funciona.
10. **Um pedido so** (coerente com a funcao do post: atracao = salvar/compartilhar/seguir; preparacao = comentar/DM; conversao = link/palavra no DM).

Regra: uma ideia por card.

**Legenda:** gancho inteiro nos primeiros 125 caracteres, maximo 2.100 no total. Contar os caracteres e informar.

## Reels — roteiro (quando o formato for video)
- 0 a 3s: gancho falado + texto na tela (mesma frase ou complementar).
- Corpo: erro comum, mecanismo, entrega em 2 ou 3 pontos. Uma ideia por corte.
- Fim: um pedido so.
- Duracao alvo e texto de tela por corte. Legenda com as mesmas regras do carrossel.
- Video em lote: passar pro Talles.

## Briefing visual (sempre junto)
**Carrossel:** texto grande e texto de apoio de cada card, elemento visual central, regra de repeticao visual entre cards. Capa entendida em menos de 1 segundo. Design serve a leitura, nao a firula.
**Reels:** 7 frases de texto na tela, conceito de capa, lista de B-roll ou imagens, comentario fixado.

## Gravar e parar
Salvar em `roteiros/AAAA-MM-DD-slug.md` (peca + legenda + briefing). **PARADA 2:** mostrar e esperar aprovacao ou ajuste. Aprovado: seguir pra `/social-pacote`.

## Arte
Perguntar se quer gerar a arte agora:
- **CarrosseIA** (MCP `carrocel`): seguir o fluxo dele (listar_modelos, perguntar @ e capa, criar_carrossel).
- **Gustavo**: padrao premium, ver `docs/gustavo-designer.md`.

Publicar e com `/social-pacote`, so com "vai" explicito do Jeff/Vinicius.

## Arte
Antes de gerar qualquer arte (principalmente com print de referência), siga `/root/.claude/skills/arte-por-referencia/SKILL.md`: o usuário escolhe o modo (IA Google, IA OpenAI, Híbrido, HTML); sempre olhar a referência antes e decidir por elemento: texto, selo e foto em HTML, IA de imagem só pra foto/ilustração (Híbrido OpenAI por padrão quando precisar), amostra antes do lote.

Arte com foto segue o **fluxo de 3 tempos** da arte-por-referencia: primeiro as referências de inspiração, depois as fotos do usuário em que vai trabalhar, e só então gerar (estrutura da referência + foto real em cena nova). Antes de criar, rode `/opt/jeff-worker/scripts/feedback-arte.sh <marca>` e abra as artes com 👍: avaliação positiva do usuário é o sinal de que a Nina está no caminho certo, então repita a receita delas. O que teve 👎 não se repete.
