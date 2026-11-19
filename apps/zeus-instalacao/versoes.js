// Versões do Zeus e atualização dos servidores dos clientes.
//
// Fluxo: no servidor do Jeff,  bash /root/zeus-2.0/instalador/publicar.sh "o que mudou"  monta o pacote limpo
// (lib/pacote.py: só o que é produto, checagem de sigilo) em data/versoes/<v>.tar.gz e registra em data/versoes.json.
// Nada vai pros clientes até o Jeff aprovar em /admin/versoes (por cliente ou pra todos).
// Cada servidor de cliente tem um token (criado na instalação) e roda o cron instalador/atualizar.sh, que pergunta
// GET /atualizar/status, baixa GET /atualizar/pacote/<v> só se for a versão aprovada pra ele, aplica e manda
// POST /atualizar/relato com o resultado.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, 'data');
const DIR_V = path.join(DATA, 'versoes');
const ARQ_V = path.join(DATA, 'versoes.json');
const ARQ_C = path.join(DATA, 'clientes-zeus.json');

const ler = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return padrao; } };
function grava(f, obj) {
  const tmp = f + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, f);
}
const versoes = () => (ler(ARQ_V, { versoes: [] }).versoes || []).slice().sort((a, b) => b.v - a.v);
const clientes = () => ler(ARQ_C, {});
const hash = tk => crypto.createHash('sha256').update(String(tk)).digest('hex');
const pacoteDe = v => path.join(DIR_V, `${parseInt(v, 10)}.tar.gz`);

function ultima() {
  const v = versoes().find(x => fs.existsSync(pacoteDe(x.v)));
  return v ? Object.assign({ arquivo: pacoteDe(v.v) }, v) : null;
}

// Chamado pelo bootstrap da instalação: cria o cliente com a versão que está sendo instalada já aprovada
function registrar(nome, formId) {
  const u = ultima();
  const id = crypto.randomBytes(6).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  const cs = clientes();
  cs[id] = { id, nome: String(nome || 'cliente sem nome').slice(0, 120), form_id: formId || null, token_hash: hash(token),
    registrado_em: new Date().toISOString(), aprovada: u ? u.v : null, instalada: null, dominio: null, visto_em: null, relatos: [] };
  grava(ARQ_C, cs);
  return { id, token, versao: u ? u.v : null };
}

function clienteDoToken(req) {
  const tk = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!/^[a-f0-9]{64}$/.test(tk)) return null;
  const h = hash(tk);
  const cs = clientes();
  const c = Object.values(cs).find(x => x.token_hash && crypto.timingSafeEqual(Buffer.from(x.token_hash), Buffer.from(h)));
  return c ? { cs, c } : null;
}

async function rota(req, res, r, ip, h) {
  const json = (st, o) => h.enviar(res, st, 'application/json; charset=utf-8', JSON.stringify(o));
  if (h.limite('atualizar:' + ip, 120, 3600 * 1000)) return json(429, { erro: 'muitas chamadas' });
  const achado = clienteDoToken(req);
  if (!achado) { console.log(`[zeus-instalacao] /atualizar token inválido (${ip})`); return json(401, { erro: 'token inválido' }); }
  const { cs, c } = achado;

  if (r === '/atualizar/status' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    c.visto_em = new Date().toISOString(); c.ip = ip;
    if (/^\d+$/.test(q.get('instalada') || '')) c.instalada = parseInt(q.get('instalada'), 10);
    if (/^[a-z0-9.-]{3,120}$/.test(q.get('dominio') || '')) c.dominio = q.get('dominio');
    grava(ARQ_C, cs);
    const v = c.aprovada != null && versoes().find(x => x.v === c.aprovada);
    if (!v || !fs.existsSync(pacoteDe(v.v))) return json(200, { aprovada: null });
    return json(200, { aprovada: v.v, sha256: v.sha256, tam: v.tam, notas: v.notas });
  }
  const mp = /^\/atualizar\/pacote\/(\d+)$/.exec(r);
  if (mp && req.method === 'GET') {
    const v = parseInt(mp[1], 10);
    if (v !== c.aprovada || !fs.existsSync(pacoteDe(v))) return json(403, { erro: 'versão não aprovada pra este cliente' });
    const st = fs.statSync(pacoteDe(v));
    console.log(`[zeus-instalacao] cliente ${c.nome} baixando a versão ${v} (${ip})`);
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    return fs.createReadStream(pacoteDe(v)).pipe(res);
  }
  if (r === '/atualizar/relato' && req.method === 'POST') {
    let d;
    try { d = JSON.parse(await h.lerCorpo(req)); } catch (e) { return json(400, { erro: 'relato inválido' }); }
    const rel = { em: new Date().toISOString(), v: parseInt(d.v, 10) || null, ok: !!d.ok, msg: String(d.msg || '').slice(0, 4000) };
    c.relatos = [rel].concat(c.relatos || []).slice(0, 20);
    if (rel.ok && rel.v) c.instalada = rel.v;
    grava(ARQ_C, cs);
    console.log(`[zeus-instalacao] relato de ${c.nome}: v${rel.v} ${rel.ok ? 'ok' : 'FALHOU'} ${rel.msg.slice(0, 200)}`);
    return json(200, { ok: true });
  }
  return json(404, { erro: 'rota desconhecida' });
}

