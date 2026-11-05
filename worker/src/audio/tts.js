const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { config } = require('../config');
const { db } = require('../db');
const logger = require('../logger');

let FFMPEG_BIN = 'ffmpeg';
try { FFMPEG_BIN = require('@ffmpeg-installer/ffmpeg').path; } catch {}

const OUT_DIR = path.join(config.mediaPath, 'tts');
fs.mkdirSync(OUT_DIR, { recursive: true });

const TTS_TIMEOUT_MS = 30_000;
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Uma voz só para o ZEUS em todo lugar (WhatsApp e tela de voz da Central): a clonada "Jefferson ZEUS" (elevenlabs_voice_id)
// com o mesmo perfil do jeff-central/jarvis.js (VOZ_PERFIL). Mudou aqui, mude lá.
const VOZ_PERFIL = { model_id: 'eleven_multilingual_v2', stability: 0.6, similarity_boost: 0.85, speed: 1 }; // multilingual v2: a mais fiel à voz clonada (escolha do Jeff em 26/10/2026, amostra D)

async function synthWithElevenLabs(text, outOgg, voiceIdOverride) {
  const apiKey = getSetting('elevenlabs_api_key');
  const voiceId = voiceIdOverride || getSetting('elevenlabs_voice_id');
  if (!apiKey || !voiceId) return false;
  const body = {
    text,
    model_id: VOZ_PERFIL.model_id,
    voice_settings: { stability: VOZ_PERFIL.stability, similarity_boost: VOZ_PERFIL.similarity_boost, style: 0, use_speaker_boost: true, speed: VOZ_PERFIL.speed },
  };
  const res = await fetch(`${ELEVENLABS_URL}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    logger.warn({ status: res.status, err }, 'elevenlabs tts failed');
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpMp3 = outOgg.replace(/\.ogg$/, '.mp3');
  fs.writeFileSync(tmpMp3, buf);
  await new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_BIN, [
      '-y', '-i', tmpMp3,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'libopus', '-b:a', '48k', '-application', 'voip', outOgg,
    ], { stdio: 'ignore' });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    p.on('error', reject);
  });
  try { fs.unlinkSync(tmpMp3); } catch {}
  logger.info({ voice: voiceId, chars: text.length, provider: 'elevenlabs', override: !!voiceIdOverride }, 'tts synthesize ok');
  return true;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function synthesize(text, voiceIdOverride) {
  const base = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const ogg = path.join(OUT_DIR, `${base}.ogg`);
  // Nunca troca de voz: se a ElevenLabs falhar, tenta de novo uma vez e, se ainda falhar, lança erro para quem chamou
  // mandar a resposta em texto. (A voz da Microsoft/edge era outra voz e fazia o ZEUS "mudar de voz".)
  let usedEleven = false;
  for (let tentativa = 1; tentativa <= 2 && !usedEleven; tentativa++) {
    try {
      usedEleven = await withTimeout(synthWithElevenLabs(text, ogg, voiceIdOverride), TTS_TIMEOUT_MS, 'elevenlabs-tts');
    } catch (err) {
      logger.warn({ err: err.message, tentativa }, 'elevenlabs tts errored');
    }
  }
  if (!usedEleven) throw new Error('tts_indisponivel: ElevenLabs falhou, áudio não enviado para não trocar de voz');
  const base64 = fs.readFileSync(ogg).toString('base64');
  return { oggPath: ogg, base64, mimetype: 'audio/ogg; codecs=opus' };
}

module.exports = { synthesize };
