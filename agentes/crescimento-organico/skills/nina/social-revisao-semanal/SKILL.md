---
name: social-revisao-semanal
description: Skill 5 da Nina (social media). Revisao semanal de conteudo guiada por numero - PARAR, MANTER, DOBRAR, TESTAR - usando mediana e metricas por mil alcancados (salvos, compartilhamentos, seguidores), e reescreve os proximos 7 dias com tema, gancho, formato e a metrica que vai julgar cada post. Acionar com "revisao da semana", "como foram os posts", "o que funcionou essa semana", "numeros da semana", ou pelo cron semanal.
---

# Nina — Skill 5: Revisao semanal

## Dados
- **@jeffhenrike:** `scripts/social-metrics.sh ig 12` (ou o numero de posts da semana + historico pra mediana).
- **Cliente:** pedir alcance, salvos, compartilhamentos e seguidores de cada post da semana. Montar CSV em /tmp e rodar `social-metrics.sh csv <arquivo>`.

Pasta: `/opt/jeff-worker/projetos/nina/<perfil>/`. Ler `desempenho.md` (decisoes da semana passada) e `calendario.md`.

Nunca calcular de cabeca. Se o script avisar "mediana zero", julgar por `rank`/`score_mil` e dizer isso. O script devolve `/mil`, a mediana e `vs_mediana` (1.0 = na mediana, 2.0 = o dobro).

## Entrega
**PARAR:** o que nao merece mais esforco (abaixo da mediana nas metricas da propria funcao, 2 semanas seguidas ou mais).
**MANTER:** o que esta entregando (perto ou acima da mediana).
**DOBRAR:** o que merece o dobro de frequencia (claramente acima da mediana, ex: 1.5x ou mais, num padrao que se repete e nao num ponto fora da curva).
**TESTAR:** 1 experimento pra proxima semana, com hipotese e a metrica que decide.

Cada bloco cita o post e o numero que justificam.

**Placar da semana passada:** pra cada decisao gravada em `desempenho.md` (DOBRAR, TESTAR...), dizer se o numero confirmou ou nao. Nao confirmou: descartar e dizer isso.

Depois: **proximos 7 dias** em tabela: dia, tema, gancho, formato, funcao, metrica que vai julgar.

## Gravar
- `desempenho.md`: semana (datas BRT), n, mediana, blocos PARAR/MANTER/DOBRAR/TESTAR, placar.
- `calendario.md`: proximos 7 dias.

## Regras
- Mediana, nunca media. Por mil alcancados, nunca absoluto.
- Nao defender estrategia so porque foi sugerida na semana passada. Numero disse que nao funcionou: descartar e falar isso.
- Amostra pequena (menos de 5 posts): avisar que a conclusao e fraca.
- Comparar funcao com funcao: post de conversao nao e julgado por alcance.
- Envio por WhatsApp: sem travessao, sem tabela markdown (usar lista), horario em BRT.
