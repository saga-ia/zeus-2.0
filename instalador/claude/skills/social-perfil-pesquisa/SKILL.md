---
name: social-perfil-pesquisa
description: Skill da Nina (social media). Analise completa de um perfil publico do Instagram (concorrente, referencia ou o proprio) - Reels transcritos, classificados (Creator Lab, Groq, Jev) e assistidos (quadros do gancho e do miolo, ritmo de cortes, fala) E posts de imagem e carrossel (social-posts.sh com leitura das laminas e do visual: pessoas, cena e contexto da foto, intencao do post, foto x tipografia, texto na capa) - gancho, estrutura, CTA, tema, formato e visual cruzados com o desempenho por mediana. Entrega o que funciona naquele perfil, pecas exemplares e estruturas pro swipe file. Acionar com "analisa o perfil de @x", "analisa os reels de", "o que funciona no perfil de", "pesquisa o concorrente", "estuda esse criador", "modela o perfil", "quais ganchos ele usa", "analisa meus posts".
---

# Nina — Pesquisa de perfil (Reels + posts + carrosseis)

Pastas: Nina `/opt/jeff-worker/projetos/nina/<perfil_cliente>/`, contexto `/opt/jeff-worker/projetos/clientes/<perfil_cliente>/contexto.md`.
Duas ferramentas, uma analise:

| Conteudo | Ferramenta | O que entra |
|---|---|---|
| Imagem, carrossel (e capa/legenda de Reels) | `/opt/jeff-worker/scripts/social-posts.sh <perfil> [30] [pasta] [3]` | legenda, curtidas, comentarios, data, ate 3 laminas baixadas em `<pasta>/img/` pra eu LER |
| Reels com fala | `/opt/jeff-worker/scripts/creator-lab.sh analyze <perfil> [20] pt 1 2` | transcricao (Groq) + gancho/estrutura/CTA/tema (Jev) + plays |
| Reels: o VIDEO (assistir) | `/opt/jeff-worker/scripts/reels-visual.py <run_id> [20]` (rodar logo depois do analyze: o link do video expira em dias; custo zero) | folha por Reel com 4 quadros do gancho (0,3 a 3 s) + 6 do miolo, cortes por minuto, 1o corte, palavras por minuto, abertura falada; `resumo.md` com plays vs mediana por ritmo, duracao, fala e estrutura |

## Antes
1. Confirmar perfil, tamanho e teto: **primeira vez = 30 posts + piloto de 20 Reels (teto Apify US$ 1)**. Lote maior so com ok explicito.
2. `creator-lab.sh check`:
   - apify + groq + jev ok: Reels completos pelo Creator Lab.
   - groq ok, jev faltando: rodar o Creator Lab mesmo assim; se travar na classificacao, `export` e **eu classifico** as transcricoes (categorias abaixo).
   - groq faltando: Reels entram so pela capa + legenda via `social-posts.sh` (analise fraca: dizer isso na entrega).
3. Ja existe analise recente do perfil (`creator-lab.sh runs`, `/tmp/social-posts/<perfil>-*`)? Reaproveitar.
4. WhatsApp: ack com ETA ("coletando, te mando em ~10 min"), marcar msg como processada, seguir em rodadas. Posts levam ~1 min; Reels ~5-10 min.

## Coletar
```bash
/opt/jeff-worker/scripts/social-posts.sh <perfil> 30 /tmp/social-posts/<perfil>-$(date +%Y%m%d) 3
/opt/jeff-worker/scripts/creator-lab.sh analyze <perfil> 20 pt 1 2     # se groq ok
/opt/jeff-worker/scripts/creator-lab.sh show <run_id>                  # acompanhar; travou: resume (nunca analyze de novo)
/opt/jeff-worker/scripts/creator-lab.sh export <run_id> /tmp/cl-<perfil>.json
/opt/jeff-worker/scripts/reels-visual.py <run_id> 20                   # assistir: quadros + ritmo + fala (~1-2 min p/ 10 Reels)
```

## Assistir os Reels (obrigatorio, nao so transcricao)
Abra com Read `projetos/nina/_reels/<perfil>-<run8>/resumo.md` e as folhas: no minimo os 3 Reels com maior e os 3 com menor `vs_mediana` (ate 20: todos). Pra cada um, anote olhando os quadros + a abertura falada:
- **formato**: selfie/fala pra camera, vlog (rotina, viagem, bastidor), palco/evento, entrevista/podcast, tela gravada, b-roll com narracao, tutorial com maos, trend/meme
- **gancho visual (0 a 3 s)**: rosto ja no 1o quadro?, movimento/cena forte, texto na tela (o que diz), legenda dinamica, primeiro corte em quantos segundos
- **cenario e pessoas**: onde, quem aparece, luz e qualidade (imagem lavada/tremida pesa)
- **texto na tela no miolo**: fixo, legenda palavra a palavra, nenhum
- **coerencia**: o que se ve bate com o que e dito no gancho?
Cruze com plays (vs_mediana) e com os rotulos do Jev. O achado bom junta os 3: o que diz (Jev), como mostra (quadros) e o ritmo (cortes/ppm). Ex. validado 07/10/2026 no @jeffhenrike: vlog com rosto e cena real 4,5x; tela de computador filmada sem rosto 0,47x.

