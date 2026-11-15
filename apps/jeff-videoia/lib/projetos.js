// Projetos do editor. Cada projeto usa o estúdio Remotion compartilhado (/opt/jeff-apps/jeff-video/estudio):
//   estudio/projetos/vi-<id>/props.json   a edição (a mesma do render)
//   estudio/public/vi-<id>/videoN.mp4     fonte do render (cópia leve se 4K/HEVC/girado; feita pelo tools/video)
//   estudio/public/vi-<id>/prev/videoN.mp4  cópia de prévia (lado curto 720, GOP curto: busca rápida no navegador)
// e aqui em data/projetos/<id>/: projeto.json, originais/, ondas/ (forma de onda), quadros/ (miniaturas 1/s),
// versoes/ (fotos da edição antes de cada mudança da IA), saidas/ (exportados), trabalho/ (transcrições).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ESTUDIO = process.env.VIDEO_ESTUDIO || '/opt/jeff-apps/jeff-video/estudio';
const IMAGEM = process.env.VIDEO_IMAGEM || 'jeff-remotion:1';
const TOOL = process.env.VIDEO_TOOL || '/opt/jeff-apps/jeff-central/tools/video';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_BIN || 'ffprobe';
const DATA = path.join(__dirname, '..', 'data', 'projetos');
fs.mkdirSync(DATA, { recursive: true });

const ID_OK = /^[a-z0-9]{10}$/;
const dir = (id) => path.join(DATA, id);
const slug = (id) => 'vi-' + id;
const pub = (id) => path.join(ESTUDIO, 'public', slug(id));
const propsArq = (id) => path.join(ESTUDIO, 'projetos', slug(id), 'props.json');
const lerJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const gravar = (f, o) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); };

function ler(id) { if (!ID_OK.test(id)) return null; return lerJson(path.join(dir(id), 'projeto.json'), null); }
function salvar(p) { gravar(path.join(dir(p.id), 'projeto.json'), p); }
function atualiza(id, fn) { const p = ler(id); if (!p) return null; fn(p); p.atualizado = Date.now(); salvar(p); return p; }

function lista() {
  return fs.readdirSync(DATA).filter(x => ID_OK.test(x)).map(ler).filter(Boolean).sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0));
}

function criar(nome) {
  const id = crypto.randomBytes(8).toString('hex').replace(/[^a-z0-9]/g, '').slice(0, 10).padEnd(10, '0');
  for (const s of ['originais', 'ondas', 'quadros', 'versoes', 'saidas', 'trabalho']) fs.mkdirSync(path.join(dir(id), s), { recursive: true });
  const p = { id, nome: String(nome || 'Projeto sem nome').slice(0, 80), criado: Date.now(), atualizado: Date.now(), midias: [], tarefa: null, exportacoes: [] };
  salvar(p);
  return p;
}

function apagar(id) {
  if (!ler(id)) return false;
  for (const d of [dir(id), pub(id), path.join(ESTUDIO, 'projetos', slug(id))]) fs.rmSync(d, { recursive: true, force: true });
  return true;
}

function lerProps(id) { return lerJson(propsArq(id), null); }
function gravarProps(id, props) { gravar(propsArq(id), props); atualiza(id, () => {}); }

