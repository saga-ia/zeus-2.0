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
}

module.exports = { mount, serviceToken, PREFIX };