## Classificar (mesmas categorias pra tudo, pra comparar formatos)
- **Gancho** (Reels: primeiros segundos falados; carrossel: **a CAPA**, que pode ser diferente da 1a linha da legenda; imagem: o texto da arte): contradicao, curiosidade, resultado, erro, reconhecimento, historia, direto.
- **Estrutura** (Reels: roteiro; carrossel: sequencia das laminas; imagem/legenda: corpo do texto): passos, historia, problema-solucao, explicacao, comparacao, opiniao, pergunta-resposta.
- **CTA** (Reels: falado; posts: fim da legenda e ultima lamina): nenhum, seguir, salvar/compartilhar, comentar, palavra-chave/DM, link, comprar.
- **Tema**: negocios, dinheiro, marketing, mentalidade, habitos, relacionamentos, saude, tecnologia, pessoal, outro.
- **Formato**: reels, carrossel, imagem. Reels: tambem o formato de video lido nos quadros (secao Assistir).
- **Visual** (lendo a capa/1a lamina; Reels: a capa/thumbnail):
  - pessoas: ninguem / so o dono / dono + 1 (quem: cliente, parceiro, autoridade, familia) / grupo ou plateia / so outras pessoas
  - cena (o contexto da foto, lido na imagem + legenda): palco ou evento / bastidor de trabalho / com cliente ou aluno (prova) / com parceiro ou autoridade (associacao) / pessoal (familia, viagem, lazer, data especial) / estudio ou retrato posado / produto, tela ou resultado
  - base: foto real / so tipografia / print (tela, conversa, numero) / ilustracao ou meme
  - texto na arte: nenhum / curto (ate 8 palavras) / bloco (mais que isso)
  - fundo: escuro / claro / colorido / foto
  - padrao visual do perfil: a capa segue a identidade das outras ou foge dela
- **Intencao do post** (o que ele quer causar, lendo imagem + legenda juntas): conteudo (ensina/opina) / autoridade (palco, bastidor, numero) / prova social (cliente, resultado, depoimento) / relacionamento (pessoal, familia, agradecimento, homenagem) / oferta (vende, convida, lanca) / institucional (aviso, data, parceria).

**Comparar dentro da mesma intencao.** Post pessoal (familia, declaracao, viagem) costuma ter muito mais curtida e quase nunca vira venda: nunca concluir "capa com pessoa rende mais" misturando pessoal com conteudo. Primeiro a mediana por intencao; depois, dentro de cada intencao com n >= 5, a mediana por eixo visual (ex: "dentro de conteudo: capa com o dono no palco 1,9x, so tipografia 0,8x, n=11"). Pessoas e cena so viram conclusao quando o contexto e o mesmo.

Export do Creator Lab: `.posts[]` com `plays`, `views`, `likes`, `comments`, `duration`, `status` (`complete` ou `no_speech`), `transcript` e `analysis.labels.{topic, opening, mechanism, structure, evidence, cta}` cada um com `value` e `confidence`. Rotulo com confidence < 0.5 ou `unclear`: ler a transcricao e classificar eu mesma (dizer quantos corrigi). Validado em 06/10/2026: 10 Reels do @jeffhenrike em 44 s, Apify US$ 0,009.

Ler as laminas com Read em `<pasta>/img/<shortcode>-N.jpg`. Carrossel: 1a lamina = gancho, 2a-3a = como desenvolve (precisa da sequencia inteira? rodar o script com mais laminas, ex: `... 30 <pasta> 10`). Jev em perfil brasileiro: conferir 5-10 rotulos lendo a transcricao e corrigir.

## Comparar
- Reels: mediana de **plays** por rotulo (`creator-lab.sh metrics <run> structure|mechanism|cta|topic`).
- Posts: mediana de **curtidas** e **comentarios** por rotulo e por formato (`posts.json` traz mediana, `por_tipo`, `vs_mediana`, `rank`).
- Nunca misturar plays (Reels) com curtidas (posts) numa mesma escala; comparar cada formato com ele mesmo e so depois entre formatos via `vs_mediana`.
- Excluir posts com menos de 3 dias e Reels com menos de 7. Grupo com n < 5 nao vira conclusao.
- `avisos` do script (curtidas ocultas, amostra pequena, post patrocinado) entram na entrega.
- Perfil proprio (@jeffhenrike): os numeros reais de alcance, salvos e compartilhamentos vem do `social-metrics.sh` (API oficial); `social-posts.sh` complementa com as laminas.

## Entrega
1. **Amostra:** quantos Reels e posts, periodo, mediana de cada formato, o que ficou de fora e por que.
2. **Mix do perfil e o que entrega dentro de cada intencao** (com n e vs_mediana): quanto e conteudo, autoridade, prova, pessoal e oferta; e, dentro de cada um, qual formato, cena e visual rendem mais.
3. **3 a 5 achados** "X teve mediana Y (n=Z), N vezes a mediana do formato", cada um com seu limite. Sao padroes pra testar, nao causa.
4. **Pecas exemplares** (3 a 5, misturando formatos e intencoes): intencao, gancho literal (fala ou capa), cena e pessoas da capa, esqueleto (partes do roteiro ou sequencia de laminas), CTA, link.
5. **Como adaptar pra marca do cliente:** 3 ideias com a estrutura/formato vencedor + experiencia real (contexto §7), na voz da §4. Nunca copiar texto nem arte.
6. **Custo** da coleta (Creator Lab `show` mostra `costs`; posts: centavos de Apify).

## Gravar
- `referencias.md`: cada peca exemplar no formato do swipe file (link, formato, tema, gancho, estrutura, por que prende, como adaptar, prova = numero e n).
- `ideias.md`: as 3 ideias, status `nova`, origem "perfil-pesquisa @perfil".
- Perfil proprio: resumo em `desempenho.md`.

## Regras
- Mediana, nunca media. Engajamento e pista, nao prova: copiar o gancho nao repete o resultado.
- So perfil publico, sem login. Nunca expor o Creator Lab fora do 127.0.0.1.
- Imagens baixadas sao pra analise interna: nao republicar nem mandar pra fora.
- Fim do lote: `creator-lab.sh stop`.
