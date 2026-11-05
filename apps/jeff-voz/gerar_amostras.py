# Gera amostras de voz grátis (Kokoro e Piper, rodando no servidor) para escolher a voz do Jarvis.
# Uso: venv/bin/python gerar_amostras.py  ->  amostras/<n>-<voz>.mp3 (limpa) e <n>-<voz>-ia.mp3 (com efeito)
import os, subprocess, wave
import soundfile as sf

BASE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.join(BASE, 'modelos')
OUT = os.path.join(BASE, 'amostras')
os.makedirs(OUT, exist_ok=True)

TEXTO = 'Pronto, Jeff. Os relatórios de hoje já estão na sua tela. A campanha de ontem teve o melhor resultado da semana.'

# Efeito "IA": voz um pouco mais grave, faixa de rádio, eco curtíssimo (timbre metálico) e um coro leve.
EFEITO = ('asetrate={sr}*0.95,aresample={sr},atempo=1/0.95,'
          'highpass=f=110,lowpass=f=8500,'
          'aecho=0.85:0.7:9|18:0.22|0.12,'
          'chorus=0.7:0.9:25:0.25:0.3:1.8,'
          'loudnorm=I=-16:TP=-1.5')


def mp3(wav, destino, filtro=None, sr=24000):
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav]
    if filtro:
        cmd += ['-af', filtro.format(sr=sr)]
    cmd += ['-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', destino]
    subprocess.run(cmd, check=True)


def kokoro(voz, wav):
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(MOD, 'kokoro-v1.0.int8.onnx'), os.path.join(MOD, 'voices-v1.0.bin'))
    audio, sr = k.create(TEXTO, voice=voz, speed=0.95, lang='pt-br')
    sf.write(wav, audio, sr)
    return sr


def piper(voz, wav):
    from piper import PiperVoice
    v = PiperVoice.load(os.path.join(MOD, f'pt_BR-{voz}-medium.onnx'))
    with wave.open(wav, 'wb') as wf:
        if hasattr(v, 'synthesize_wav'):
            v.synthesize_wav(TEXTO, wf)
        else:
            v.synthesize(TEXTO, wf)
    return v.config.sample_rate


VOZES = [('1', 'kokoro-alex', kokoro, 'pm_alex'),
         ('2', 'kokoro-santa', kokoro, 'pm_santa'),
         ('3', 'piper-faber', piper, 'faber'),
         ('4', 'piper-cadu', piper, 'cadu'),
         ('5', 'piper-jeff', piper, 'jeff')]

for n, nome, motor, voz in VOZES:
    wav = os.path.join(OUT, f'{n}-{nome}.wav')
    try:
        sr = motor(voz, wav)
        mp3(wav, os.path.join(OUT, f'{n}-{nome}.mp3'))
        mp3(wav, os.path.join(OUT, f'{n}-{nome}-ia.mp3'), EFEITO, sr)
        os.remove(wav)
        print('ok', nome)
    except Exception as e:
        print('ERRO', nome, e)
