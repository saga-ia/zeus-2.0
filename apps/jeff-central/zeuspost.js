// Painel do Agente Posts: serve o Automatik Inst (ZEUS POST) dentro da Central.
// O motor (publisher, worker, tokens da Meta, banco) continua em jeff-automatikinst;
// aqui a Central só faz a ponte: quem está logado na Central usa o painel sem segundo login.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ZP_HOST = process.env.ZEUSPOST_HOST || '127.0.0.1';
const ZP_PORT = parseInt(process.env.ZEUSPOST_PORT || '3080', 10);
const ZP_DIR = process.env.ZEUSPOST_DIR || '/opt/jeff-apps/jeff-automatikinst';
const ZP_USER = process.env.ZEUSPOST_USER || 'jeff';
const PREFIX = '/zeuspost';

// Token de serviço: assinado com o segredo do próprio Automatik (lido na hora, nunca copiado).
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
let _tok = null, _tokExp = 0;
function serviceToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tok && now < _tokExp - 60) return _tok;
  const secret = process.env.ZEUSPOST_JWT_SECRET || fs.readFileSync(path.join(ZP_DIR, 'data', '.jwt-secret'), 'utf8').trim();
  const exp = now + 3600;
  const body = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ id: 1, username: ZP_USER, via: 'central', iat: now, exp });
  _tok = body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url');
  _tokExp = exp;
  return _tok;
}

