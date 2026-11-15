# Desempenho — @jeffhenrike

Fonte: scripts/social-metrics.sh ig 12. Mediana, por mil alcançados.

## Linha de base — 06/10/2026 (posts de 14/09 a 05/10)
- n = 12 | mediana alcance 783 | mediana salvos/mil 0 | compart/mil 0 | seguidores/mil 0
- Destaques: carrossel pessoal 17/09 (2.765 alcance, 3,25 salvos/mil, 27,85 compart/mil); carrossel 30/09 "Sala cheia não paga conta" (953, 3,15 compart/mil, único com CTA de palavra-chave); imagem 04/10 "Se a oferta vai no fim" (2.243 alcance, maior de conteúdo).
- Leitura inicial: alcance baixo pro tamanho da base e interação quase zero nos posts de conteúdo. Diagnóstico completo pendente (social-diagnostico).
- seguidores/mil veio 0 em todos os posts de feed e não existe pra Reels: confirmar se a API está entregando "follows" antes de usar como métrica.

## Decisões da semana

## Revisão — 19/10/2026 (últimos 12 posts, 16/10 a 19/10/2026)
- n = 12 | mediana alcance 334,5 | mediana salvos/mil 0 | mediana compart/mil 0 | seguidores/mil sem dado
- Aviso do script: mediana zero em salvos/mil e compart/mil → decisão por rank/score_mil, não por vs_mediana.
- Sem decisões da semana anterior registradas pra conferir placar (linha de base de 06/10 não tinha DOBRAR/TESTAR formal).

**PARAR:** carrossel didático tipo lista ("passo a passo", "X perguntas") — 5 carrosséis da semana, alcance entre 204 e 248 (todos abaixo da mediana de 334,5) e 0 salvos/mil, 0 compart/mil em todos, sem excessão. Formato devia gerar salvamento (é lista) e não gerou nenhum.
  - Deo2kzaiuVn "Como escolher nicho em 5 perguntas" (244, 0/0)
  - Dem68VfDoI0 "6 perguntas que qualificam lead" (204, 0/0)
  - DemR1iZCiXa "7 passos pra vender" (248, 0/0)
  - DekV9g4lGPE "Lead não esfria" (240, 0/0)
  - DepfngiDCOr "Audiência grande com oferta fraca" (226, 0/0)

**MANTER:** imagem única padrão (frase de contraste em CAIXA ALTA + corpo curto, voz já documentada em contexto.md) — maioria acima da mediana de alcance, sem overlap com o alcance dos carrosséis.
  - Deohv85FEPq "Você não precisa de mais leads" (1046, rank 2, 2 salvos)
  - DepK8rZipQM "Dobrar a produção..." (846)
  - Del89JQiuux "Desconto não é estratégia" (806)
  - Deove-fClt_ "Público largo parece segurança" (730)

**DOBRAR:** formato imagem única pelo alcance — padrão repete em 6 de 7 posts de imagem acima da mediana geral (334,5), enquanto nenhum dos 5 carrosséis passou de 248. Gap consistente, sem overlap entre os dois formatos. Reduzir carrossel listicle, concentrar em imagem.

**TESTAR:** quote-card puro (frase de impacto isolada, caixa alta, sem corpo longo) — DerGi0_CvAE "AUTORIDADE NÃO É FALAR MAIS ALTO. É SER O ÚNICO QUE RESOLVE." teve score_mil 24,3 (2 salvos + 5 compart em só 288 de alcance), 12x o segundo colocado (1,91). N=1 pra esse subformato — não é base pra DOBRAR ainda, é hipótese. Teste: repetir em mais 2 posts na semana que vem. Métrica que decide: salvos+compart/mil ≥ 5 confirma; abaixo disso, descarta como ponto fora da curva.

(nenhuma decisão anterior pendente de placar)

## Revisão — 26/10/2026 (últimos 12 posts, 23/10 a 25/10/2026)
- n = 12 | mediana alcance 1086,5 | mediana salvos/mil 0 | mediana compart/mil 0 | seguidores/mil sem dado.
- Aviso do script: mediana zero em salvos/mil e compart/mil → decisão por rank/score_mil e por mediana de alcance por formato.
- Mediana de alcance por formato: imagem 1212 (6 posts) vs carrossel 776 (6 posts). Amostra pequena por subformato (6 cada) — leitura direcional, não definitiva.

