// Normaliza vídeos antes de mandar pro Instagram.
// A Graph API rejeita HEVC/H.265, resoluções acima de 1080x1920 e Reels > 90s.
// Tudo que não bate nos limites é recodificado com ffmpeg pra H.264 + AAC,
// escalado pra caber em 1080x1920 (preservando aspecto) e truncado pra 90s
// quando o destino é Reels.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_W = 1080;
const MAX_H = 1920;
const REELS_MAX_SEC = 90;

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://zeus-post.jefersonhenrike.com';

function run(cmd, args, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (c) => (stdout += c));
    p.stderr.on('data', (c) => (stderr += c));
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} reject(new Error(`${cmd} timeout`)); }, timeoutMs);
    p.on('close', (code) => {
      clearTimeout(to);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exit ${code}: ${stderr.slice(-500)}`));
    });
    p.on('error', reject);
  });
}

async function probe(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    filePath,
  ], { timeoutMs: 60000 });
  const info = JSON.parse(stdout);
  const v = (info.streams || []).find((s) => s.codec_type === 'video');
  const a = (info.streams || []).find((s) => s.codec_type === 'audio');
  const duration = parseFloat(info.format?.duration || v?.duration || '0') || 0;
  return {
    videoCodec: v?.codec_name || null,
    audioCodec: a?.codec_name || null,
    width: v?.width || 0,
    height: v?.height || 0,
    duration,
  };
}

function needsNormalize(info, { isReels }) {
  if (!info.videoCodec) return { normalize: true, reason: 'no-video-stream-info' };
  if (info.videoCodec !== 'h264') return { normalize: true, reason: `codec=${info.videoCodec}` };
  if (info.audioCodec && info.audioCodec !== 'aac') return { normalize: true, reason: `audio=${info.audioCodec}` };
  if (info.width > MAX_W || info.height > MAX_H) return { normalize: true, reason: `${info.width}x${info.height}` };
  if (isReels && info.duration > REELS_MAX_SEC + 0.5) return { normalize: true, reason: `duration=${info.duration.toFixed(1)}s` };
  return { normalize: false };
}

// mp4 nativo sempre, nome com sufixo .norm.mp4 pra ficar óbvio no uploads.
function normalizedPath(localPath) {
  const dir = path.dirname(localPath);
  const base = path.basename(localPath, path.extname(localPath));
  return path.join(dir, base + '.norm.mp4');
}

function toPublicUrl(localPath) {
  const idx = localPath.indexOf('/uploads/');
  if (idx === -1) return null;
  return PUBLIC_BASE + localPath.slice(idx);
}

async function transcode(input, output, { isReels }) {
  // scale caber em 1080x1920 preservando aspecto, sem upscale (min(1,...))
  const vf = `scale='min(${MAX_W},iw)':'min(${MAX_H},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const args = [
    '-y',
    '-i', input,
    '-map_metadata', '-1',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-level', '4.1',
    '-vf', vf,
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
  ];
  if (isReels) args.push('-t', String(REELS_MAX_SEC));
  args.push(output);
  await run('ffmpeg', args, { timeoutMs: 15 * 60 * 1000 });
}

// Retorna { path, url, changed, info, reason } — se nada precisa mudar, devolve o original.
async function normalizeIfNeeded(localPath, { postType }) {
  if (!localPath || !fs.existsSync(localPath)) return { path: localPath, url: toPublicUrl(localPath), changed: false, skipped: true };
  const isReels = postType === 'video' || postType === 'reel' || postType === 'story';
  let info;
  try {
    info = await probe(localPath);
  } catch (err) {
    console.warn(`[normalize] ffprobe falhou em ${path.basename(localPath)}: ${err.message} — seguindo sem normalizar`);
    return { path: localPath, url: toPublicUrl(localPath), changed: false, probeFailed: true };
  }

  const decision = needsNormalize(info, { isReels });
  if (!decision.normalize) {
    return { path: localPath, url: toPublicUrl(localPath), changed: false, info };
  }

  const out = normalizedPath(localPath);
  // se já existe (retry reaproveitando), reusa
  if (!fs.existsSync(out)) {
    console.log(`[normalize] recodificando ${path.basename(localPath)} (${decision.reason})`);
    const started = Date.now();
    try {
      await transcode(localPath, out, { isReels });
    } catch (err) {
      try { fs.unlinkSync(out); } catch (e) {}
      throw new Error(`ffmpeg falhou em ${path.basename(localPath)}: ${err.message}`);
    }
    console.log(`[normalize] ${path.basename(out)} pronto em ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } else {
    console.log(`[normalize] reaproveitando ${path.basename(out)} (já existia)`);
  }
  return { path: out, url: toPublicUrl(out), changed: true, info, reason: decision.reason };
}

module.exports = { normalizeIfNeeded, probe, needsNormalize };
