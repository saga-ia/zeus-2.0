# Instalar o video-use no Claude Code

Editor de vídeo por conversa. Você joga os vídeos numa pasta, abre o Claude
Code lá dentro e fala o que quer — ele transcreve, corta pela transcrição,
faz correção de cor, queima legenda e monta animação.

Esta é a **versão da Forge**: a transcrição roda **na sua máquina**, de graça
e sem chave de API (o original cobra por minuto de áudio na ElevenLabs).

---

## O caminho mais curto

Abra o Claude Code em qualquer pasta e mande:

> Instala o video-use que está em `<caminho-desta-pasta>` seguindo o `install.md`.

Ele faz o resto. O `install.md` foi escrito pra ser lido por agente, não por
gente — inclusive a parte de *não* pedir chave de API.

Se preferir na mão, é o que está abaixo.

---

## Na mão, em 4 passos

### 1. Colocar a pasta onde o Claude Code enxerga

O Claude Code procura skills em `~/.claude/skills/`. A pasta inteira vai pra
lá com o nome `video-use` — **não só o `SKILL.md`**, porque os scripts de
`helpers/` precisam ficar do lado dele.

**Windows (PowerShell):**

```powershell
mkdir "$env:USERPROFILE\.claude\skills" -Force
Copy-Item -Recurse "<esta-pasta>" "$env:USERPROFILE\.claude\skills\video-use"
```

**macOS / Linux:**

```bash
mkdir -p ~/.claude/skills
cp -r <esta-pasta> ~/.claude/skills/video-use
```

Sendo skill **global**, ela carrega em qualquer pasta que você abrir o Claude
Code. Não precisa copiar nada pra dentro de projeto nenhum.

### 2. Python e as dependências

Precisa de **Python 3.10 ou mais novo**. Confira com `python --version`.

⚠️ **No Windows, cuidado com a armadilha da Microsoft Store**: se o
`python --version` devolver `0.0.0.0` ou abrir a loja, o Python de verdade não
está instalado — só um atalho falso. Instale com:

```powershell
winget install Python.Python.3.12 --scope user
```

Com o Python no lugar, de dentro da pasta da skill:

```bash
python -m pip install -e .
```

Isso traz o `faster-whisper` (o motor de transcrição), o `librosa`, o
`matplotlib`, o `pillow` e o `numpy`.

### 3. ffmpeg

É obrigatório — é ele que corta, junta e renderiza tudo.

**Windows:**

```powershell
winget install Gyan.FFmpeg --scope user
```

**macOS:** `brew install ffmpeg`

⚠️ Depois de instalar, **abra um terminal novo**. O `PATH` não atualiza na
janela que rodou o comando, e o `ffmpeg: command not found` logo depois de uma
instalação bem-sucedida é isso, não falha de instalação.

Confira: `ffmpeg -version`

### 4. Baixar o modelo de transcrição uma vez

A primeira transcrição baixa ~1,5 GB. Melhor tirar isso do caminho agora do
que na hora de editar:

```bash
python -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8'); print('modelo pronto')"
```

---

## Como usar no dia a dia

1. Ponha os vídeos numa pasta.
2. Abra o Claude Code **dentro dela** (`cd` na pasta, depois `claude`).
3. Fale o que você quer. Por exemplo:
   - *"faz um inventário desses takes e me propõe uma estratégia"*
   - *"transforma isso num vídeo de 60 segundos pro Instagram"*
   - *"corta as pausas e as repetições, e queima legenda"*

Tudo que ele gera vai pra `edit/` dentro da pasta dos vídeos. A pasta da skill
não é tocada.

⚠️ **Rode na pasta dos vídeos, não na pasta da skill.** É lá que ele escreve.

---

## O que esperar (e o que não esperar)

| | |
|---|---|
| **Custo** | zero. Roda offline, sem chave de API. |
| **Velocidade da transcrição** | mais ou menos o tempo do vídeo. 10 minutos de vídeo ≈ 10 minutos de CPU. É o passo mais lento de todo o processo. |
| **Idioma** | funciona em português, com acento certo na legenda queimada. |
| **Diarização** | **não tem.** Todo mundo vira `speaker_0`. Pra uma pessoa falando na frente da câmera não muda nada; pra entrevista de duas pessoas, ele perde a marcação de quem fala. |
| **Eventos de áudio** | **não tem.** Não marca `(risada)` nem `(aplauso)`. Esses momentos se acham olhando a onda de áudio, não lendo etiqueta. |

---

## Se der problema

**"Não achou a skill"** — confira se a pasta está em `~/.claude/skills/video-use`
com o `SKILL.md` e a pasta `helpers/` **lado a lado** dentro dela.

**"ffmpeg not found"** — terminal novo (ver o passo 3).

**Transcreveu certinho mas ele diz que não achou onde cortar** — é o sintoma
mais traiçoeiro deste projeto. Abra o JSON em `edit/transcripts/` e procure
alguma entrada `spacing`. Se não tiver nenhuma, a passada de VAD não rodou: o
texto sai perfeito e o editor fica sem nenhum candidato a corte. O `SKILL.md`
explica em "The silence pass, which is load-bearing".

---

## Crédito

Fork de [browser-use/video-use](https://github.com/browser-use/video-use),
MIT. As mudanças desta versão estão no `FORK.md`.