**Placar da semana passada (decisões de 19/10):**
- PARAR carrossel listicle → NÃO FOI SEGUIDO. 6 dos 12 posts da semana ainda são carrossel tipo lista ("4 sinais...", "5 sinais...", "7 decisões...", "quem não tem critério..."). Resultado misto: 2 fortes (DeiH "QUEM NÃO TEM CRITÉRIO DE ENTRADA..." 2.110 alcance + 1 salvo, rank 2; "POSICIONAMENTO NÃO É FRASE BONITA" 1.664) e 3 fracos (359, 260, 227 — todos abaixo da mediana geral de 1086,5). Mediana do formato (776) segue abaixo da imagem (1212): mantenho o PARAR, mas registro que a execução não aplicou a decisão da semana passada.
- MANTER imagem única padrão → CONFIRMADO. Mediana 1212 (acima da geral) e o post #1 da semana por score_mil: "Preço não é só número, é mensagem" (1.444 alcance, 1 salvo, 0,69/mil, rank 1).
- DOBRAR imagem única → CONFIRMADO de novo (2ª semana seguida com imagem > carrossel em alcance mediano), mas na prática a proporção ficou 50/50 (6 imagem, 6 carrossel) — não dobrou de fato.
- TESTAR quote-card puro (2x) → SEM DADO. Nenhum dos 12 posts da janela é quote-card puro (frase única, sem corpo). O teste não aparece executado nesse recorte — não confirma nem descarta. Repetir essa semana.

**PARAR:** carrossel listicle ("X sinais", "X decisões", "X perguntas") — mediana de alcance do formato (776) segue abaixo da imagem (1212), e os 3 piores posts da semana são desse formato: "7 DECISÕES PRA SUA OFERTA PARAR DE SER COMPARADA PELO PREÇO" (227, rank 9), "SE VOCÊ PRECISA DAR DESCONTO PRA FECHAR" (260, rank 8), "4 SINAIS DE QUE O NEGÓCIO SÓ VENDE COM VOCÊ" (359, rank 3 mas alcance baixo). Repito a decisão de 19/10, agora com 2ª semana de dado, e registro que não foi aplicada na prática.

**MANTER:** imagem única padrão (frase de contraste + corpo curto) — mediana de alcance 1212, acima da geral. "Preço não é só número, é mensagem" (1.444, 1 salvo, rank 1) e "Post que todo mundo concorda é post que ninguém guarda" (1.497, rank 6) seguem o padrão.

**DOBRAR:** imagem única pelo alcance — 2ª semana seguida com imagem acima de carrossel em mediana (1212 vs 776) e segurando o post #1 da semana. Padrão repete, mas a execução não aumentou a proporção real (ainda 50/50). Pedir que o calendário saia com mais imagem que carrossel de propósito.

**TESTAR:** quote-card puro (2x, retomada do teste de 19/10 que não rodou) — frase única em caixa alta, sem corpo longo, no estilo que gerou o melhor score_mil isolado em 19/10 (DerGi0_CvAE, 24,3/mil). Métrica que decide: salvos+compart/mil ≥ 5 confirma; abaixo disso, descarta.

## Revisão — 02/11/2026 (últimos 12 posts, 29/10 a 01/11/2026)
- n = 12 | mediana alcance 512 | mediana salvos/mil 0 | mediana compart/mil 0 | seguidores/mil sem dado.
- Aviso do script: mediana zero em salvos/mil e compart/mil → decisão por rank/score_mil e por mediana de alcance por formato.
- Mediana de alcance por formato: imagem 605,5 (8 posts: 390, 411, 540, 555, 656, 683, 728, 2014) vs carrossel 234,5 (4 posts: 225, 229, 240, 484). Cadência real da semana: 3 posts/dia, sempre 2 imagem (10h01 e 14h01) + 1 carrossel (17h01), 4 dias (29/10 a 01/11).
- Mediana geral caiu de 1086,5 (26/10) pra 512 — queda de ~53%. Sem dado suficiente pra apontar causa única (amostra de 4 dias), registrar e observar na próxima revisão.