// foto da edição antes de uma mudança grande (IA): dá pra voltar
function guardarVersao(id, descricao) {
  const props = lerProps(id); if (!props) return null;
  const v = { id: Date.now().toString(36), em: Date.now(), descricao: String(descricao || '').slice(0, 200) };
  gravar(path.join(dir(id), 'versoes', v.id + '.json'), { ...v, props });
  return v;
}
function versoes(id) {
  const d = path.join(dir(id), 'versoes');
  return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => { const v = lerJson(path.join(d, f), null); return v && { id: v.id, em: v.em, descricao: v.descricao }; })
    .filter(Boolean).sort((a, b) => b.em - a.em).slice(0, 50);
}
function restaurarVersao(id, vid) {
  if (!/^[a-z0-9]{4,14}$/.test(vid)) return null;
  const v = lerJson(path.join(dir(id), 'versoes', vid + '.json'), null); if (!v) return null;
  guardarVersao(id, 'antes de voltar pra versão de ' + new Date(v.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  gravarProps(id, v.props);
  return v.props;
}

// ─── Processamento do upload ──────────────────────────────────────────────────────────────────────────────────────
function probe(p) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', p], { encoding: 'utf8', maxBuffer: 32 << 20 });
  const j = JSON.parse(r.stdout || '{}');
  const v = (j.streams || []).find(s => s.codec_type === 'video'), a = (j.streams || []).find(s => s.codec_type === 'audio');
  const fr = v && v.avg_frame_rate && v.avg_frame_rate.includes('/') ? (([n, d]) => d ? n / d : 0)(v.avg_frame_rate.split('/').map(Number)) : 0;
  return { duracao: +(+((j.format || {}).duration) || 0).toFixed(3), largura: v ? v.width : 0, altura: v ? v.height : 0, fps: +fr.toFixed(2), temAudio: !!a };
}

function roda(bin, args, opts) {
  return new Promise((ok, falha) => {
    const ch = spawn(bin, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    ch.stdout.on('data', d => { out += d; if (out.length > 1 << 20) out = out.slice(-(1 << 19)); });
    ch.stderr.on('data', d => { err += d; if (err.length > 1 << 20) err = err.slice(-(1 << 19)); });
    ch.on('error', falha);
    ch.on('close', c => c === 0 ? ok(out) : falha(new Error((err || out).trim().split('\n').filter(l => l.trim()).slice(-4).join(' ') || `${path.basename(bin)} saiu com ${c}`)));
  });
}

// forma de onda: 100 picos por segundo, 0-255, de toda a fonte
async function onda(src, dest) {
  await new Promise((ok, falha) => {
    const ch = spawn(FFMPEG, ['-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const picos = []; let resto = Buffer.alloc(0), max = 0, n = 0;
    ch.stdout.on('data', (d) => {
      const b = resto.length ? Buffer.concat([resto, d]) : d;
      const util = b.length - (b.length % 2);
      for (let i = 0; i < util; i += 2) {
        const v = Math.abs(b.readInt16LE(i)); if (v > max) max = v;
        if (++n === 80) { picos.push(Math.min(255, Math.round(Math.sqrt(max / 32768) * 255))); max = 0; n = 0; }
      }
      resto = b.subarray(util);
    });
    ch.on('error', falha);
    ch.on('close', (c) => { if (c !== 0) return falha(new Error('ffmpeg (onda) falhou')); fs.writeFileSync(dest, Buffer.from(picos)); ok(); });
  });
}

// fila: um processamento pesado por vez (o servidor é compartilhado)
let fila = Promise.resolve();
const enfileira = (fn) => { const p = fila.then(fn, fn); fila = p.catch(() => {}); return p; };

function etapa(id, texto, pct) { atualiza(id, p => { p.tarefa = { ...(p.tarefa || {}), tipo: 'midia', texto, pct, desde: (p.tarefa && p.tarefa.desde) || Date.now() }; }); }

// arquivos: [{ caminho, nomeOriginal }] já salvos em originais/. cortar: tira pausas e respirações (senão um clipe por vídeo)
function processar(id, arquivos, cortar) {
  etapa(id, 'Na fila', 0);
  return enfileira(async () => {
    const work = path.join(dir(id), 'trabalho');
    const toolOpts = { cwd: work, env: { ...process.env } };
    try {
      const antes = lerProps(id);
      const jaTinha = new Set(Object.keys(lerJson(path.join(ESTUDIO, 'projetos', slug(id), 'fontes.json'), {})));
      etapa(id, 'Preparando o vídeo', 5);
      await roda(TOOL, ['projeto', slug(id), ...arquivos.flatMap(a => ['--video', a.caminho])], toolOpts);
      const fontes = lerJson(path.join(ESTUDIO, 'projetos', slug(id), 'fontes.json'), {});
      const novos = Object.keys(fontes).filter(n => !jaTinha.has(n));
      fs.mkdirSync(path.join(pub(id), 'prev'), { recursive: true });
      let k = 0;
      for (const nome of novos) {
        const src = path.join(pub(id), nome), base = nome.replace(/\.mp4$/, '');
        const i = probe(src);
        const pct = (x) => 10 + Math.round(((k + x) / novos.length) * 70);
        etapa(id, `Cópia de prévia (${nome})`, pct(0));
        await roda(FFMPEG, ['-y', '-v', 'error', '-i', src, '-vf', "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'", '-c:v', 'libx264', '-preset', 'veryfast',
          '-crf', '27', '-g', '15', '-pix_fmt', 'yuv420p', ...(i.temAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']), '-movflags', '+faststart', path.join(pub(id), 'prev', nome)]);
        etapa(id, `Forma de onda e miniaturas (${nome})`, pct(0.3));
        if (i.temAudio) await onda(src, path.join(dir(id), 'ondas', base + '.bin'));
        const qd = path.join(dir(id), 'quadros', base); fs.mkdirSync(qd, { recursive: true });
        await roda(FFMPEG, ['-y', '-v', 'error', '-i', path.join(pub(id), 'prev', nome), '-vf', 'fps=1,scale=-2:80', '-q:v', '6', path.join(qd, '%05d.jpg')]);
        if (i.temAudio) {
          etapa(id, `Transcrevendo a fala (${nome})`, pct(0.5));
          await roda(TOOL, ['transcrever', fontes[nome]], toolOpts);
        }
        const orig = arquivos.find(a => a.caminho === fontes[nome]);
        atualiza(id, p => { p.midias.push({ nome, original: orig ? orig.nomeOriginal : path.basename(fontes[nome]), ...i, transcrito: i.temAudio }); });
        k++;
      }
      etapa(id, cortar ? 'Tirando pausas e respirações' : 'Montando a linha do tempo', 85);
      const semFala = novos.filter(n => !(ler(id).midias.find(m => m.nome === n) || {}).transcrito);
      if (semFala.length) {
        // vídeo sem áudio: transcrição vazia pro "montar" aceitar (vira um clipe inteiro)
        for (const n of semFala) {
          const b = path.basename(fontes[n]).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'video';
          gravar(path.join(work, `transcricao-${b}.json`), { arquivo: fontes[n], duracao: probe(path.join(pub(id), n)).duracao, segmentos: [], palavras: [] });
        }
      }
      await roda(TOOL, ['montar', slug(id), ...(cortar ? [] : ['--inteiro'])], toolOpts);
      // vídeo adicionado depois: mantém a edição que já existia e só acrescenta os clipes dos vídeos novos no fim
      const depois = lerProps(id);
      if (antes && jaTinha.size) {
        const novosSet = new Set(novos);
        antes.clipes = [...(antes.clipes || []), ...depois.clipes.filter(c => novosSet.has(c.video))];
        antes.palavras = { ...(antes.palavras || {}), ...Object.fromEntries(Object.entries(depois.palavras || {}).filter(([n]) => novosSet.has(n))) };
        gravarProps(id, antes);
      }
      atualiza(id, p => { p.tarefa = null; });
    } catch (e) {
      console.error('[videoia] processar', id, e.message);
      atualiza(id, p => { p.tarefa = { tipo: 'midia', erro: e.message.slice(0, 400), texto: 'Falhou', pct: 0 }; });
    }
  });
}

// ─── Exportar (render no contêiner, com progresso) ────────────────────────────────────────────────────────────────
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 32 << 20 });
function exportar(id, { trecho, rascunho, nome }) {
  const props = lerProps(id); if (!props || !(props.clipes || []).length) throw new Error('a linha do tempo está vazia');
  const ex = { id: 'vx' + Date.now().toString(36), em: Date.now(), nome: String(nome || '').replace(/[^\w -]+/g, '').trim().slice(0, 60) || (trecho ? 'amostra' : 'video'),
    trecho: trecho || null, rascunho: !!rascunho, estado: 'fila', pct: 0 };
  atualiza(id, p => { p.exportacoes = [ex, ...(p.exportacoes || [])].slice(0, 30); });
  const muda = (o) => atualiza(id, p => { const e = (p.exportacoes || []).find(x => x.id === ex.id); if (e) Object.assign(e, o); });
  enfileira(async () => {
    const cont = `videoia-${id}-${ex.id}`, out = `saidas/${cont}.mp4`;
    try {
      muda({ estado: 'renderizando', pct: 0, inicio: Date.now() });
      const args = ['run', '-d', '--name', cont, '-v', `${ESTUDIO}:/estudio`, '-w', '/estudio', '-e', 'NPM_CONFIG_UPDATE_NOTIFIER=false', IMAGEM, 'npx', 'remotion',
        'render', `projetos/${slug(id)}/index.ts`, 'Video', out, `--public-dir=public/${slug(id)}`, `--props=projetos/${slug(id)}/props.json`, '--log=info',
        '--concurrency=3', '--timeout=120000'];
      if (rascunho) args.push('--scale=0.5');
      if (trecho) { const fps = props.fps || 30; args.push(`--frames=${Math.round(trecho[0] * fps)}-${Math.max(Math.round(trecho[0] * fps), Math.round(trecho[1] * fps) - 1)}`); }
      const r = docker(args); if (r.status !== 0) throw new Error('docker: ' + (r.stderr || '').trim().slice(-300));
      let estado = 'running';
      while (estado.startsWith('running')) {
        await new Promise(ok => setTimeout(ok, 2000));
        estado = (docker(['inspect', '-f', '{{.State.Status}} {{.State.ExitCode}}', cont]).stdout || '').trim();
        const log = docker(['logs', '--tail', '6', cont]); const t = (log.stdout || '') + (log.stderr || '');
        const m = [...t.matchAll(/Rendered (\d+)\/(\d+)/g)].pop(), e2 = [...t.matchAll(/Encoded (\d+)\/(\d+)/g)].pop();
        if (m) muda({ pct: Math.min(95, Math.round((+m[1] / +m[2]) * (e2 ? 85 : 90))) });
        if (e2) muda({ pct: Math.min(97, 85 + Math.round((+e2[1] / +e2[2]) * 12)) });
      }
      const log = docker(['logs', '--tail', '30', cont]);
      docker(['rm', cont]);
      const final = path.join(ESTUDIO, out);
      if (!estado.endsWith(' 0') || !fs.existsSync(final)) throw new Error('render falhou: ' + ((log.stdout || '') + (log.stderr || '')).split('\n').filter(l => l.trim() && !/^\s+at /.test(l)).slice(-5).join(' ').slice(0, 400));
      muda({ estado: 'finalizando', pct: 98 });
      // voz no volume certo pra rede social: -14 LUFS, pico -1.5 dB (sem recodificar o vídeo)
      const dest = path.join(dir(id), 'saidas', ex.id + '.mp4');
      try { await roda(FFMPEG, ['-y', '-v', 'error', '-i', final, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', dest]); fs.rmSync(final, { force: true }); }
      catch (_) { fs.renameSync(final, dest); }
      muda({ estado: 'pronto', pct: 100, fim: Date.now(), tamanho: fs.statSync(dest).size });
    } catch (e) {
      docker(['rm', '-f', cont]);
      console.error('[videoia] exportar', id, e.message);
      muda({ estado: 'erro', erro: e.message.slice(0, 400) });
    }
  });
  return ex;
}

// projetos que ficaram "processando" quando o app reiniciou: marca como interrompido
for (const p of lista()) {
  let mudou = false;
  if (p.tarefa && !p.tarefa.erro) { p.tarefa = { tipo: 'midia', erro: 'interrompido (o editor reiniciou). Suba o vídeo de novo.', texto: 'Falhou', pct: 0 }; mudou = true; }
  for (const e of p.exportacoes || []) if (['fila', 'renderizando', 'finalizando'].includes(e.estado)) { e.estado = 'erro'; e.erro = 'interrompido (o editor reiniciou)'; mudou = true; }
  if (mudou) salvar(p);
}

module.exports = { ESTUDIO, DATA, ID_OK, dir, slug, pub, ler, lista, criar, apagar, atualiza, lerProps, gravarProps, guardarVersao, versoes, restaurarVersao, processar, exportar };
