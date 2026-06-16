const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
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

async function synthWithElevenLabs(text, outOgg, voiceIdOverride) {
  const apiKey = getSetting('elevenlabs_api_key');
  const voiceId = voiceIdOverride || getSetting('elevenlabs_voice_id') || getSetting('elevenlabs_voice_lucas');
  if (!apiKey || !voiceId) return false;
  const body = {
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.3 },
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
    logger.warn({ status: res.status, err }, 'elevenlabs tts failed, falling back to edge');
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

async function synthToWebm(text, outFile) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(config.ttsVoice, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
  const { audioStream } = tts.toStream(text, { rate: config.ttsRate, pitch: config.ttsPitch });
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(outFile);
    audioStream.pipe(w);
    w.on('finish', resolve);
    w.on('error', reject);
    audioStream.on('error', reject);
  });
}

function webmToOgg(inFile, outFile) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_BIN, [
      '-y', '-i', inFile,
      '-c:a', 'libopus',
      '-b:a', '24k',
      '-ac', '1',
      '-ar', '24000',
      '-f', 'ogg',
      outFile,
    ], { stdio: 'ignore' });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    p.on('error', reject);
  });
}

async function synthesize(text, voiceIdOverride) {
  const base = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const ogg = path.join(OUT_DIR, `${base}.ogg`);
  let usedEleven = false;
  try {
    usedEleven = await withTimeout(synthWithElevenLabs(text, ogg, voiceIdOverride), TTS_TIMEOUT_MS, 'elevenlabs-tts');
  } catch (err) {
    logger.warn({ err: err.message }, 'elevenlabs tts errored, falling back');
  }
  if (!usedEleven) {
    const webm = path.join(OUT_DIR, `${base}.webm`);
    await withTimeout(synthToWebm(text, webm), TTS_TIMEOUT_MS, 'edge-tts');
    await withTimeout(webmToOgg(webm, ogg), TTS_TIMEOUT_MS, 'ffmpeg');
    try { fs.unlinkSync(webm); } catch {}
    logger.info({ voice: config.ttsVoice, chars: text.length, provider: 'edge' }, 'tts synthesize ok');
  }
  const base64 = fs.readFileSync(ogg).toString('base64');
  return { oggPath: ogg, base64, mimetype: 'audio/ogg; codecs=opus' };
}

module.exports = { synthesize };
