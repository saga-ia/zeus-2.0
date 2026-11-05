// Memória por pessoa: fatos duráveis que o ZEUS aprende nas conversas (meta, jeito preferido de resposta,
// contexto do trabalho) e que a própria pessoa pode editar na tela /memoria. Entra no prompt de toda conversa dela.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS memorias (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  texto TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'conversa',
  session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_user ON memorias(user_email, updated_at);
`);

const MAX_POR_PESSOA = 120;
const MAX_TEXTO = 400;
const newId = () => crypto.randomBytes(8).toString('base64url');
const norm = s => String(s || '').trim().toLowerCase();
const stmt = {
  lista: db.prepare(`SELECT * FROM memorias WHERE user_email = ? ORDER BY updated_at DESC`),
  get: db.prepare(`SELECT * FROM memorias WHERE id = ? AND user_email = ?`),
  ins: db.prepare(`INSERT INTO memorias (id, user_email, texto, origem, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  upd: db.prepare(`UPDATE memorias SET texto = ?, updated_at = ? WHERE id = ?`),
  del: db.prepare(`DELETE FROM memorias WHERE id = ? AND user_email = ?`),
  delTodas: db.prepare(`DELETE FROM memorias WHERE user_email = ?`),
  count: db.prepare(`SELECT COUNT(*) AS n FROM memorias WHERE user_email = ?`),
};
const out = m => ({ id: m.id, texto: m.texto, origem: m.origem, sessionId: m.session_id, createdAt: m.created_at, updatedAt: m.updated_at });

function limpa(t) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO); }
// Evita repetir a mesma memória (compara sem acento/caixa)
const chave = t => limpa(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w ]/g, '');
function adicionar(email, texto, origem, sessionId) {
  email = norm(email); texto = limpa(texto);
  if (!email || texto.length < 4) return null;
  const k = chave(texto);
  if (stmt.lista.all(email).some(m => chave(m.texto) === k)) return null;
  if (stmt.count.get(email).n >= MAX_POR_PESSOA) return null;
  const id = newId(), agora = Date.now();
  stmt.ins.run(id, email, texto, origem || 'conversa', sessionId || null, agora, agora);
  return out(stmt.get.get(id, email));
}

// Bloco que o ZEUS escreve na resposta quando aprende algo durável: ```zeus-memoria\n<fato>\n```
const RE_BLOCO = /```zeus-memoria\s*\n([\s\S]*?)```\s*/g;
// Salva o que veio nos blocos e devolve a resposta sem eles (com uma marca discreta do que foi guardado)
function extrair(email, texto, sessionId) {
  if (!email || !texto || texto.indexOf('zeus-memoria') < 0) return { texto, salvas: [] };
  const salvas = [];
  const limpo = texto.replace(RE_BLOCO, (_, corpo) => {
    corpo.split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).forEach(l => { const m = adicionar(email, l, 'conversa', sessionId); if (m) salvas.push(m.texto); });
    return '';
  }).trim();
  return { texto: salvas.length ? limpo + `\n\n_Guardei na sua memória: ${salvas.map(s => '"' + s + '"').join(', ')}._` : limpo, salvas };
}

// Texto que entra no prompt da conversa dessa pessoa (vazio se não houver memórias)
function paraPrompt(email) {
  const lista = email ? stmt.lista.all(norm(email)) : [];
  const instrucao = [
    '=== Memória (o que você sabe sobre esta pessoa) ===',
    lista.length ? lista.map(m => '- ' + m.texto).join('\n') : '(ainda vazia)',
    'Preferências de estilo visual (cores, layout de card/carrossel, motor de arte) que citam um perfil, marca ou cliente valem SÓ para ele: em arte de outra marca, de outro cliente ou sem marca definida, NÃO aplique esses padrões; crie um visual próprio para o pedido.',
    'Use isso para personalizar a resposta sem repetir de volta. Quando a pessoa contar algo DURÁVEL sobre ela ou o trabalho dela (meta, cargo, preferência de formato/tom, projeto em andamento, restrição), guarde escrevendo no FIM da resposta um bloco:',
    '```zeus-memoria', 'uma frase curta por linha, em terceira pessoa (ex.: "Prefere respostas em tópicos curtos")', '```',
    'Ao guardar preferência de arte ou de estilo, diga sempre a qual marca ou perfil ela se refere (ex.: "No @perfil, prefere card branco e preto"). Preferência visual sem marca não deve ser guardada.',
    'Não guarde dados sensíveis (senhas, documentos, saúde), nem fatos passageiros, nem o que já está na memória.',
    '=== Fim da memória ===',
  ].join('\n');
  return instrucao;
}

const router = express.Router();
router.use(express.json({ limit: '64kb' }));
const semCadastro = res => res.status(400).json({ error: 'Entre com seu e-mail para ter memória (a senha mestra não tem cadastro).' });
router.get('/', (req, res) => {
  if (!req.user.email) return res.json({ itens: [], semCadastro: true });
  res.json({ itens: stmt.lista.all(req.user.email).map(out), max: MAX_POR_PESSOA });
});
router.post('/', (req, res) => {
  if (!req.user.email) return semCadastro(res);
  const m = adicionar(req.user.email, (req.body || {}).texto, 'manual', null);
  if (!m) return res.status(400).json({ error: 'escreva uma memória (que ainda não exista) com pelo menos 4 caracteres' });
  res.json({ itens: stmt.lista.all(req.user.email).map(out) });
});
router.patch('/:id', (req, res) => {
  if (!req.user.email) return semCadastro(res);
  const m = stmt.get.get(req.params.id, req.user.email);
  if (!m) return res.status(404).json({ error: 'memória não encontrada' });
  const texto = limpa((req.body || {}).texto);
  if (texto.length < 4) return res.status(400).json({ error: 'texto muito curto' });
  stmt.upd.run(texto, Date.now(), m.id);
  res.json({ itens: stmt.lista.all(req.user.email).map(out) });
});
router.delete('/todas', (req, res) => { if (!req.user.email) return semCadastro(res); stmt.delTodas.run(req.user.email); res.json({ itens: [] }); });
router.delete('/:id', (req, res) => {
  if (!req.user.email) return semCadastro(res);
  stmt.del.run(req.params.id, req.user.email);
  res.json({ itens: stmt.lista.all(req.user.email).map(out) });
});

module.exports = { router, paraPrompt, extrair, adicionar };
