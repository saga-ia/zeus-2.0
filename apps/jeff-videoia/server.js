// Editor de vídeo com IA (videoia.jefersonhenrike.com). Tela no estilo DaVinci/CapCut: mídias, prévia ao vivo
// (Remotion Player no navegador, mesmo componente do render), inspetor, chat com a IA e linha do tempo.
// Login: mesmas pessoas da Central, só Proprietário/Admin. Detalhes em README.md.
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const auth = require('./lib/auth');
const P = require('./lib/projetos');
const ia = require('./lib/ia');

const PORT = +process.env.PORT || 3092;
const HOST = process.env.HOST || '172.17.0.1'; // só a rede do Docker: o NPM chega, a internet não
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback, uniquelocal');

const PUB = path.join(__dirname, 'public');
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'same-origin'); next(); });
app.get('/login', (_req, res) => res.sendFile(path.join(PUB, 'login.html')));
app.get(['/favicon.svg', '/estilo.css'], (req, res) => res.sendFile(path.join(PUB, req.path)));
app.post('/api/login', express.json({ limit: '10kb' }), auth.login);
app.post('/api/sair', auth.sair);

// tudo daqui pra baixo exige sessão
app.use((req, res, next) => {
  req.user = auth.usuario(req);
  if (req.user) return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/midia/')) return res.status(401).json({ erro: 'sessão expirada' });
  res.redirect('/login');
});

app.get('/api/eu', (req, res) => {
  let livre = null; try { const s = fs.statfsSync(P.ESTUDIO); livre = s.bavail * s.bsize; } catch (_) {}
  res.json({ nome: req.user.nome, email: req.user.email, discoLivre: livre });
});

const projetoOu404 = (req, res) => { const p = P.ler(req.params.id); if (!p) { res.status(404).json({ erro: 'projeto não encontrado' }); return null; } return p; };

app.get('/api/projetos', (_req, res) => res.json(P.lista().map(p => ({ id: p.id, nome: p.nome, atualizado: p.atualizado, midias: p.midias.length,
  duracao: p.midias.reduce((s, m) => s + (m.duracao || 0), 0), tarefa: p.tarefa, capa: p.midias[0] ? `/midia/${p.id}/quadros/${p.midias[0].nome.replace(/\.mp4$/, '')}/00001.jpg` : null }))));
app.post('/api/projetos', express.json(), (req, res) => res.json(P.criar(req.body && req.body.nome)));
app.get('/api/projetos/:id', (req, res) => { const p = projetoOu404(req, res); if (p) res.json({ ...p, props: P.lerProps(p.id) }); });
app.patch('/api/projetos/:id', express.json(), (req, res) => {
  const p = P.atualiza(req.params.id, x => { if (typeof req.body.nome === 'string') x.nome = req.body.nome.slice(0, 80) || x.nome; });
  p ? res.json(p) : res.status(404).end();
});
app.delete('/api/projetos/:id', (req, res) => res.json({ ok: P.apagar(req.params.id) }));

// edição feita na mão (linha do tempo, inspetor, texto): grava direto
app.put('/api/projetos/:id/props', express.json({ limit: '20mb' }), (req, res) => {
  const p = projetoOu404(req, res); if (!p) return;
  const b = req.body; if (!b || !Array.isArray(b.clipes)) return res.status(400).json({ erro: 'edição inválida' });
  P.gravarProps(p.id, b); res.json({ ok: true });
});

// upload: até 2 GB por arquivo, direto pro disco
const subir = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => cb(null, path.join(P.dir(req.params.id), 'originais')),
    filename: (_req, f, cb) => cb(null, `orig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${(f.originalname || 'video').replace(/[^\w.-]+/g, '-').slice(-50)}`),
  }),
  limits: { fileSize: 2 * 1024 ** 3, files: 10 },
  fileFilter: (_req, f, cb) => cb(null, /^(video|audio)\//.test(f.mimetype) || /\.(mp4|mov|m4v|mkv|webm|avi|mp3|m4a|wav)$/i.test(f.originalname)),
});
app.post('/api/projetos/:id/midias', (req, res) => {
  const p = projetoOu404(req, res); if (!p) return;
  if (p.tarefa && !p.tarefa.erro) return res.status(409).json({ erro: 'ainda processando o vídeo anterior' });
  subir.array('arquivos', 10)(req, res, (err) => {
    if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ erro: err.code === 'LIMIT_FILE_SIZE' ? 'arquivo maior que 2 GB' : err.message });
    if (!req.files || !req.files.length) return res.status(400).json({ erro: 'nenhum vídeo recebido' });
    const cortar = String((req.body || {}).cortar) !== '0';
    P.processar(p.id, req.files.map(f => ({ caminho: f.path, nomeOriginal: f.originalname })), cortar);
    res.json({ ok: true });
  });
});