// ─── Admin ───────────────────────────────────────────────────────────────────────────
function tela(h, aviso) {
  const { esc, brt, moldura } = h;
  const vs = versoes();
  const cs = Object.values(clientes()).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const opcoes = sel => vs.map(v => `<option value="${v.v}"${v.v === sel ? ' selected' : ''}>v${v.v}</option>`).join('');
  const linhasV = vs.map(v => `<tr><td class="n"><b>v${v.v}</b></td><td class="n">${esc(brt(v.data))}</td><td>${esc(v.notas || '')}
${v.pendencias ? `<br><span class="pill at">${v.pendencias} pendência(s) de sigilo conhecidas</span>` : ''}</td>
<td class="n">${(v.tam / 1e6).toFixed(0)} MB</td>
<td><form method="post" action="/admin/versoes/aprovar" onsubmit="return confirm('Liberar a v${v.v} pra TODOS os clientes?')">
<input type="hidden" name="v" value="${v.v}"><input type="hidden" name="cliente" value="todos"><button type="submit">Aprovar pra todos</button></form></td></tr>`).join('');
  const linhasC = cs.map(c => {
    const ult = (c.relatos || [])[0];
    const sit = c.aprovada != null && c.aprovada !== c.instalada
      ? `<span class="pill at">aguardando v${c.aprovada}</span>` : (c.instalada != null ? '<span class="pill ok">em dia</span>' : '<span class="pill">sem contato</span>');
    return `<tr><td><b>${esc(c.nome)}</b><br><span style="color:var(--texto-3)">${esc(c.dominio || 'domínio ainda não informado')}</span></td>
<td class="n">${c.instalada != null ? 'v' + c.instalada : '—'}</td><td>${sit}</td>
<td class="n">${c.visto_em ? esc(brt(c.visto_em)) : '—'}</td>
<td>${ult ? `<span class="pill ${ult.ok ? 'ok' : 'at'}">v${ult.v} ${ult.ok ? 'aplicada' : 'falhou'}</span><br><span style="color:var(--texto-3);font-size:13px">${esc(brt(ult.em))}${ult.ok ? '' : ' · ' + esc(ult.msg.slice(0, 300))}</span>` : '—'}</td>
<td><form method="post" action="/admin/versoes/aprovar" class="acoes"><input type="hidden" name="cliente" value="${esc(c.id)}">
<select name="v" style="font:inherit;padding:8px;border-radius:8px;border:1px solid var(--linha);background:var(--card);color:var(--texto)">${opcoes(c.aprovada)}</select>
<button type="submit">Aprovar</button></form></td></tr>`;
  }).join('');
  return moldura('Versões · ZEUS', `<div class="topo"><h1>Versões do Zeus</h1><a class="bt" href="/admin">Respostas do formulário</a></div>
${aviso ? `<p style="margin:0;color:var(--ok);font-weight:600">${esc(aviso)}</p>` : ''}
<p style="margin:0;color:var(--texto-2)">Publique com <code>bash /root/zeus-2.0/instalador/publicar.sh "o que mudou"</code>. Um cliente só recebe a versão que você aprovar pra ele. O servidor confere a cada 15 minutos, aplica com cópia de segurança e volta sozinho se algum processo não subir.</p>
<div class="card"><h2 style="margin:0 0 8px;font:600 17px 'Space Grotesk',system-ui">Clientes</h2>
${cs.length ? `<table><thead><tr><th>Cliente</th><th>Instalada</th><th>Situação</th><th>Último contato (BRT)</th><th>Última atualização</th><th>Aprovar versão</th></tr></thead><tbody>${linhasC}</tbody></table>`
    : '<p class="vazio">Nenhum servidor registrado. Cada instalação nova feita pelo comando /instalar ou por um link aparece aqui sozinha.</p>'}</div>
<div class="card"><h2 style="margin:0 0 8px;font:600 17px 'Space Grotesk',system-ui">Versões publicadas</h2>
${vs.length ? `<table><thead><tr><th>Versão</th><th>Publicada (BRT)</th><th>O que mudou</th><th>Tamanho</th><th></th></tr></thead><tbody>${linhasV}</tbody></table>`
    : '<p class="vazio">Nenhuma versão publicada ainda.</p>'}</div>`);
}

async function admin(req, res, r, h) {
  const html = s => h.enviar(res, 200, 'text/html; charset=utf-8', s);
  if (r === '/admin/versoes' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams.get('ok');
    return html(tela(h, q ? `Aprovado: ${q}` : ''));
  }
  if (r === '/admin/versoes/aprovar' && req.method === 'POST') {
    const p = new URLSearchParams(await h.lerCorpo(req));
    const v = parseInt(p.get('v'), 10);
    const alvo = String(p.get('cliente') || '');
    if (!versoes().some(x => x.v === v) || !fs.existsSync(pacoteDe(v))) return html(tela(h, 'Versão não encontrada.'));
    const cs = clientes();
    const ids = alvo === 'todos' ? Object.keys(cs) : (cs[alvo] ? [alvo] : []);
    ids.forEach(id => { cs[id].aprovada = v; });
    grava(ARQ_C, cs);
    const nomes = ids.map(id => cs[id].nome).join(', ') || 'nenhum cliente';
    console.log(`[zeus-instalacao] admin aprovou v${v} pra ${nomes}`);
    return h.redir(res, '/admin/versoes?ok=' + encodeURIComponent(`v${v} pra ${nomes}`));
  }
  return null;
}

module.exports = { rota, registrar, ultima, admin, clienteDoToken };