**Placar da semana passada (decisões de 26/10):**
- PARAR carrossel listicle → PARCIALMENTE CONFIRMADO. Carrossel segue publicado todo dia (17h01) e mediana do formato (234,5) continua muito abaixo da imagem (605,5), 3ª semana seguida confirmando o alcance fraco. MAS o carrossel "7 PASSOS PRA MONTAR 90 DIAS DE CONTEÚDO EM UMA TARDE" (DfF0VXQFP3Y, listicle puro) foi o post de MAIOR score_mil da semana (4,37/mil, 1 compartilhamento em 229 de alcance) — único post com engajamento real. Decisão por alcance: mantém PARAR. Por engajamento: esse post específico contraria. Registrar e não usar como base pra reverter (n=1).
- MANTER imagem única padrão → CONFIRMADO. Mediana 605,5, acima da geral (512) e bem acima do carrossel (234,5).
- DOBRAR imagem única → CONFIRMADO NUMERICAMENTE pela 1ª vez. Proporção real da semana ficou 8 imagem : 4 carrossel = exatos 2:1 (nas duas semanas anteriores era 50/50 e não dobrava na prática).
- TESTAR quote-card puro (2x) → NÃO EXECUTADO pela 3ª semana consecutiva (19/10, 26/10, 02/11). Nenhum dos 12 posts é quote-card puro (frase isolada sem corpo) — todos os temas de imagem têm corpo de legenda longo. Teste descartado nesse formato: ou a orientação não está chegando em quem produz, ou o formato não está sendo priorizado. Substituir por um teste novo nesta revisão (ver TESTAR abaixo).

**PARAR:** carrossel no horário fixo de 17h01 — 3ª semana seguida com mediana de alcance (234,5) menos da metade da imagem (605,5). Os 4 carrosséis da semana: "QUEM FALA PRO DONO E QUEM FALA PRO CURIOSO" (484), "4 ERROS QUE ENCHEM A SALA E NÃO VENDEM NADA" (225), "AUTORIDADE NÃO SE DECLARA. SE PROVA." (240), "7 PASSOS PRA MONTAR 90 DIAS DE CONTEÚDO EM UMA TARDE" (229, mas com o melhor score_mil da semana). Reduzir frequência do slot, não eliminar de vez — o único post com compartilhamento real da semana saiu dele.

**MANTER:** imagem no horário da manhã (10h01) — consistente e acima da mediana geral nas 4 ocorrências: "Contar quantas horas..." (555), "Todo mundo quer o negócio que roda sem o dono..." (728), "A pilha de tarefa é anestésico..." (656), "Quando o evento não enche, a culpa costuma cair no anúncio..." (683, rank 2, 1 salvo, 1,46/mil — melhor post de imagem em engajamento).

**DOBRAR:** nenhum formato nessa revisão — imagem já chegou a 2:1 sobre carrossel (meta da semana passada cumprida). Em vez de dobrar mais, observar se a proporção se mantém a próxima semana antes de forçar mais.

**TESTAR:** tema prova social / indicação (2x, substitui o teste de quote-card que não rodou 3 semanas) — hipótese a partir do post "Vinte seguidores engajados, três clientes do mesmo círculo e indicação do mesmo grupo..." (DfIEfYVitXl, 30/10 14h01, alcance 2.014 — 4x a mediana geral e o maior da semana, mesmo com score_mil 0 e n=1). Repetir o ângulo de prova social por indicação em mais 2 posts de imagem na semana, em dias não consecutivos. Métrica que decide: alcance ≥ 1.200 confirma (mediana de imagem x2); abaixo disso, trata como ponto fora da curva e descarta.

## Revisão — 09/11/2026 (últimos 12 posts, 04/11 a 07/11/2026)
- n = 12 | mediana alcance 337 | mediana salvos/mil 0 | mediana compart/mil 0 | seguidores/mil sem dado.
- Aviso do script: mediana zero em salvos/mil e compart/mil → decisão por rank/score_mil e por mediana de alcance por formato.
- Janela de só 4 dias (04/11 a 07/11) pra 12 posts = 3 posts/dia de média, cadência mais apertada que nas revisões anteriores (que cobriam 4 a 7 dias). Mediana geral de alcance caiu pela 3ª revisão seguida: 1.086,5 (26/10) → 512 (02/11) → 337 (09/11). Queda de ~34% essa semana, ~69% em 3 semanas. Hipótese: aumento de frequência pode estar saturando o mesmo público. Registrar e observar se a cadência recua.
- Mediana de alcance por formato: imagem 331 (7 posts), carrossel 270 (4 posts, média dos 2 do meio), vídeo/reel n=1 (500, sem base de comparação).

