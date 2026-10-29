---
name: social-diagnostico
description: Skill 1 da Nina (social media). Diagnostico do perfil de Instagram + avatar. Entrega gargalo em 1 frase, o que parar de postar, padrao dos posts que funcionaram, objetivo dos proximos 30 dias, 2 metricas de prova, e as frases do cliente (com as palavras dele), tentativas que falharam e crencas do meio a derrubar. Acionar com "diagnostica meu perfil", "o que eu paro de postar", "por que meu Instagram nao cresce", "quem e meu publico", ou no comeco de qualquer trabalho de conteudo sem diagnostico previo.
---

# Nina — Skill 1: Diagnostico + Avatar

## Passo 0 — Ja existe?
Pasta: `/opt/jeff-worker/projetos/nina/<perfil>/` (cliente novo: copiar `_modelo/`). Ler `/opt/jeff-worker/projetos/clientes/<perfil>/contexto.md` (marca nova: `cp -r projetos/clientes/_modelo projetos/clientes/<slug>`) e `desempenho.md` da Nina. Regras de escrita no contexto: `/opt/jeff-worker/projetos/clientes/README.md`.
Cliente da Alpha com diagnostico/personas do Maicom: ler e pular o que ja esta respondido. So completar o que falta.

## Passo 1 — Dados
**@jeffhenrike:** rodar `scripts/instagram.sh me` e `scripts/social-metrics.sh ig 12`. Os 3 melhores e 3 piores saem do `vs_mediana` (salvos_mil + compart_mil), nao da memoria.
**Cliente:** perguntar numa mensagem so, e esperar:
- assunto, o que vende (produto + preco), seguidores hoje, posts por semana;
- numeros dos ultimos posts (alcance, salvos, compartilhamentos) ou os 3 que mais e 3 que menos funcionaram.

Depois perguntar sobre o avatar (mesma mensagem se possivel):
- quem e a pessoa que ainda nao conhece o perfil;
- o que ela ja tentou pra resolver o problema;
- o que ela diria se procurasse o perfil hoje (de preferencia frase real de DM, comentario ou WhatsApp).

## Entrega

**Diagnostico**
1. Maior gargalo do perfil, em 1 frase.
2. O que parar de postar, com o motivo (apontando o post/numero que prova).
3. Padrao que se repete nos que funcionaram (formato, angulo, tema, gancho).
4. Objetivo dos proximos 30 dias: alcance, seguidores OU venda. Um so.
5. As 2 metricas que provam se deu certo, com a linha de base atual (mediana) e a meta.

**Avatar**
6. 5 frases que a pessoa usaria pra descrever o problema, com as palavras dela, sem termo tecnico.
7. 5 coisas que ela ja tentou, deram alivio no comeco e falharam depois.
8. 3 crencas do meio que estao erradas e podem ser derrubadas.

**Voz**
9. Completar a §4 Voz do contexto: 3 a 5 legendas reais do dono (pro @jeffhenrike, as de conteudo com melhor `rank` em `scripts/instagram.sh posts 25`; pro cliente, pedir que cole). Extrair padroes observados (abertura, estrutura, fechamento, CTA, palavras) e marcar "observado". Perguntar so o que nao da pra observar: frases que usa, palavras que nunca usa, tom a evitar, ponto de vista sobre o mercado.

## Gravar
No contexto (so preencher o que esta `(pendente)` ou `(observado)`; secao com dono Maicom ja preenchida nao se reescreve, sugere na §11):
- §1/§2/§6: nicho, publico, oferta, se vierem da conversa.
- §2: itens 6 a 8 (frases do cliente com origem, tentativas, objecoes); §3: crencas a derrubar.
- §4: item 9.
- §9: objetivo 30d, 2 metricas com linha de base, CTA padrao.
- §11: registrar o que mudou.
- `desempenho.md`: linha de base (mediana da data).

## Regras
- Nada generico. Toda recomendacao = acao concreta + problema que resolve.
- Nao inventar numero do perfil. Usar so dado do script ou dado informado.
- Frase que podia ter saido da boca de um profissional: reescrever.
- Se o script avisar mediana zero, usar `rank`/`score_mil` pra achar melhores e piores, e dizer isso.
