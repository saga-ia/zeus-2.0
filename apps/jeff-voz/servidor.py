# jeff-voz: voz grátis do Jarvis. Responde só em 127.0.0.1. POST /falar {"texto": "..."} -> audio/mpeg (em fluxo: o
# áudio começa a sair antes da frase inteira ficar pronta). GET /saude -> ok.
# POST /tem-fala (corpo = áudio em qualquer formato) -> {"fala_ms", "prob_max"}: detector de voz humana Silero VAD v5.1.2
#   (modelos/silero_vad.onnx, MIT). A Central só manda áudio para o Whisper se houver fala de verdade: sem isso o Whisper
#   inventava frases a partir de ruído ("Acesse o nosso site www..."). Medido: ruído/estalo 0 ms de fala, fala real ~90%.
# MOTOR=edge (padrão desde 15/11/2026): voz neural da Microsoft (Edge TTS, grátis e não oficial), primeiro áudio em
#   ~0,7 s, voz bem mais natural. Se a Microsoft falhar ou bloquear, cai sozinho no Piper (voz cadu, roda aqui, ~1 s).
# MOTOR=piper: só o Piper cadu. MOTOR=kokoro: Kokoro pm_alex (melhor que o Piper, mas 7 a 13 s neste servidor sem GPU).
# Histórico: Kokoro Alex (29/10/2026) -> Piper cadu (15/11) -> Edge Antonio (15/11) -> Edge William (15/11, trocava pro inglês às vezes) -> Edge Antonio +20%, tom natural,
# escolha do Jeff em 15/11/2026 (pediu mais rápido e sem sono). Amostras em amostras/ (antonio-ritmo20.mp3).
import asyncio, io, json, os, re, subprocess, threading, time, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get('HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '3072'))
MOTOR = os.environ.get('MOTOR', 'edge')
VOZ_EDGE = os.environ.get('VOZ_EDGE', 'pt-BR-AntonioNeural')
RITMO_EDGE = os.environ.get('RITMO_EDGE', '+20%')
TOM_EDGE = os.environ.get('TOM_EDGE', '+0Hz')  # negativo = mais grave
VOZ_PIPER = os.environ.get('VOZ_PIPER', 'cadu')
VOZ_KOKORO = os.environ.get('VOZ_KOKORO', 'pm_alex')
VELOCIDADE = float(os.environ.get('VELOCIDADE', '1.1'))  # Piper/Kokoro: 1.1 = 10% mais rápido
MAX_CHARS = 2000
PEDACO = 280  # o Kokoro tem limite por trecho: a fala vai em blocos de frases inteiras

# Reserva do Edge: Piper (leve, ~1 s) se o modelo existir; senão Kokoro (vai no pacote dos clientes; lento, 7 a 13 s
# sem GPU, carregado só na primeira vez que precisar). O pacote dos clientes não leva os modelos pt_BR-* do Piper.
piper = None
_arq_piper = os.path.join(BASE, 'modelos', f'pt_BR-{VOZ_PIPER}-medium.onnx')
if MOTOR in ('edge', 'piper') and os.path.exists(_arq_piper):
    try:
        from piper import PiperVoice
        piper = PiperVoice.load(_arq_piper)
    except Exception as e:
        print('[jeff-voz] piper indisponível:', str(e)[:160], flush=True)
_kokoro = None


def kokoro_carregado():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro
        _kokoro = Kokoro(os.path.join(BASE, 'modelos', 'kokoro-v1.0.int8.onnx'), os.path.join(BASE, 'modelos', 'voices-v1.0.bin'))
    return _kokoro


RESERVA = ('piper:' + VOZ_PIPER) if piper else ('kokoro:' + VOZ_KOKORO)
if MOTOR == 'kokoro':
    kokoro_carregado()
if MOTOR == 'edge':
    import edge_tts
import numpy as np
import onnxruntime as ort
_opc = ort.SessionOptions(); _opc.intra_op_num_threads = 1; _opc.inter_op_num_threads = 1
vad = ort.InferenceSession(os.path.join(BASE, 'modelos', 'silero_vad.onnx'), sess_options=_opc, providers=['CPUExecutionProvider'])


def fala_no_audio(dados):
    """Quantos ms de voz humana há no áudio (Silero VAD, janelas de 32 ms, probabilidade > 0,5)."""
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'],
                         input=dados, capture_output=True, check=True, timeout=20).stdout
    x = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
    estado = np.zeros((2, 1, 128), dtype=np.float32)
    ctx = np.zeros((1, 64), dtype=np.float32)
    sr = np.array(16000, dtype=np.int64)
    fala, pmax = 0, 0.0
    for i in range(0, len(x) - 511, 512):
        bloco = np.concatenate([ctx, x[i:i + 512][None, :]], axis=1)
        out, estado = vad.run(None, {'input': bloco, 'state': estado, 'sr': sr})
        ctx = bloco[:, -64:]
        p = float(out[0][0])
        pmax = max(pmax, p)
        if p > 0.5:
            fala += 32
    return {'fala_ms': fala, 'prob_max': round(pmax, 3), 'duracao_ms': len(x) // 16}


trava = threading.Lock()  # uma síntese local por vez: o modelo usa todos os núcleos


def pedacos(texto):
    frases = re.split(r'(?<=[.!?;:])\s+', texto)
    atual = ''
    for f in frases:
        while len(f) > PEDACO:  # frase gigante sem pontuação: corta na vírgula ou no espaço
            corte = max(f.rfind(',', 0, PEDACO), f.rfind(' ', 0, PEDACO))
            corte = corte if corte > 0 else PEDACO
            if atual:
                yield atual
                atual = ''
            yield f[:corte + 1].strip()
            f = f[corte + 1:].strip()
        if atual and len(atual) + len(f) + 1 > PEDACO:
            yield atual
            atual = f
        else:
            atual = (atual + ' ' + f).strip()
    if atual:
        yield atual


def mp3(pcm, sr):
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 's16le', '-ar', str(sr), '-ac', '1', '-i', 'pipe:0',
                        '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', '-f', 'mp3', 'pipe:1'],
                       input=pcm, capture_output=True, check=True)
    return r.stdout


