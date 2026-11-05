# Estúdio de vídeo (Remotion) da aba Edição de Vídeo

Usado pelo agente "Edição de Vídeo" da Central (`/opt/jeff-apps/jeff-central`, agente `editor-video`).
Remotion 4.0.534 e React ficam instalados AQUI (node_modules local). Nunca instalar global.

**O render não roda direto no servidor:** ele é Debian 11 (glibc 2.31) e o compositor do Remotion exige glibc 2.35.
Tudo passa pela imagem Docker `jeff-remotion:1` (Debian 12, `/opt/jeff-apps/jeff-video/docker/Dockerfile`), com esta
pasta montada em `/estudio`. Use sempre a ferramenta `/opt/jeff-apps/jeff-central/tools/video` (rode `video ajuda`).

## Como está organizado
- `lib/edicao.tsx`: a edição padrão, testada (clipes em sequência, legenda palavra por palavra, destaques, impactos,
  zoom alternado e mergulhos, gancho, CTA, tarja que desfoca legenda antiga, barra de progresso, trilha).
  **Não se reescreve por vídeo.** Melhorou aqui, melhora pra todo vídeo novo.
- `projetos/_modelo/`: o que cada vídeo novo recebe. `props.json` (toda a configuração), `Root.tsx` (não mexer),
  `Extras.tsx` (camadas exclusivas daquele vídeo, se o props não resolver).
- `public/<slug>/video1.mp4, video2.mp4...`: as fontes (cópia leve H.264 30 fps quando o original é 4K, HEVC, girado
  ou com fps variável). `projetos/<slug>/fontes.json` liga cada uma ao arquivo original.
- `saidas/`: renders e prévias. `backups/`: modelo antigo (v1, de antes de 05/11/2026).

## Fluxo (rodar na pasta da conversa)
1. `video transcrever <arquivo>` em cada vídeo com fala.
2. `video projeto <slug> --video <a> [--video <b>]` e `video montar <slug>`: escreve no props.json os clipes sem pausas
   e respirações (um por frase, com aviso de take repetido) e as palavras pra legenda.
3. Ajustar o `props.json`: escolher e ordenar clipes, destaques, impactos, zooms, gancho, cta, cobrir, foco.
4. `video previa <slug> --tempo 3.2` (PNG) e `video render <slug> --trecho 4-12` (amostra de ~8 s).
5. `video render <slug>` (normaliza o áudio em -14 LUFS e entrega no chat) e `video revisar <mp4>` (QA).

## props.json (referência rápida)
Tempos de `clipes[].de/ate` e `palavras` em segundos do vídeo ORIGINAL; `em` (impactos, zooms) em segundos do FINAL.
- `formato` "9:16" | "4:5" | "1:1" | "16:9" · `fps` 30
- `clipes`: `[{ video, de, ate, zoom?: "auto"|"nenhum"|"entrar"|"sair"|"soco"|número, foco?: [x,y], volume? }]`
- `legenda`: `{ ativa, maxPalavras (2-3), maxCaracteres (22), posicao (0.68 = fração da altura), tamanho (92),
  fonte "Anton"|"Montserrat", cor, corAtiva (cor da palavra falada, null = sem), caixaAlta, contorno, fundo }`
- `destaque`: `{ cor, palavras: ["boi", "big mac"], escala }` (aceita expressão de várias palavras)
- `impactos`: `[{ texto, palavra | em, ocorrencia?, duracao, posicao, cor?, tamanho? }]` (texto grande na tela)
- `zooms`: `[{ palavra | em, duracao, escala }]` (mergulho pontual) · `zoom`: `{ modo "alternado"|"suave"|"nenhum", intensidade }`
- `foco` [x,y] do rosto · `transicao` "corte"|"flash" · `enquadramento` "preencher"|"conter"
- `cobrir` `{ y, altura }` (desfoca a legenda já queimada; acompanha o zoom) · `gancho` `{ texto, duracao, modo "sobre"|"tela", posicao }`
- `cta` `{ texto, duracao, posicao }` · `trilha` `{ arquivo, volume, inicio }` · `barraProgresso` · `volumeVoz`

Regras e boas práticas do Remotion pra Extras.tsx: skills `remotion-best-practices` e `remotion-markup`.
Direção de edição: skills `meia-briefing-de-edicao`, `meia-legendas-e-enquadramento`, `meia-revisao-economia`.
