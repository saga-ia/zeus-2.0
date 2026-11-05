# Pesquisa @tay.ldantas — BLOQUEADA (08/10/2026)

## O que aconteceu
Tentei rodar o fluxo completo da skill `social-perfil-pesquisa` (coleta de posts via
`social-posts.sh`, coleta+transcrição+classificação de Reels via `creator-lab.sh analyze`,
e identificação de autor do post avulso via `apify.sh`).

Todas as chamadas que disparam coleta real retornaram o mesmo erro:

```
{"error":{"type":"platform-feature-disabled","message":"Monthly usage hard limit exceeded"}}
```

Confirmado via `apify.sh whoami`: a conta Apify do servidor está no plano **FREE**
(US$ 5/mês de crédito, `maxMonthlyUsageUsd: 5`) e já consumiu o teto do mês de outubro/2026.
Não é um problema de "run grande demais" ou de orçamento desta tarefa (o teto de ~US$1 da
skill nem chegou a ser testado): a conta inteira está sem crédito pra qualquer actor
(`instagram-scraper`, `instagram-profile-scraper`, `instagram-reel-scraper`).

Não existia nenhuma coleta anterior aproveitável para @tay.ldantas: as pastas
`projetos/nina/tay.ldantas/coleta/` e `/tmp/social-posts/tay.ldantas-20261008/` já tinham
`raw.json` com o mesmo erro (ou "actor-memory-limit-exceeded", sintoma do mesmo teto).
Runs do Creator Lab de hoje para outros perfis (paidotrafego, pedrosobral, luizenderle,
leandroferrari) também falharam pelo mesmo motivo; só o de @tay.ldantas ficou "ready" com 0 posts.

## Por que não seguí sem os dados
Regra N1 da Nina: número real ou nenhum. Sem a coleta (posts, plays, curtidas, transcrição
dos Reels), não dá pra montar mediana, vs_mediana, ranking de gancho/estrutura/CTA nem
selecionar peça exemplar de verdade — qualquer coisa que eu escrevesse ali seria invenção.
Preferi parar e avisar em vez de entregar um relatório com números fabricados.

## O que falta pra destravar
Uma destas, decisão de negócio (não é algo que eu resolvo sozinha):
1. Fazer upgrade do plano Apify (adiciona crédito mensal) — custo recorrente.
2. Esperar o reset do ciclo de cobrança do mês (não sei a data exata do reset deste
   workspace Apify; não tenho essa informação e não vou inventar).
3. Rodar a pesquisa usando outro mecanismo de coleta que não dependa de Apify (não
   identifiquei nenhum disponível no servidor pra isto).

## O que ficou pendente
- Coleta de 100 posts do @tay.ldantas (`social-posts.sh`).
- `creator-lab.sh analyze tay.ldantas 25 pt` (transcrição + classificação de Reels).
- `reels-visual.py` nos 3 melhores/3 piores Reels por vs_mediana.
- `relatorio.md`, `referencias.md`, `ideias.md` do @tay.ldantas (não criados: sem dado real).

Assim que o crédito Apify for destravado, o fluxo pode rodar do zero seguindo a skill
`social-perfil-pesquisa` normalmente.
