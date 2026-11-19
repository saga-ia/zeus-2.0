// Relatórios de diagnóstico dos servidores dos clientes (instalação e depois).
//
//   GET  /relatorio.sh   -> o coletor (instalador/relatorio.sh do repo), pra rodar com  curl -fsSL .../relatorio.sh | bash
//   POST /relatorio      -> recebe o texto (já filtrado de segredos no servidor do cliente). Com o token de atualização
//                           (Authorization: Bearer) fica na pasta do cliente; sem token vai pra "sem-token", com limite.
//   GET  /admin/relatorios, /admin/relatorios/<cliente>/<arquivo>  -> leitura (sessão do admin)
//
// Arquivos em data/relatorios/<cliente>/<AAAAMMDD-HHMMSS>-<rand>.txt (modo 600) e um índice em data/relatorios/indice.jsonl.
// O Claude lê direto do disco pra corrigir o instalador na fonte (/root/zeus-2.0/instalador).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, 'data', 'relatorios');
const INDICE = path.join(DIR, 'indice.jsonl');
const COLETOR = '/root/zeus-2.0/instalador/relatorio.sh';
const MAX = 1024 * 1024;
const NOME_OK = /^[a-z0-9-]{1,40}$/;
const ARQ_OK = /^\d{8}-\d{6}-[a-f0-9]{6}\.txt$/;

fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });

