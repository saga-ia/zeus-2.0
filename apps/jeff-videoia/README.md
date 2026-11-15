# jeff-videoia: editor de vídeo com IA

https://videoia.jefersonhenrike.com · PM2 `jeff-videoia` · porta 3092 em 172.17.0.1 (só o NPM alcança)

Tela no estilo DaVinci/CapCut: mídias e transcrição à esquerda, **prévia ao vivo** no centro, IA e inspetor à direita,
linha do tempo embaixo (V1 vídeo com miniaturas, LEG legenda, TXT textos, A1 voz com forma de onda, A2 trilha).

## Como funciona
- A prévia é o **mesmo componente do render** (`/opt/jeff-apps/jeff-video/estudio/lib/edicao.tsx`) tocando no navegador
  com `@remotion/player`. Mudou o props, a prévia muda na hora; render só no Exportar.
- Cada projeto usa o estúdio compartilhado: `estudio/projetos/vi-<id>/props.json` (a edição) e `estudio/public/vi-<id>/`
  (fontes do render + `prev/` cópia 720p com GOP curto pro navegador). Aqui em `data/projetos/<id>/`: `projeto.json`,
  `originais/`, `ondas/` (100 picos/s), `quadros/` (1 miniatura/s), `versoes/` (antes de cada mudança da IA), `saidas/`.
- Upload (até 2 GB): `tools/video projeto` → cópia de prévia → onda e miniaturas → `tools/video transcrever` (Groq)
  → `tools/video montar` (tira pausas). Um processamento pesado por vez (fila), render idem.
- IA: `claude -p` **sem ferramentas** (sem terminal/arquivos/internet) recebe props + mapa de clipes com texto + cursor e
  devolve o props novo em JSON (`--json-schema`). O servidor valida (clipes dentro da duração) e guarda versão antes.
- Exportar: contêiner `jeff-remotion:1` (glibc do Debian 11 não roda o compositor), progresso lido do log, loudnorm -14 LUFS.

## Login
Mesmo e-mail/senha da Central (`central_users` no worker.db), só **Proprietário e Admin ativos** em `org_members`.
Sessão própria (cookie `vsid`, 30 dias, revalida a cada 5 min). Arquivo: `data/sessoes.json`.

## Mexer na tela
Fonte em `web/` (React + TSX). Depois de editar: `node web/build.js` (gera `public/app.js`). Atalhos: Espaço tocar,
S dividir, Del apagar, Ctrl+Z/Ctrl+Shift+Z, ←/→ quadro (Shift = 1 s), Ctrl+roda zoom na linha do tempo.
