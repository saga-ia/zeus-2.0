// Formulário de instalação do ZEUS (zeus-instalacao.jefersonhenrike.com).
// Serve a página (public/index.html, lida a cada request: editar o HTML não exige restart) e guarda cada envio
// em data/respostas/<id>.json com modo 600. Admin em /admin com senha (hash scrypt em data/config.json,
// gerado por setup.js). Sem dependências. Escuta só no gateway do Docker (172.17.0.1), atrás do NPM.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3071', 10);
const HOST = process.env.HOST || '172.17.0.1';
const PAGINA = path.join(__dirname, 'public', 'index.html');
const DATA = path.join(__dirname, 'data');
const RESP = path.join(DATA, 'respostas');
const CONF = path.join(DATA, 'config.json');
const LIMITE_BODY = 300 * 1024;
const SESSAO_MS = 12 * 3600 * 1000;

fs.mkdirSync(RESP, { recursive: true, mode: 0o700 });
if (!fs.existsSync(CONF)) { console.error('[zeus-instalacao] falta data/config.json: rode node setup.js'); process.exit(1); }
const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));

const sessoes = new Map();
const tentativas = new Map();
function limite(chave, max, janelaMs) {
  const agora = Date.now();
  const lista = (tentativas.get(chave) || []).filter(t => agora - t < janelaMs);
  lista.push(agora);
  tentativas.set(chave, lista);
  return lista.length > max;
}
setInterval(() => {
  const agora = Date.now();
  for (const [k, exp] of sessoes) if (exp < agora) sessoes.delete(k);
  for (const [k, l] of tentativas) if (!l.some(t => agora - t < 3600 * 1000)) tentativas.delete(k);
}, 10 * 60 * 1000).unref();

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brt = iso => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ipDe = req => String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
const SEGURANCA = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' };

function enviar(res, status, tipo, corpo, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': tipo }, SEGURANCA, extra || {}));
  res.end(corpo);
}
const json = (res, status, obj) => enviar(res, status, 'application/json; charset=utf-8', JSON.stringify(obj));
const redir = (res, para, extra) => enviar(res, 303, 'text/plain; charset=utf-8', '', Object.assign({ Location: para }, extra || {}));

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tam = 0; const partes = [];
    req.on('data', c => { tam += c.length; if (tam > LIMITE_BODY) { reject(new Error('grande demais')); req.destroy(); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function senhaOk(senha) {
  const h = crypto.scryptSync(String(senha || ''), Buffer.from(conf.salt, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(conf.hash, 'hex'));
}
function logado(req) {
  const m = /(?:^|;\s*)zi_s=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return !!(m && sessoes.get(m[1]) > Date.now());
}

function listar() {
  return fs.readdirSync(RESP).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(RESP, f), 'utf8')); } catch (e) { return null; }
  }).filter(Boolean).sort((a, b) => b.recebido_em.localeCompare(a.recebido_em));
}
const ID_OK = /^[0-9]{8}-[0-9]{6}-[a-f0-9]{6}$/;

