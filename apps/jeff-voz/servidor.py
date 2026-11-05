# jeff-voz: voz grátis do Jarvis (Kokoro, voz pm_alex, licença Apache 2.0), rodando no próprio servidor.
# Mantém o modelo carregado e responde só em 127.0.0.1. POST /falar {"texto": "..."} -> audio/mpeg. GET /saude -> ok.
# Escolha do Jeff em 29/10/2026: Kokoro Alex, sem efeito. Amostras e comparação em amostras/ (gerar_amostras.py).
import json, os, re, subprocess, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np
from kokoro_onnx import Kokoro

BASE = os.path.dirname(os.path.abspath(__file__))
HOST = os.environ.get('HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '3072'))
VOZ = os.environ.get('VOZ', 'pm_alex')
VELOCIDADE = float(os.environ.get('VELOCIDADE', '0.95'))
MAX_CHARS = 2000
PEDACO = 280  # o Kokoro tem limite por trecho: a fala vai em blocos de frases inteiras

modelo = Kokoro(os.path.join(BASE, 'modelos', 'kokoro-v1.0.int8.onnx'), os.path.join(BASE, 'modelos', 'voices-v1.0.bin'))
trava = threading.Lock()  # uma síntese por vez: o modelo usa todos os núcleos


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


def sintetizar(texto):
    partes, sr = [], 24000
    with trava:
        for p in pedacos(texto):
            audio, sr = modelo.create(p, voice=VOZ, speed=VELOCIDADE, lang='pt-br')
            partes.append(audio)
            partes.append(np.zeros(int(sr * 0.12), dtype=audio.dtype))  # respiro curto entre blocos
    pcm = (np.clip(np.concatenate(partes), -1, 1) * 32767).astype('<i2').tobytes()
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 's16le', '-ar', str(sr), '-ac', '1', '-i', 'pipe:0',
                        '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', '-f', 'mp3', 'pipe:1'],
                       input=pcm, capture_output=True, check=True)
    return r.stdout


class Handler(BaseHTTPRequestHandler):
    def responder(self, status, tipo, corpo):
        self.send_response(status)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path == '/saude':
            return self.responder(200, 'application/json', json.dumps({'ok': True, 'voz': VOZ}).encode())
        self.responder(404, 'text/plain', b'nao encontrado')

    def do_POST(self):
        if self.path != '/falar':
            return self.responder(404, 'text/plain', b'nao encontrado')
        try:
            tam = int(self.headers.get('Content-Length') or 0)
            if tam > 64 * 1024:
                return self.responder(413, 'application/json', b'{"erro":"texto grande demais"}')
            texto = str(json.loads(self.rfile.read(tam) or b'{}').get('texto') or '').strip()[:MAX_CHARS]
            if not texto:
                return self.responder(400, 'application/json', b'{"erro":"nada para falar"}')
            self.responder(200, 'audio/mpeg', sintetizar(texto))
        except Exception as e:
            print('[jeff-voz] erro:', e, flush=True)
            self.responder(500, 'application/json', json.dumps({'erro': str(e)[:200]}).encode())

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    print(f'[jeff-voz] {VOZ} ouvindo em http://{HOST}:{PORT}', flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