**Placar da semana passada (decisões de 02/11):**
- PARAR carrossel no horário fixo 17h01 (reduzir, não eliminar) → NÃO EXECUTADO, 2ª semana seguida (e 4ª desde 19/10 que a reorientação de carrossel não é seguida na prática). Carrossel saiu nos 4 dias da janela, sempre por volta de 17h: 04/11 (343), 05/11 (196), 06/11 (197), 07/11 (350). Mediana do formato (270) segue abaixo da imagem (331), mas a diferença está encolhendo semana a semana (776→605,5→331 vs 234,5→270 no carrossel). Mantenho o registro de alcance fraco, mas chamo atenção pro ponto novo abaixo.
- MANTER imagem única padrão → CONFIRMADO. Mediana 331 (bate com a mediana geral) e os 2 maiores alcances absolutos da semana são imagem: "Proposta de doze páginas, seis pacotes e quatro bônus..." (903) e "Tem empresário que acha que o problema é tráfego..." (709).
- DOBRAR imagem já cumprido (2:1) → PARCIALMENTE MANTIDO. Proporção da semana ficou 7 imagem : 4 carrossel : 1 vídeo ≈ 1,75:1, perto do 2:1 da semana passada, não caiu pra 50/50 de novo.
- TESTAR prova social/indicação (2x) → NÃO EXECUTADO. Nenhum dos 12 posts tem tema de indicação/círculo/prova social. 2ª tentativa de teste seguida (depois do quote-card, que não rodou em 3 semanas) que não chega a sair do papel. Isso já é padrão de execução, não de estratégia: registrar como ponto de atenção operacional pro Jeff, e não propor um 3º teste novo até entender por que os testes não chegam a quem publica.

**Achado novo (não estava no placar):** o post de melhor score_mil da semana foi de novo um carrossel, 2ª semana seguida — "ELE CORTOU 60% DOS CLIENTES E DOBROU O LUCRO" (DfhBW..., 350 de alcance, 1 salvo, 2,86/mil, rank 1), igual à semana passada quando "7 PASSOS PRA MONTAR 90 DIAS DE CONTEÚDO" (4,37/mil) também foi carrossel e também o melhor score da semana. Os dois são carrossel de "caso com número" (transformação/resultado), não listicle didático genérico. Amostra ainda pequena (n=2, em 2 semanas), mas é repetição do mesmo subformato vencendo em engajamento apesar do alcance fraco do carrossel em geral — vale testar de propósito, não só observar.

**PARAR:** carrossel didático genérico ("4 motivos...", "consistência não é...") fora do formato caso/transformação — alcance mediano do formato (270) segue abaixo da imagem (331) pela 4ª semana, e os 2 carrosséis sem caso numérico da semana ("4 MOTIVOS PRO SEU CONTEÚDO ATRAIR CONCORRENTE" 197, "CONSISTÊNCIA NÃO É POSTAR SEMPRE" 196) ficaram entre os piores alcances da semana, sem nenhum salvo ou compartilhamento.

**MANTER:** imagem como motor de alcance — mediana 331, praticamente a mediana geral, e segura os 2 maiores alcances absolutos da semana (903, 709).

**DOBRAR:** carrossel "caso de transformação com número" (ex: "ele cortou 60% dos clientes e dobrou o lucro") — 2ª semana seguida que esse subformato específico (diferente do listicle didático) entrega o melhor score_mil da semana. Ainda é n=2, então trato como padrão em formação, não confirmado: dobrar a frequência desse subformato especificamente, não do carrossel em geral.

**TESTAR:** carrossel caso/transformação com número, 2x na semana, em dias fixos e marcados no calendário (pra resolver o problema de execução que vem se repetindo) — hipótese: se 2 semanas seguidas um caso numérico ganhou o score_mil da semana, um 3º e 4º caso confirmam o padrão. Métrica que decide: score_mil (salvos+compart por mil) ≥ 2 em pelo menos 1 dos 2 confirma; abaixo disso nos dois, descarta. Os testes de quote-card e prova social/indicação ficam descartados por falta de execução, não por resultado — não entram de novo até ter um motivo pra crer que vão rodar.