function moldura(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titulo)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600&family=Space+Grotesk:wght@600;700&display=swap">
<style>
:root{--roxo:#673DE6;--fundo:#F6F6F7;--card:#FFFFFF;--linha:#E6E6EA;--texto:#17171A;--texto-2:#3C3C44;--texto-3:#66666F;--ok:#0F7A68;--atencao:#9A6700;--erro:#C0341C;color-scheme:light}
@media (prefers-color-scheme: dark){:root{--roxo:#9B7BFF;--fundo:#121215;--card:#1B1B20;--linha:#2E2E36;--texto:#F1F1F4;--texto-2:#C9C9D2;--texto-3:#9A9AA6;--ok:#4FC9B0;--atencao:#E2B54F;--erro:#F07A64;color-scheme:dark}}
body{margin:0;background:var(--fundo);color:var(--texto);font:15px/1.5 "DM Sans",system-ui,sans-serif;padding:32px max(16px,env(safe-area-inset-left,0px))}
.w{max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
h1{font:700 26px/1.2 "Space Grotesk",system-ui,sans-serif;margin:0}
.topo{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--linha);border-radius:12px;padding:20px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--linha);vertical-align:top}
th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--texto-3);font-weight:600}
td.n{font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--texto-2)}
a{color:var(--roxo)}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;border:1px solid var(--linha)}
.pill.ok{color:var(--ok)}.pill.at{color:var(--atencao)}
button,.bt{font:600 14px "DM Sans",system-ui,sans-serif;border-radius:8px;padding:9px 16px;cursor:pointer;border:1px solid var(--linha);background:var(--card);color:var(--texto);text-decoration:none;display:inline-block}
button.pri{background:var(--roxo);border-color:var(--roxo);color:#fff}
button.perigo{color:var(--erro);border-color:var(--erro)}
pre{white-space:pre-wrap;word-break:break-word;font:13.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0}
input[type=password]{font:inherit;padding:10px 12px;border:1px solid var(--linha);border-radius:8px;background:var(--fundo);color:var(--texto);width:100%;box-sizing:border-box}
.vazio{color:var(--texto-3)}
.acoes{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.msg{font-size:14px;color:var(--erro)}
</style></head><body><div class="w">${corpo}</div></body></html>`;
}

function telaLogin(erro) {
  return moldura('Admin · Instalação ZEUS', `<h1>Respostas de instalação</h1>
<form class="card" method="post" action="/admin/login" style="max-width:380px;display:flex;flex-direction:column;gap:12px">
<label for="senha" style="font-weight:600">Senha</label>
<input type="password" id="senha" name="senha" autocomplete="current-password" autofocus required>
${erro ? `<p class="msg">${esc(erro)}</p>` : ''}
<button class="pri" type="submit">Entrar</button></form>`);
}

function telaLista() {
  const itens = listar();
  const linhas = itens.map(r => {
    const d = r.dados || {}; const f = (r.faltando || []).length;
    return `<tr><td class="n">${esc(brt(r.recebido_em))}</td><td><b>${esc(d.empresa || '(sem empresa)')}</b><br><span style="color:var(--texto-3)">${esc(d.nome)}</span></td>
<td class="n">${esc(d.whats)}</td><td>${f ? `<span class="pill at">${f} em aberto</span>` : '<span class="pill ok">completo</span>'}</td>
<td><a href="/admin/r/${esc(r.id)}">Abrir</a></td></tr>`;
  }).join('');
  return moldura('Admin · Instalação ZEUS', `<div class="topo"><h1>Respostas de instalação</h1>
<form method="post" action="/admin/sair"><button type="submit">Sair</button></form></div>
<div class="card">${itens.length ? `<table><thead><tr><th>Recebido (BRT)</th><th>Empresa</th><th>WhatsApp</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
    : '<p class="vazio">Nenhum envio ainda. Quando um cliente enviar o formulário em zeus-instalacao.jefersonhenrike.com, ele aparece aqui.</p>'}</div>`);
}

function telaDetalhe(r) {
  const d = r.dados || {};
  return moldura(`${d.empresa || 'Envio'} · Instalação ZEUS`, `<div class="topo"><h1>${esc(d.empresa || '(sem empresa)')}</h1><a class="bt" href="/admin">Voltar</a></div>
<p style="margin:0;color:var(--texto-2)">Recebido em ${esc(brt(r.recebido_em))} (BRT) · ${esc(d.nome)} · ${esc(d.whats)} · ${esc(d.email)}</p>
<div class="card"><pre id="resumo">${esc(r.resumo)}</pre></div>
<div class="acoes"><button type="button" class="pri" id="copiar">Copiar resumo</button><span id="st" style="font-size:14px;color:var(--ok)"></span></div>
<form class="card acoes" method="post" action="/admin/r/${esc(r.id)}/apagar">
<label><input type="checkbox" name="confirmo" value="1" required> Já cadastrei as chaves no servidor do cliente</label>
<button type="submit" class="perigo">Apagar este envio</button></form>
<script>document.getElementById('copiar').onclick=function(){var t=document.getElementById('resumo').textContent,s=document.getElementById('st');
navigator.clipboard.writeText(t).then(function(){s.textContent='Copiado.'},function(){s.textContent='Selecione o texto e copie.'})}</script>`);
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const rota = url.pathname;
    const ip = ipDe(req);

    if (req.method === 'GET' && (rota === '/' || rota === '/index.html')) {
      return enviar(res, 200, 'text/html; charset=utf-8', fs.readFileSync(PAGINA));
    }

    if (req.method === 'POST' && rota === '/api/enviar') {
      if (limite('envio:' + ip, 20, 3600 * 1000)) return json(res, 429, { ok: false, erro: 'muitos envios, tente mais tarde' });
      let corpo;
      try { corpo = JSON.parse(await lerCorpo(req)); } catch (e) { return json(res, 400, { ok: false, erro: 'envio inválido' }); }
      const d = corpo && corpo.dados;
      if (!d || typeof d !== 'object' || Array.isArray(d) || !d.nome || !d.empresa) return json(res, 400, { ok: false, erro: 'faltou nome ou empresa' });
      const agora = new Date();
      const p = agora.toISOString().replace(/[-:T]/g, '');
      const id = `${p.slice(0, 8)}-${p.slice(8, 14)}-${crypto.randomBytes(3).toString('hex')}`;
      const registro = {
        id, recebido_em: agora.toISOString(), ip, ua: String(req.headers['user-agent'] || '').slice(0, 300),
        dados: d, resumo: String(corpo.resumo || '').slice(0, 100000),
        faltando: Array.isArray(corpo.faltando) ? corpo.faltando.slice(0, 100).map(String) : []
      };
      fs.writeFileSync(path.join(RESP, id + '.json'), JSON.stringify(registro, null, 2), { mode: 0o600 });
      console.log(`[zeus-instalacao] envio ${id} empresa="${String(d.empresa).slice(0, 80)}"`);
      return json(res, 200, { ok: true });
    }

    if (rota === '/admin/login' && req.method === 'POST') {
      if (limite('login:' + ip, 10, 15 * 60 * 1000)) return enviar(res, 429, 'text/html; charset=utf-8', telaLogin('Muitas tentativas. Espere 15 minutos.'));
      const senha = new URLSearchParams(await lerCorpo(req)).get('senha');
      if (!senhaOk(senha)) return enviar(res, 401, 'text/html; charset=utf-8', telaLogin('Senha incorreta.'));
      const tk = crypto.randomBytes(32).toString('hex');
      sessoes.set(tk, Date.now() + SESSAO_MS);
      return redir(res, '/admin', { 'Set-Cookie': `zi_s=${tk}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSAO_MS / 1000}` });
    }

    if (rota === '/admin' || rota.startsWith('/admin/')) {
      if (!logado(req)) return enviar(res, 200, 'text/html; charset=utf-8', telaLogin());
      if (rota === '/admin' && req.method === 'GET') return enviar(res, 200, 'text/html; charset=utf-8', telaLista());
      if (rota === '/admin/sair' && req.method === 'POST') {
        const m = /(?:^|;\s*)zi_s=([a-f0-9]{64})/.exec(req.headers.cookie || '');
        if (m) sessoes.delete(m[1]);
        return redir(res, '/admin', { 'Set-Cookie': 'zi_s=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
      }
      const m = /^\/admin\/r\/([^/]+)(\/apagar)?$/.exec(rota);
      if (m && ID_OK.test(m[1])) {
        const arq = path.join(RESP, m[1] + '.json');
        if (!fs.existsSync(arq)) return redir(res, '/admin');
        if (!m[2] && req.method === 'GET') return enviar(res, 200, 'text/html; charset=utf-8', telaDetalhe(JSON.parse(fs.readFileSync(arq, 'utf8'))));
        if (m[2] && req.method === 'POST') {
          if (new URLSearchParams(await lerCorpo(req)).get('confirmo') !== '1') return redir(res, '/admin/r/' + m[1]);
          fs.unlinkSync(arq);
          console.log(`[zeus-instalacao] envio ${m[1]} apagado pelo admin`);
          return redir(res, '/admin');
        }
      }
    }

    enviar(res, 404, 'text/plain; charset=utf-8', 'Não encontrado');
  } catch (e) {
    console.error('[zeus-instalacao] erro', e.message);
    if (!res.headersSent) enviar(res, 500, 'text/plain; charset=utf-8', 'Erro interno');
  }
});

servidor.listen(PORT, HOST, () => console.log(`[zeus-instalacao] ouvindo em http://${HOST}:${PORT}`));