def sintetizar_piper(texto):
    from piper import SynthesisConfig
    buf = io.BytesIO()
    with trava:
        with wave.open(buf, 'wb') as wf:
            piper.synthesize_wav(texto, wf, syn_config=SynthesisConfig(length_scale=1 / VELOCIDADE))
    buf.seek(0)
    with wave.open(buf, 'rb') as wf:
        return mp3(wf.readframes(wf.getnframes()), wf.getframerate())


def sintetizar_kokoro(texto):
    import numpy as np
    partes, sr = [], 24000
    with trava:
        for p in pedacos(texto):
            audio, sr = kokoro_carregado().create(p, voice=VOZ_KOKORO, speed=VELOCIDADE, lang='pt-br')
            partes.append(audio)
            partes.append(np.zeros(int(sr * 0.12), dtype=audio.dtype))  # respiro curto entre blocos
    pcm = (np.clip(np.concatenate(partes), -1, 1) * 32767).astype('<i2').tobytes()
    return mp3(pcm, sr)


def edge_stream(texto, escrever):
    """Manda o MP3 do Edge pedaço por pedaço conforme chega. Devolve quantos bytes saíram."""
    async def rodar():
        n = 0
        async for c in edge_tts.Communicate(texto, VOZ_EDGE, rate=RITMO_EDGE, pitch=TOM_EDGE).stream():
            if c['type'] == 'audio' and c['data']:
                escrever(c['data'])
                n += len(c['data'])
        return n
    return asyncio.run(asyncio.wait_for(rodar(), timeout=20))


class Handler(BaseHTTPRequestHandler):
    def responder(self, status, tipo, corpo):
        self.send_response(status)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path == '/saude':
            voz = VOZ_EDGE if MOTOR == 'edge' else VOZ_KOKORO if MOTOR == 'kokoro' else VOZ_PIPER
            return self.responder(200, 'application/json', json.dumps({'ok': True, 'motor': MOTOR, 'voz': voz, 'reserva': RESERVA}).encode())
        self.responder(404, 'text/plain', b'nao encontrado')

    def do_POST(self):
        if self.path == '/tem-fala':
            try:
                tam = int(self.headers.get('Content-Length') or 0)
                if not tam or tam > 25 * 1024 * 1024:
                    return self.responder(400, 'application/json', b'{"erro":"audio vazio ou grande demais"}')
                return self.responder(200, 'application/json', json.dumps(fala_no_audio(self.rfile.read(tam))).encode())
            except Exception as e:
                print('[jeff-voz] tem-fala erro:', str(e)[:200], flush=True)
                return self.responder(500, 'application/json', json.dumps({'erro': str(e)[:200]}).encode())
        if self.path != '/falar':
            return self.responder(404, 'text/plain', b'nao encontrado')
        try:
            tam = int(self.headers.get('Content-Length') or 0)
            if tam > 64 * 1024:
                return self.responder(413, 'application/json', b'{"erro":"texto grande demais"}')
            texto = str(json.loads(self.rfile.read(tam) or b'{}').get('texto') or '').strip()[:MAX_CHARS]
            if not texto:
                return self.responder(400, 'application/json', b'{"erro":"nada para falar"}')
        except Exception as e:
            return self.responder(400, 'application/json', json.dumps({'erro': str(e)[:200]}).encode())

        if MOTOR == 'edge':
            enviado = {'n': 0}
            ini = time.time()

            def escrever(dados):
                if not enviado['n']:  # cabeçalho só quando o primeiro áudio chega: se o Edge falhar antes, ainda dá para usar o Piper
                    self.send_response(200)
                    self.send_header('Content-Type', 'audio/mpeg')
                    self.send_header('X-Voz', 'edge:' + VOZ_EDGE)
                    self.end_headers()
                self.wfile.write(dados)
                self.wfile.flush()
                enviado['n'] += len(dados)
            try:
                edge_stream(texto, escrever)
                if enviado['n']:
                    return
                print('[jeff-voz] edge não devolveu áudio, usando reserva ' + RESERVA, flush=True)
            except (BrokenPipeError, ConnectionResetError):
                return  # quem pediu desistiu (você interrompeu a fala)
            except Exception as e:
                if enviado['n']:
                    print('[jeff-voz] edge caiu no meio:', str(e)[:200], flush=True)
                    return
                print(f'[jeff-voz] edge falhou em {time.time() - ini:.1f}s ({str(e)[:160]}), usando reserva ' + RESERVA, flush=True)
        try:
            usar_piper = MOTOR != 'kokoro' and piper is not None
            audio = sintetizar_piper(texto) if usar_piper else sintetizar_kokoro(texto)
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(audio)))
            self.send_header('X-Voz', ('piper:' + VOZ_PIPER) if usar_piper else ('kokoro:' + VOZ_KOKORO))
            self.end_headers()
            self.wfile.write(audio)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            print('[jeff-voz] erro:', e, flush=True)
            self.responder(500, 'application/json', json.dumps({'erro': str(e)[:200]}).encode())

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    voz = VOZ_EDGE if MOTOR == 'edge' else VOZ_KOKORO if MOTOR == 'kokoro' else VOZ_PIPER
    print(f'[jeff-voz] {MOTOR}:{voz} (reserva {RESERVA}) ouvindo em http://{HOST}:{PORT}', flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
