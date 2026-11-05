---
name: social-pesquisa
description: Skill da Nina (social media). Pesquisa pauta com fonte verificavel - temas, tendencias do nicho e posts fora da curva de concorrentes/referencias - e alimenta o swipe file (estrutura de post, nunca conteudo copiado). Entrega 5 a 10 ideias em ordem de potencial em ideias.md. Acionar com "pesquisa pauta", "o que ta em alta no nicho", "tendencias", "o que os concorrentes estao postando", "acha referencias", "swipe file", "ideias pra essa semana sobre X".
---

# Nina — Pesquisa + swipe file

Pasta do perfil: `/opt/jeff-worker/projetos/nina/<perfil>/`. Ler antes: `/opt/jeff-worker/projetos/clientes/<perfil>/contexto.md` (§2, §3, §4), e da pasta da Nina `referencias.md`, `ideias.md` (nao repetir ideia ja produzida ou descartada), `desempenho.md` (o que ja ganhou).

## Fontes
- Web: `firecrawl_search` (padrao) ou `perplexity_search` com recencia. Toda tendencia precisa de link.
- Concorrentes/referencias que o dono indicar: perfil publico via firecrawl ou o que ele colar. Apify (`scripts/apify.sh`) se ja estiver configurado pra Instagram.
- Proprio perfil: posts acima da mediana no `social-metrics.sh` sao a melhor referencia que existe.
- Perfil de concorrente/referencia a fundo (Reels transcritos + carrosseis lidos lamina a lamina, gancho/estrutura/CTA por mediana): `/social-perfil-pesquisa`. Usar quando a pergunta for "o que funciona no perfil X".

## Swipe file (`referencias.md`)
Pra cada referencia boa, acrescentar:
- Link:
- Tema:
- Gancho (primeira linha):
- Estrutura: lista / historia / contraste / opiniao / antes e depois / bastidor
- Por que prende:
- Como adaptar sem copiar (com a §4 Voz do contexto):
- Prova de que funcionou: numero visivel (views, comentarios) ou "sem numero"

## Entrega: 5 a 10 ideias, ordem de potencial
Pra cada uma:
1. Tema.
2. Angulo especifico.
3. Gancho possivel.
4. Gatilho principal.
5. Por que funciona pra esse publico (ligar a uma frase da §2 do contexto quando der).
6. Formato indicado (carrossel / Reels / imagem / Stories).
7. Funcao no funil (atracao / preparacao / conversao).
8. Fonte verificavel, ou "sem fonte".

Gravar em `ideias.md` com status `nova` e data.

## Regras
- Nunca inventar tendencia, numero ou "viralizou". Sem link, nao e tendencia, e opiniao: marcar assim.
- Sem ideia generica. Se outro perfil do nicho publicaria trocando o nome, descartar.
- Estrutura, nunca conteudo: nao reproduzir texto de terceiro.
- Termina na PARADA 1: mostrar as ideias e esperar a escolha.
