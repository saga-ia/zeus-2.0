# Teste da "voz rápida": áudio -> Whisper (Groq) -> resposta curta (Groq) -> voz Kokoro (jeff-voz local).
# Não mexe no Zeus. Mede o tempo de cada etapa.
# Uso: venv/bin/python teste_rapido.py <audio.ogg|mp3> [modelo]   (sem áudio, gera uma pergunta de exemplo)
import json, os, sys, time, uuid, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(BASE, 'testes')
os.makedirs(SAIDA, exist_ok=True)
GROQ = 'https://api.groq.com/openai/v1'
VOZ_URL = 'http://127.0.0.1:3072/falar'


def chave():
    for linha in open('/opt/jeff-worker/.env'):
        if linha.startswith('GROQ_API_KEY='):
            return linha.split('=', 1)[1].strip().strip('"')
    raise SystemExit('GROQ_API_KEY não encontrada')


KEY = chave()


def post(url, corpo, tipo, extra=None):
    h = {'Content-Type': tipo, 'User-Agent': 'jeff-voz-teste'}
    if url.startswith(GROQ):
        h['Authorization'] = 'Bearer ' + KEY
    req = urllib.request.Request(url, data=corpo, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def falar(texto, destino):
    open(destino, 'wb').write(post(VOZ_URL, json.dumps({'texto': texto}).encode(), 'application/json'))


def transcrever(caminho):
    b = uuid.uuid4().hex
    partes = []
    for k, v in (('model', 'whisper-large-v3-turbo'), ('language', 'pt'), ('response_format', 'json')):
        partes.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    partes.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(caminho)}"\r\n'
                  f'Content-Type: application/octet-stream\r\n\r\n'.encode() + open(caminho, 'rb').read() + b'\r\n')
    partes.append(f'--{b}--\r\n'.encode())
    return json.loads(post(GROQ + '/audio/transcriptions', b''.join(partes), 'multipart/form-data; boundary=' + b))['text']


SISTEMA = ('Você é o ZEUS, assistente do Jeff. Responda em português do Brasil, falado e natural, '
           'em no máximo 2 ou 3 frases curtas, porque a resposta vira áudio no WhatsApp. '
           'Sem listas, sem emojis, sem markdown. Se o pedido exigir consultar sistemas (financeiro, tarefas, agenda), '
           'diga em uma frase que vai verificar e já retorna.')


def responder(texto, modelo):
    corpo = {'model': modelo, 'temperature': 0.6, 'max_completion_tokens': 400,
             'messages': [{'role': 'system', 'content': SISTEMA}, {'role': 'user', 'content': texto}]}
    if 'gpt-oss' in modelo:
        corpo['reasoning_effort'] = 'low'
    if 'qwen' in modelo:
        corpo['reasoning_effort'] = 'none'
    return json.loads(post(GROQ + '/chat/completions', json.dumps(corpo).encode(), 'application/json'))['choices'][0]['message']['content'].strip()


def rodar(audio, modelo):
    t0 = time.time(); texto = transcrever(audio); t1 = time.time()
    resp = responder(texto, modelo); t2 = time.time()
    nome = os.path.join(SAIDA, f'resposta-{modelo.split("/")[-1]}-{int(t0)}.mp3')
    falar(resp, nome); t3 = time.time()
    print(f'\n[{modelo}]\n  você disse: {texto}\n  resposta:   {resp}\n  áudio:      {nome}')
    print(f'  tempos: ouvir {t1-t0:.1f}s | pensar {t2-t1:.1f}s | falar {t3-t2:.1f}s | TOTAL {t3-t0:.1f}s')


if __name__ == '__main__':
    audio = sys.argv[1] if len(sys.argv) > 1 else None
    if not audio:
        audio = os.path.join(SAIDA, 'pergunta-exemplo.mp3')
        falar('Zeus, me dá uma ideia rápida de post pro Instagram sobre atendimento automático no WhatsApp.', audio)
    modelos = sys.argv[2:] or ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b']
    for m in modelos:
        try:
            rodar(audio, m)
        except Exception as e:
            print(f'\n[{m}] ERRO: {e}')