// IA: roda em segundo plano (o proxy corta resposta depois de 90 s); a tela consulta /ia/estado até terminar
const pedidosIA = new Map(); // id do projeto -> { estado: 'trabalhando'|'pronto'|'erro', inicio, resposta, props, versao, erro }
app.post('/api/projetos/:id/ia', express.json({ limit: '200kb' }), (req, res) => {
  const p = projetoOu404(req, res); if (!p) return;
  const pedido = String((req.body || {}).pedido || '').trim().slice(0, 4000);
  if (!pedido) return res.status(400).json({ erro: 'escreva o que quer mudar' });
  const atual = pedidosIA.get(p.id);
  if (atual && atual.estado === 'trabalhando') return res.status(409).json({ erro: 'a IA ainda está trabalhando no pedido anterior' });
  const props = P.lerProps(p.id); if (!props || !(props.clipes || []).length) return res.status(400).json({ erro: 'suba um vídeo primeiro' });
  const job = { estado: 'trabalhando', inicio: Date.now(), pedido };
  pedidosIA.set(p.id, job);
  ia.pedir({ pedido, props, cursor: +req.body.cursor || 0, selecionado: Number.isInteger(req.body.selecionado) ? req.body.selecionado : null,
    midias: p.midias, historico: Array.isArray(req.body.historico) ? req.body.historico : [] })
    .then((r) => {
      let novo = null, versao = null;
      if (r.props) {
        novo = ia.validar(r.props, P.lerProps(p.id) || props, p.midias);
        versao = P.guardarVersao(p.id, 'antes de: ' + pedido);
        P.gravarProps(p.id, novo);
      }
      console.log(`[videoia] ia ${p.id} ${r.ms} ms US$ ${(r.custo || 0).toFixed(3)} ${novo ? 'mudou' : 'sem mudança'}`);
      Object.assign(job, { estado: 'pronto', resposta: r.resposta, props: novo, versao });
    })
    .catch((e) => Object.assign(job, { estado: 'erro', erro: e.message }));
  res.json({ ok: true });
});
app.get('/api/projetos/:id/ia/estado', (req, res) => {
  const j = pedidosIA.get(req.params.id);
  if (!j) return res.json({ estado: 'nenhum' });
  if (j.estado !== 'trabalhando') pedidosIA.delete(req.params.id); // entregue uma vez
  res.json({ ...j, segundos: Math.round((Date.now() - j.inicio) / 1000) });
});

app.get('/api/projetos/:id/versoes', (req, res) => { const p = projetoOu404(req, res); if (p) res.json(P.versoes(p.id)); });
app.post('/api/projetos/:id/versoes/:vid/restaurar', (req, res) => {
  const p = projetoOu404(req, res); if (!p) return;
  const props = P.restaurarVersao(p.id, req.params.vid); props ? res.json({ props }) : res.status(404).json({ erro: 'versão não encontrada' });
});

app.post('/api/projetos/:id/exportar', express.json(), (req, res) => {
  const p = projetoOu404(req, res); if (!p) return;
  const t = req.body && Array.isArray(req.body.trecho) && req.body.trecho.length === 2 && req.body.trecho[1] > req.body.trecho[0] ? req.body.trecho.map(Number) : null;
  try { res.json(P.exportar(p.id, { trecho: t, rascunho: !!(req.body && req.body.rascunho), nome: req.body && req.body.nome })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

// mídia do projeto (com Range, pra busca no player): prévia, fontes, ondas, quadros, saídas
app.get('/midia/:id/*', (req, res) => {
  const p = P.ler(req.params.id); if (!p) return res.status(404).end();
  const rel = path.normalize(req.params[0]).replace(/^(\.\.(\/|$))+/, '');
  let base;
  if (rel.startsWith('prev/') || /^video\d+\.mp4$/.test(rel)) base = P.pub(p.id);
  else if (/^(ondas|quadros|saidas)\//.test(rel)) base = P.dir(p.id);
  else return res.status(404).end();
  const f = path.join(base, rel);
  if (!f.startsWith(base + path.sep) || !fs.existsSync(f)) return res.status(404).end();
  if (rel.startsWith('saidas/') && req.query.baixar) {
    const ex = (p.exportacoes || []).find(e => rel === `saidas/${e.id}.mp4`);
    return res.download(f, `${(p.nome + '-' + (ex ? ex.nome : 'video')).replace(/[^\w-]+/g, '-')}.mp4`);
  }
  res.sendFile(f, { maxAge: rel.startsWith('quadros/') || rel.startsWith('ondas/') ? '1d' : 0 });
});

app.use(express.static(PUB, { index: false }));
app.get(['/', '/p/:id'], (_req, res) => res.sendFile(path.join(PUB, 'index.html')));

app.listen(PORT, HOST, () => console.log(`[videoia] ouvindo em ${HOST}:${PORT}`));
