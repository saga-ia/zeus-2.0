# Jarvis: conversa em tempo real grátis

Como funciona a conversa por voz da tela **/jarvis** da Central, sem ElevenLabs (desde 15/11/2026).
Custo por conversa: zero. Tudo roda no próprio servidor ou no plano gratuito da Groq.

## Visão geral

```
 Navegador (public/jarvis.js)                       Servidor
 ───────────────────────────                        ────────
 microfone ──► detector de fala (dB) ──► grava ──► POST /api/chat/transcribe ─► jeff-voz /tem-fala (Silero: tem voz?)
                                                                             └► Groq Whisper large-v3 (+ filtro anti-invenção)
            ◄──────────────────────────── texto ◄┘
 texto ─────────────────────────────────────────► POST /api/jarvis/pensar ───► Groq GPT-OSS 120B (reserva: Qwen 3.8)
            ◄──────────────── fala + ações ◄─────┘   ações: pedir_ao_zeus (vai pro chat do Zeus completo), mostrar_quadro
 fala ──► <audio> único ◄─ GET /api/jarvis/falar?t= ─► jeff-voz /falar ─► Edge TTS (Microsoft, voz Antonio, em fluxo)
                                                                       └► reserva local (Piper ou Kokoro) se o Edge falhar
```

Tempo medido do fim da fala até o Zeus começar a responder: **3 a 4 s** (silêncio 0,75 + ouvir 0,5 + pensar 0,5 + voz 1,2).

## As 4 partes

### 1. Ouvir: detector de fala no navegador (`apps/jeff-central/public/jarvis.js`, função `conversar`)

- O microfone fica aberto a conversa inteira (`echoCancellation`, `noiseSuppression`, `autoGainControl`).
- Um laço a cada 50 ms mede o volume em **dB (RMS)** e acompanha o "fundo" do ambiente.
  - É fala o que fica acima de **-45 dB** e pelo menos **14 dB acima do fundo**. Com medida mais simples, chiado de -55 a -80 dB disparava a gravação.
  - Ela termina depois de **750 ms de silêncio**. Precisa de pelo menos **400 ms de som** pra contar; menos que isso é barulho.
- **Interrupção** (falar enquanto o Zeus fala). O problema era o eco da caixa de som (-20 a -38 dB) passar por você falando. Por isso:
  - a tela compara o microfone com o volume que o Zeus está tocando naquele instante e aprende o nível normal do eco;
  - só conta como interrupção se o microfone passar **12 dB acima** desse eco por 400 ms;
  - ao detectar, o Zeus **só abaixa o volume (15%)** e continua falando. Se a transcrição vier com fala real, ele para e responde. Se vier vazia (era eco), o volume volta e ele termina a frase.
- **iPhone**: o Safari só toca áudio que começou num toque. Por isso existe **um único tocador**, destravado no primeiro toque com 0,1 s de silêncio e reaproveitado em todas as falas.

### 2. Transcrever: Whisper com três proteções (`apps/jeff-central/chat.js`, `transcribeAudio`)

O Whisper "inventa" frases de fim de vídeo quando recebe áudio sem fala ("Acesse o nosso site www...", "Legendas pela comunidade Amara.org", "Obrigado por assistir").

1. **Tela**: exige 400 ms de som e descarta frases típicas de invenção.
2. **Silero VAD** (`jeff-voz`, `POST /tem-fala`, modelo `modelos/silero_vad.onnx`, MIT). Mede quantos ms de voz humana há no áudio. Ele **não bloqueia sozinho**: se achar menos de 300 ms, o Whisper roda com filtro rigoroso.
3. **Filtro de confiança do Whisper** (`verbose_json`). Descarta trechos com `avg_logprob < -0,6` (rigoroso: `< -0,35`) ou `no_speech_prob` alto. Fala real fica em torno de -0,1; invenção, em torno de -0,7.

O modelo é o `whisper-large-v3` na Groq, com vocabulário: nome de quem fala, nomes do time e ferramentas.
Diagnóstico: com `JARVIS_DEBUG_VOZ=1` no ambiente da Central, os áudios em que o detector discordou ficam em `data/_debug-voz` (até 15). Fica desligado por padrão, porque guarda a voz das pessoas.

