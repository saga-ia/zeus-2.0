# O que muda nesta versão

Fork de [browser-use/video-use](https://github.com/browser-use/video-use) (MIT),
a partir do commit `92c2b34`. Duas frentes: **transcrição local** e
**funcionar no Windows**.

Tudo aqui foi achado **rodando** o pipeline, não lendo o código.

---

## 1. Transcrição local, no lugar da ElevenLabs

O `helpers/transcribe.py` fala com o **faster-whisper** na própria máquina.
Sem chave, sem custo, offline. Ele escreve o **mesmo formato de JSON** que a
Scribe escrevia, então `pack_transcripts.py`, `render.py --build-subtitles` e
`timeline_view.py` não foram tocados. O original ficou ao lado como
`helpers/transcribe_scribe.py`, só pra referência.

**O que se perde:** diarização (todo token vira `speaker_0`) e evento de áudio
(`(laughs)`, `(applause)`). E leva ~1x o tempo real de CPU.

### ☠️ A passada de VAD, que é estrutural

O Whisper **cola os timestamps das palavras**: cada palavra começa exatamente
onde a anterior terminou, mesmo havendo pausa de verdade. Medido num clipe de
25s — **51 de 52 pares voltaram grudados**.

Como o skill corta por silêncio, isso o deixa **sem nenhum candidato a corte**.
E **o texto sai perfeito**, então nada denuncia: é falha com cara de sucesso.

Por isso o `transcribe.py` roda uma **passada de VAD separada** (Silero, que
vem junto com o faster-whisper) e apara cada palavra à fala que ela realmente
ocupa. É `_speech_regions()`. **Não remover achando que é sobra.**

---

## 2. Quatro correções de Windows

1. **Console em UTF-8** — `grade.py`, `pack_transcripts.py`, `render.py`,
   `transcribe_batch.py`. O console do Windows é cp1252 e cada `→` impresso
   estourava `UnicodeEncodeError`. Matou um render no meio.
2. **I/O de arquivo em UTF-8**, em 7 pontos. O `read_text()` aqui assume
   cp1252, então `você` voltava `vocÃª` — e o `master.srt` saía em cp1252 pro
   ffmpeg ler como UTF-8, o que **queima legenda mojibake dentro do vídeo**.
3. **Caminho da legenda com barra normal** no `render.py`. Barra invertida é o
   caractere de escape dentro de um filtergraph do ffmpeg, então caminho real
   do Windows matava o ffmpeg com código de erro e **nenhuma mensagem**.
4. **ffmpeg** instalado por `winget install Gyan.FFmpeg --scope user`.

---

## 3. Não aumentar vídeo pequeno (no-upscale)

O `render.py` de fábrica escala **todo** material pra 1920 no lado maior.
Em vídeo que já é menor que isso (webcam, captura de tela) isso é aumento
puro: o mesmo detalhe, várias vezes o bitrate e artefato de compressão mais
duro. Aqui a escala só desce — `scale=min(1920\,iw):-2`.

---

## Arquivos alterados

| arquivo | o que mudou |
|---|---|
| `helpers/transcribe.py` | reescrito pro faster-whisper + passada de VAD |
| `helpers/transcribe_scribe.py` | **novo** — o original da ElevenLabs, parado |
| `helpers/render.py` | UTF-8, caminho da legenda, no-upscale |
| `helpers/grade.py` | UTF-8 no console |
| `helpers/pack_transcripts.py` | UTF-8 no console e no arquivo |
| `helpers/transcribe_batch.py` | UTF-8 no console |
| `helpers/timeline_view.py` | UTF-8 |
| `SKILL.md` | seção "Transcription engine (local, and why)" |
| `install.md` | banner do fork, passo 5 reescrito, verificação real |
| `pyproject.toml` | dependência `faster-whisper` |
| `INSTALAR.md` | **novo** — guia de instalação em português |

---

## ⚠️ Puxar do upstream vai dar conflito

E é de propósito. `git pull upstream main` conflita em `transcribe.py`,
`render.py`, `grade.py`, `pack_transcripts.py`, `transcribe_batch.py`,
`SKILL.md` e `install.md`.

**Reaplicar as nossas, nunca aceitar as deles** — senão as quatro correções
voltam a ser quatro bugs, e nenhum deles se anuncia.

---

## Conferido ponta a ponta

Num clipe real em português: transcrever → empacotar → cortar → concatenar →
SRT → legenda queimada, com acento certo na imagem.