// As telas do Automatik usam caminhos absolutos (/api, /css, /editor.html). Dentro da Central
// tudo vive sob /zeuspost, então HTML e JS são reescritos na passagem.
const BOOT = `<script>try{localStorage.setItem('zp_token','central');localStorage.setItem('zp_user','${ZP_USER}')}catch(e){}
// embutido na tela do agente: as abas da Central navegam, então o menu lateral próprio some
if(window.top!==window){document.documentElement.classList.add('zp-embed');document.write('<style>.zp-embed .sidebar,.zp-embed .sidebar-backdrop,.zp-embed .menu-toggle{display:none!important}.zp-embed .main{margin-left:0!important;padding-top:28px!important;min-width:0!important;max-width:100vw}</style>')}
document.addEventListener('DOMContentLoaded',function(){
  var s=document.createElement('style');s.textContent='#logoutBtn{display:none!important}';document.head.appendChild(s);
  document.querySelectorAll('a[href*="/oauth/"]').forEach(function(a){a.target='_blank';a.rel='noopener'});
});</script>`;
function rewrite(txt, isHtml) {
  let out = txt
    .replace(/(href|src|action)=(["'])\/(?!\/|zeuspost\/)/g, `$1=$2${PREFIX}/`)
    .replace(/(["'`])\/api(?=[\/"'`])/g, `$1${PREFIX}/api`)
    .replace(/(["'`])\/oauth\//g, `$1${PREFIX}/oauth/`)
    .replace(/(["'`])\/((?:dashboard|calendar|editor|bulk|connect|analytics|settings)\.html)/g, `$1${PREFIX}/$2`)
    // sair/401 do Automatik não pode limpar o localStorage da Central (mesma origem) nem cair no login antigo
    .replace(/localStorage\.clear\(\)/g, `localStorage.removeItem('zp_dirty')`)
    .replace(/location\.href\s*=\s*'\/'/g, `location.href='${PREFIX}/calendar.html'`);
  if (isHtml) out = out.replace(/<head[^>]*>/i, (m) => m + BOOT);
  return out;
}

function proxy(req, res, upstreamPath) {
  let token;
  try { token = serviceToken(); }
  catch (e) { return res.status(502).json({ error: 'Automatik Inst indisponível: ' + e.message }); }
  const headers = Object.assign({}, req.headers, {
    host: ZP_HOST + ':' + ZP_PORT,
    authorization: 'Bearer ' + token,
    'x-forwarded-for': (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString(),
    'accept-encoding': 'identity',
  });
  delete headers.cookie; // o cookie de sessão da Central não sai daqui
  const up = http.request({ host: ZP_HOST, port: ZP_PORT, method: req.method, path: upstreamPath, headers }, (ur) => {
    const h = Object.assign({}, ur.headers);
    // o Automatik proíbe iframe e restringe origem; dentro da Central o painel abre embutido na tela do agente
    delete h['x-frame-options']; delete h['content-security-policy']; delete h['cross-origin-opener-policy'];
    if (h.location && h.location.startsWith('/') && !h.location.startsWith(PREFIX + '/')) h.location = PREFIX + h.location;
    const type = String(h['content-type'] || '');
    const isHtml = type.includes('text/html');
    if (isHtml || type.includes('javascript')) {
      const chunks = [];
      ur.on('data', (c) => chunks.push(c));
      ur.on('end', () => {
        const body = Buffer.from(rewrite(Buffer.concat(chunks).toString('utf8'), isHtml), 'utf8');
        delete h['content-length']; delete h['transfer-encoding']; delete h.etag; delete h['last-modified'];
        h['content-length'] = body.length;
        h['cache-control'] = 'no-store';
        res.writeHead(ur.statusCode, h);
        res.end(body);
      });
    } else {
      res.writeHead(ur.statusCode, h);
      ur.pipe(res);
    }
  });
  up.setTimeout(15 * 60 * 1000); // publicar Reels na hora pode esperar o processamento da Meta
  up.on('error', (e) => { if (!res.headersSent) res.status(502).json({ error: 'Automatik Inst fora do ar: ' + e.message }); else res.end(); });
  req.pipe(up);
}

// Montar ANTES do express.json: o corpo (JSON e upload de mídia) precisa chegar intacto no Automatik.
function mount(app, requireAuth) {
  app.use(PREFIX, requireAuth, (req, res) => {
    // a raiz cai no painel nativo; as telas antigas seguem acessíveis por URL direta como reserva
    if (/^\/(index\.html)?(\?|$)/.test(req.url) || req.url === '') return res.redirect('/posts/index.html');
    proxy(req, res, req.url);
  });
  // mídias dos posts vêm da API como /uploads/arquivo
  app.use('/uploads', requireAuth, (req, res) => proxy(req, res, '/uploads' + req.url));
  // prévia de vídeo que o navegador não toca (HEVC/10-bit de iPhone): cópia H.264 leve só para ver na tela
  app.get('/api/zeuspost-previa', requireAuth, previaInfo);
  app.get('/api/zeuspost-previa/arquivo/:f', requireAuth, (req, res) => {
    const f = path.basename(String(req.params.f || ''));
    if (!/^[\w.-]+\.mp4$/.test(f)) return res.status(400).end();
    const p = path.join(PREVIA_DIR, f);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(p);
  });
}

// ─── Prévia de vídeo ──────────────────────────────────────────────────────────
// O arquivo original (o que vai para o Instagram) não é alterado; a cópia fica em data/previas-video/.
const { execFile } = require('child_process');
const UPLOADS_ZP = '/opt/jeff-apps/jeff-automatikinst/data/uploads';
const PREVIA_DIR = path.join(__dirname, 'data', 'previas-video');
const _codec = new Map(), _gerando = new Set(), _fila = [];
let _rodando = false;
const codecDe = p => new Promise(ok => {
  if (_codec.has(p)) return ok(_codec.get(p));
  execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt', '-of', 'csv=p=0', p], { timeout: 15000 }, (err, out) => {
    const v = err ? '' : String(out || '').trim(); _codec.set(p, v); ok(v);
  });
});
// toca no Chrome/Safari/Edge de qualquer máquina: H.264 8-bit 4:2:0
const tocaNoNavegador = c => /^h264,yuv420p$/.test(c);
function proximaPrevia() {
  if (_rodando || !_fila.length) return;
  _rodando = true;
  const { orig, dest } = _fila.shift(), tmp = dest + '.tmp.mp4';
  execFile('nice', ['-n', '10', 'ffmpeg', '-y', '-v', 'error', '-i', orig, '-vf', "scale='min(720,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp], { timeout: 10 * 60 * 1000 }, (err) => {
    try { if (!err) fs.renameSync(tmp, dest); else { fs.rmSync(tmp, { force: true }); console.error('[zeuspost] prévia falhou:', path.basename(orig), err.message); } } catch (_) {}
    _gerando.delete(dest); _rodando = false; proximaPrevia();
  });
}
async function previaInfo(req, res) {
  const u = String(req.query.u || '');
  const m = /^\/uploads\/([\w.-]+\.(?:mp4|mov|m4v))$/i.exec(u);
  if (!m) return res.status(400).json({ error: 'mídia inválida' });
  const orig = path.join(UPLOADS_ZP, path.basename(m[1]));
  if (!fs.existsSync(orig)) return res.json({ url: u }); // não está no disco local: deixa o navegador tentar o original
  const c = await codecDe(orig);
  if (!c || tocaNoNavegador(c)) return res.json({ url: u });
  const nome = path.basename(m[1]).replace(/\.[^.]+$/, '') + '.mp4', dest = path.join(PREVIA_DIR, nome);
  if (fs.existsSync(dest)) return res.json({ url: '/api/zeuspost-previa/arquivo/' + nome, previa: true, codec: c });
  if (!_gerando.has(dest)) { fs.mkdirSync(PREVIA_DIR, { recursive: true }); _gerando.add(dest); _fila.push({ orig, dest }); proximaPrevia(); }
  res.json({ gerando: true, codec: c });
}

// ─── Agendar um post pela API do Automatik (usado pela aprovação nas Equipes) ────────────────────────────────
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };
function zpCall(method, p, body, rawHeaders) {
  return new Promise((resolve, reject) => {
    const isBuf = Buffer.isBuffer(body);
    const data = body == null ? null : (isBuf ? body : Buffer.from(JSON.stringify(body)));
    const headers = Object.assign({ authorization: 'Bearer ' + serviceToken(), 'x-forwarded-for': 'central-aprovacao' },
      data && !isBuf ? { 'content-type': 'application/json' } : {}, rawHeaders || {}, data ? { 'content-length': data.length } : {});
    const req = http.request({ host: ZP_HOST, port: ZP_PORT, method, path: '/api' + p, headers }, (res) => {
      let out = ''; res.on('data', d => { out += d; });
      res.on('end', () => { let j; try { j = JSON.parse(out); } catch { j = { raw: out.slice(0, 2000) }; } if (res.statusCode >= 400) return reject(new Error(j.error || ('HTTP ' + res.statusCode))); resolve(j); });
    });
    req.setTimeout(5 * 60 * 1000, () => req.destroy(new Error('tempo esgotado')));
    req.on('error', reject);
    req.end(data || undefined);
  });
}
function zpUpload(abs) {
  if (!fs.existsSync(abs)) throw new Error('arquivo não existe: ' + path.basename(abs));
  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!mime) throw new Error('formato não aceito: ' + path.extname(abs));
  const bd = '----central' + Date.now().toString(16);
  const body = Buffer.concat([Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(abs).replace(/"/g, '')}"\r\nContent-Type: ${mime}\r\n\r\n`), fs.readFileSync(abs), Buffer.from(`\r\n--${bd}--\r\n`)]);
  return zpCall('POST', '/upload', body, { 'content-type': 'multipart/form-data; boundary=' + bd });
}
// criarPost({ arquivos: [caminho absoluto...], legenda, contas: [ids], quando: "AAAA-MM-DD HH:MM" (BRT) ou null (rascunho), tipo: feed|carousel|story|reel, titulo })
async function criarPost(o) {
  const arquivos = (o.arquivos || []).filter(Boolean);
  if (!arquivos.length) throw new Error('post sem mídia');
  const contas = (o.contas || []).map(x => parseInt(x, 10)).filter(Boolean);
  if (!contas.length) throw new Error('escolha a conta');
  const ups = []; for (const a of arquivos) ups.push(await zpUpload(a));
  const video = /^video/.test(ups[0].mimetype || '');
  let post_type = o.tipo === 'story' ? 'story' : o.tipo === 'reel' || video ? 'video' : (arquivos.length > 1 || o.tipo === 'carousel') ? 'carousel' : 'image';
  if (post_type === 'carousel' && (ups.length < 2 || ups.length > 10)) throw new Error('carrossel precisa de 2 a 10 imagens');
  let quando = null;
  if (o.quando) { const t = String(o.quando).trim().replace(' ', 'T'); if (isNaN(require('./aprovacao').dataBRT(t))) throw new Error('data inválida: ' + o.quando); if (require('./aprovacao').dataBRT(t) < new Date()) throw new Error('a data já passou: ' + o.quando); quando = t; }
  const body = { title: o.titulo || null, caption: post_type === 'story' ? '' : String(o.legenda || ''), media_path: post_type === 'carousel' ? JSON.stringify(ups.map(u => u.path)) : ups[0].path, media_type: video ? 'video' : 'image', post_type, platforms: ['instagram'], account_ids: contas, scheduled_at: quando };
  // Sequência de stories: os cards 2, 3 e 4 nascem do card 1 (a frase), então
  // stories da mesma conta no mesmo dia entram no mesmo grupo. Se o card 1
  // falhar na Meta, o ZEUS POST trava os seguintes em vez de publicar uma
  // sequência sem começo. O índice é definido lá pelo horário agendado.
  if (post_type === 'story' && quando) {
    const dia = require('./aprovacao').dataBRT(quando).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    body.seq_group = o.sequencia || `dia-${dia}-c${contas[0]}`;
  }
  if (post_type !== 'story' && !body.caption) throw new Error('legenda vazia');
  const r = await zpCall('POST', '/posts', body);
  return { id: r.id, status: quando ? 'scheduled' : 'draft', quando, midia: body.media_path, contas, post_type };
}
const excluirPost = id => zpCall('DELETE', '/posts/' + encodeURIComponent(id));
const contas = () => zpCall('GET', '/accounts');

module.exports = { mount, serviceToken, PREFIX, criarPost, excluirPost, contas };