### 3. Pensar: `POST /api/jarvis/pensar` (`apps/jeff-central/jarvis.js`)

- Roda o **GPT-OSS 120B na Groq** (~0,5 s), com o histórico curto da conversa e as tarefas em andamento. Se ele falhar (limite do plano grátis, por exemplo), entra o **Qwen 3.8**.
- O roteiro (`PROMPT_VOZ`) pede tom de áudio de WhatsApp, 1 ou 2 frases e nada de listas ou links.
- Ferramentas:
  - `pedir_ao_zeus`: dados e ações reais (financeiro, agenda, WhatsApp, anúncios...). Vira uma tarefa no chat do Zeus completo (até 3 ao mesmo tempo). O resultado volta depois como "RESULTADO DO ZEUS" e a voz conta.
  - `mostrar_quadro`: monta na tela o briefing que a pessoa está ditando.
- A chave usada é `groq_api_key` em `app_settings` do worker (a mesma da transcrição). Sem ela, cai no `GROQ_API_KEY` do `.env` do worker.

### 4. Falar: `jeff-voz` (`apps/jeff-voz/servidor.py`, PM2, `127.0.0.1:3072`)

- **Edge TTS** (voz neural da Microsoft, grátis, não oficial): `pt-BR-AntonioNeural`, ritmo +20%. O áudio sai **em fluxo**: começa a tocar em ~0,7 a 1 s, antes de a frase inteira ficar pronta.
- **Reserva automática** se o Edge falhar: Piper (se o modelo existir, ~1 s) ou Kokoro (vai no pacote dos clientes; mais lento, 6 a 13 s sem GPU).
- A Central guarda em cache as frases curtas repetidas (`data/jarvis-voz/`). A chave do cache inclui `VOZ_LOCAL_ID` no `jarvis.js`: ao trocar a voz, mude o ID.
- Configuração por ambiente (`ecosystem.config.js`): `MOTOR` (edge|piper|kokoro), `VOZ_EDGE`, `RITMO_EDGE`, `TOM_EDGE`. Vozes estrangeiras "Multilingual" escorregam pro inglês no meio da fala; prefira as `pt-BR-*`.

## Limites e custos

| Peça | Custo | Limite |
|---|---|---|
| Whisper (Groq) | grátis | folgado |
| GPT-OSS 120B (Groq) | grátis | 1.000 respostas/dia e 8.000 tokens/min (cada resposta usa ~1,5 a 2,5 mil) |
| Edge TTS | grátis | não oficial: se a Microsoft bloquear, entra a reserva local |
| Silero, Piper, Kokoro | grátis | rodam no servidor |

## Arquivos

| Arquivo | Papel |
|---|---|
| `apps/jeff-central/public/jarvis.js` | Tela: detector de fala, interrupção com eco, tocador único, fluxo da conversa |
| `apps/jeff-central/jarvis.js` | `/api/jarvis/pensar`, `/falar` (em fluxo, com cache) e `/tempo` (tempos medidos no navegador, vão pro log) |
| `apps/jeff-central/chat.js` | `/api/chat/transcribe`: Silero + Whisper + filtro anti-invenção |
| `apps/jeff-voz/servidor.py` | `/falar` (Edge em fluxo + reserva) e `/tem-fala` (Silero) |
| `apps/jeff-voz/modelos/silero_vad.onnx` | Detector de voz humana (Silero VAD v5.1.2) |
| `apps/jeff-central/scripts/reinicio-seguro.sh` | Reinicia a Central só quando nada estiver em andamento |

## Diagnóstico rápido

- **Tempos por resposta**: `grep "\[jarvis\] tempos" logs/out.log` (silêncio + ouvir + pensar + voz).
- **Fala descartada**: `grep "\[transcrição\]" logs/out.log` mostra o motivo e a confiança.
- **Voz**: `curl -s 127.0.0.1:3072/saude` mostra o motor, a voz e a reserva.
- **Interrompe sozinho**: é eco da caixa de som; com fone de ouvido some. Ajuste em `VAD.ecoFolgaDb` (tela).
- **Não ouve**: ver `VAD.minimoDb` e `VAD.folgaDb` (tela).
- **iPhone sem som**: a página precisa ser recarregada depois de uma atualização (o aviso "A Central foi atualizada").