function lerTexto(req) {
  return new Promise((resolve, reject) => {
    let tam = 0; const partes = [];
    req.on('data', c => { tam += c.length; if (tam > MAX) { reject(new Error('grande demais')); req.destroy(); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function indice() {
  try {
    return fs.readFileSync(INDICE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { return []; }
}

async function rota(req, res, r, ip, h) {
  const json = (st, o) => h.enviar(res, st, 'application/json; charset=utf-8', JSON.stringify(o));
  if (r === '/relatorio.sh' && req.method === 'GET') {
    try { return h.enviar(res, 200, 'text/x-shellscript; charset=utf-8', fs.readFileSync(COLETOR)); }
    catch (e) { return h.enviar(res, 404, 'text/plain; charset=utf-8', 'echo "coletor indisponível"; exit 1\n'); }
  }
  if (r === '/relatorio/arquivos' && req.method === 'POST') return arquivos(req, res, ip, h, json);
  if (r !== '/relatorio' || req.method !== 'POST') return h.enviar(res, 404, 'text/plain; charset=utf-8', 'Não encontrado');

  const achado = require('./versoes').clienteDoToken(req);
  if (h.limite('relatorio:' + ip, achado ? 30 : 5, 3600 * 1000)) return json(429, { ok: false, erro: 'muitos relatórios, tente mais tarde' });
  let texto;
  try { texto = await lerTexto(req); } catch (e) { return json(413, { ok: false, erro: 'relatório grande demais' }); }
  if (!texto.trim()) return json(400, { ok: false, erro: 'relatório vazio' });

  const pasta = achado ? achado.c.id : 'sem-token';
  const agora = new Date();
  const p = agora.toISOString().replace(/[-:T]/g, '');
  const arq = `${p.slice(0, 8)}-${p.slice(8, 14)}-${crypto.randomBytes(3).toString('hex')}.txt`;
  fs.mkdirSync(path.join(DIR, pasta), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(DIR, pasta, arq), texto, { mode: 0o600 });
  const pega = k => ((new RegExp('^' + k + ':\\s*(.*)$', 'm').exec(texto) || [])[1] || '').slice(0, 200);
  const avisos = ((/===== avisos do instalador =====\n([\s\S]*?)\n=====/.exec(texto) || [])[1] || '').split('\n').filter(l => l && l !== '(nenhum)').length;
  const item = { em: agora.toISOString(), cliente: pasta, nome: achado ? achado.c.nome : null, arquivo: arq, ip, kb: Math.round(texto.length / 1024),
    dominio: pega('dominio'), versao: pega('versao_instalada'), nota: pega('nota'), avisos };
  fs.appendFileSync(INDICE, JSON.stringify(item) + '\n', { mode: 0o600 });
  console.log(`[zeus-instalacao] relatório ${pasta}/${arq} (${item.kb} KB, ${item.dominio || 'sem domínio'})`);
  return json(200, { ok: true, id: `${pasta}/${arq}` });
}

// Cópia dos arquivos de código mexidos no servidor do cliente (relatorio.sh --arquivos): tar.gz, só com o token
// do servidor, até 20 MB. Fica em data/relatorios/<cliente>/arquivos-<data>.tar.gz pro Claude levar a correção pro repo.
const MAX_ARQ = 20 * 1024 * 1024;
async function arquivos(req, res, ip, h, json) {
  const achado = require('./versoes').clienteDoToken(req);
  if (!achado) return json(401, { ok: false, erro: 'token inválido' });
  if (h.limite('arquivos:' + ip, 10, 3600 * 1000)) return json(429, { ok: false, erro: 'muitos envios' });
  const partes = []; let tam = 0;
  try {
    await new Promise((ok, falha) => {
      req.on('data', c => { tam += c.length; if (tam > MAX_ARQ) { falha(new Error('grande')); req.destroy(); } else partes.push(c); });
      req.on('end', ok); req.on('error', falha);
    });
  } catch (e) { return json(413, { ok: false, erro: 'grande demais (máx. 20 MB)' }); }
  const buf = Buffer.concat(partes);
  if (buf.length < 20 || buf[0] !== 0x1f || buf[1] !== 0x8b) return json(400, { ok: false, erro: 'esperava um tar.gz' });
  const pasta = achado.c.id;
  const p = new Date().toISOString().replace(/[-:T]/g, '');
  const arq = `arquivos-${p.slice(0, 8)}-${p.slice(8, 14)}-${crypto.randomBytes(3).toString('hex')}.tar.gz`;
  fs.mkdirSync(path.join(DIR, pasta), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(DIR, pasta, arq), buf, { mode: 0o600 });
  fs.appendFileSync(INDICE, JSON.stringify({ em: new Date().toISOString(), cliente: pasta, nome: achado.c.nome, arquivo: arq, ip,
    kb: Math.round(buf.length / 1024), dominio: '', versao: '', nota: 'arquivos de código (relatorio.sh --arquivos)', avisos: 0 }) + '\n', { mode: 0o600 });
  console.log(`[zeus-instalacao] arquivos ${pasta}/${arq} (${Math.round(buf.length / 1024)} KB)`);
  return json(200, { ok: true, id: `${pasta}/${arq}` });
}

// admin: devolve null se a rota não é daqui
async function admin(req, res, r, h) {
  if (r === '/admin/relatorios' && req.method === 'GET') {
    const itens = indice().reverse().slice(0, 200);
    const linhas = itens.map(i => `<tr><td>${h.esc(h.brt(i.em))}</td><td>${h.esc(i.nome || i.cliente)}</td><td>${h.esc(i.dominio)}</td>` +
      `<td>${h.esc(i.versao)}</td><td>${i.avisos}</td><td>${h.esc(i.nota)}</td>` +
      `<td><a href="/admin/relatorios/${h.esc(i.cliente)}/${h.esc(i.arquivo)}">abrir</a></td></tr>`).join('');
    return h.enviar(res, 200, 'text/html; charset=utf-8', h.moldura('Relatórios dos servidores',
      `<p><a href="/admin">← respostas</a></p><p>Enviados por <code>relatorio.sh</code> (sozinho no fim da instalação, ou à mão).</p>` +
      (linhas ? `<table><tr><th>Quando (BRT)</th><th>Cliente</th><th>Domínio</th><th>Versão</th><th>Avisos</th><th>Nota</th><th></th></tr>${linhas}</table>` : '<p>Nenhum relatório ainda.</p>')));
  }
  const m = /^\/admin\/relatorios\/([^/]+)\/([^/]+)$/.exec(r);
  if (m && req.method === 'GET' && NOME_OK.test(m[1]) && ARQ_OK.test(m[2])) {
    const f = path.join(DIR, m[1], m[2]);
    if (!fs.existsSync(f)) return h.redir(res, '/admin/relatorios');
    return h.enviar(res, 200, 'text/html; charset=utf-8', h.moldura('Relatório ' + m[1],
      `<p><a href="/admin/relatorios">← relatórios</a></p><pre style="white-space:pre-wrap;font-size:12px">${h.esc(fs.readFileSync(f, 'utf8'))}</pre>`));
  }
  return null;
}

module.exports = { rota, admin };
