# Análise de perfil — @leandroferrari (swipe file para @jeffhenrike)

Data da tentativa: 08/10/2026, Nina.

## Status: coleta bloqueada antes de começar

Tentei coletar posts (`social-posts.sh leandroferrari 300 ...`) e Reels (`creator-lab.sh analyze leandroferrari 20 pt`). Nenhuma das duas rodou. Erro da API Apify:

```
"Monthly usage hard limit exceeded"
disabledReasonType: MONTHLY_TOTAL_USAGE_HARD_LIMIT_EXCEEDED
```

Confirmado em `apify.sh whoami`: a conta (plano FREE, US$ 5/mês de crédito) está com **todas** as plataformas desligadas para o mês — ACTORS, STORAGE, PROXY, SCHEDULER, WEBHOOKS. Não é o teto de US$ 1 desta tarefa: é o limite mensal da conta inteira, já esgotado por outras coletas feitas antes (rodei `creator-lab.sh runs` e vi tentativas no mesmo dia pra @paidotrafego, @pedrosobral, @luizenderle, @tay.ldantas, @lucureau — a maioria falhou pelo mesmo motivo).

Não existe nenhum dado em cache de @leandroferrari (busquei em `/tmp/social-posts/`, `/tmp/cl-*.json` e nos runs do Creator Lab): é a primeira tentativa de coleta desse perfil, e ela não produziu nenhum post nem Reel.

## O que não fiz (e por quê)

Zero dados coletados = zero análise possível sem violar a regra N1 (número real ou nenhum). Não escrevi:
- mediana por formato (não tem amostra),
- vs_mediana por estrutura/gancho/CTA/visual,
- peças exemplares (não vi nenhuma lâmina, capa ou transcrição real de @leandroferrari),
- `referencias.md` e `ideias.md` ficam como "(pendente)" — não inventei 3 ideias nem peças exemplares porque não vêm de nenhum conteúdo real observado.

## Caminhos pra resolver

1. **Esperar o próximo ciclo mensal da Apify** (reseta o crédito de US$ 5) e refazer a coleta.
2. **Upgrade do plano Apify** (pago) pra liberar mais crédito ainda neste mês — decisão do Jeff/Vinicius, envolve custo recorrente.
3. Se Jeff tiver prints/capturas manuais de posts e Reels de @leandroferrari, posso classificar por gancho/estrutura/CTA/visual a partir disso (sem os números de desempenho, que exigem a API).

## Arquivos

- `/opt/jeff-worker/projetos/nina/leandroferrari/referencias.md` — pendente (sem dado coletado)
- `/opt/jeff-worker/projetos/nina/leandroferrari/ideias.md` — pendente (sem dado coletado)
- `/opt/jeff-worker/projetos/nina/leandroferrari/analise-perfil.md` — este arquivo
