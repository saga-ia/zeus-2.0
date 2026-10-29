---
name: social-ideias-gancho
description: Skill 2 da Nina (social media). Banco de 30 ideias de post em 30 angulos diferentes com nota de curiosidade/compartilhamento/proximidade da venda (mostra top 10), e depois 10 primeiras linhas (ganchos) em 6 familias para a ideia escolhida, com as 3 melhores justificadas. Acionar com "me da ideias de post", "banco de ideias", "o que eu posto essa semana", "cria ganchos", "primeira linha", "hook".
---

# Nina — Skill 2: Banco de ideias + Gancho

**Pre-requisito:** diagnostico e frases do cliente (Skill 1 ou Maicom). Sem isso, rodar a Skill 1 antes.

Pasta: `/opt/jeff-worker/projetos/nina/<perfil>/`. Ler `/opt/jeff-worker/projetos/clientes/<perfil>/contexto.md` (§2 publico e frases, §3 crencas a derrubar, §4 voz, §6 oferta), e da pasta da Nina `referencias.md`, `ideias.md` (nao repetir produzida/descartada), `desempenho.md`.

## Parte A — 30 ideias
30 angulos diferentes, nao 30 versoes da mesma dica. Obrigatorio incluir: erro comum, comparacao, caso real, bastidor, quebra de mito, antes e depois, o que ninguem conta, checklist, se eu comecasse de novo, opiniao contraria. Usar as crencas a derrubar e as frases do cliente da Skill 1.

Para cada ideia: angulo, promessa em 1 linha, por que essa pessoa se importaria, formato sugerido (carrossel / Reels / foto / Stories).

Nota 0 a 10 em: curiosidade, chance de compartilhamento, proximidade com o que vende. Mostrar so as 10 de maior soma. Avisar que a nota e filtro de pauta, quem julga de verdade e a revisao semanal.

**Se houver dado** (`social-metrics.sh`): dar +2 na proximidade/compartilhamento das ideias que repetem o angulo/formato dos posts acima da mediana, e dizer qual post justificou.

Regra: descartar qualquer ideia que outro perfil do ramo publicaria so trocando o nome.

Gravar as 10 em `ideias.md` (status `nova`). **PARADA 1:** esperar a escolha antes da Parte B.

## Parte B — Ganchos (depois que a pessoa escolher a ideia)
Antes dos ganchos: a emoção específica do antes que a ideia toca (Roda das Emoções, `/opt/jeff-worker/docs/roda-das-emocoes.md`). Família "espelho" e "negação" funcionam melhor quando a cena nomeia essa emoção sem dizer o nome.
10 primeiras linhas, dizendo a familia de cada:
- **negacao:** tira da pessoa a resposta que ela tinha;
- **escala:** ela procura onde esta;
- **opiniao:** quem discorda comenta;
- **espelho:** a cena que so quem vive reconhece;
- **autoridade:** numero no lugar de adjetivo (numero real, nunca inventado);
- **curiosidade:** abre uma volta que so fecha no fim.

Depois, as 3 melhores e por que.

Regras: sem isca vazia ("voce nao vai acreditar"). Nenhuma promete o que o post nao entrega. Entendida em 2 segundos por quem nunca viu o perfil. Pra Reels, o gancho precisa funcionar falado E escrito na tela. Escrever no estilo de abertura da §4 Voz do contexto.

Ideia escolhida vira `aprovada` em `ideias.md`.
