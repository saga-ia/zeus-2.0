// Título-resumo das conversas (lista de Conversas). Antes o título era o começo da 1ª mensagem ("Zeus, eu vou mandar..."),
// que na lista estreita não diz nada. Depois da 1ª resposta, o Haiku resume a conversa em 3 a 6 palavras.
// Rotina não passa pelo Haiku: vira "Rotina: <nome> · dd/mm", porque toda execução tem o mesmo nome.
// Só troca título automático (começo da 1ª mensagem ou "Nova conversa"); título mudado à mão fica.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const claudeSpawn = require('./claude-spawn');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
const CLAUDE_BIN = process.env.CLAUDE_BIN || '/root/.nvm/versions/node/v20.20.2/bin/claude';

const st = {
  sess: db.prepare(`SELECT id, title, created_at FROM sessions WHERE id = ?`),
  primeiras: db.prepare(`SELECT role, content FROM messages WHERE session_id = ? AND status = 'done' ORDER BY created_at LIMIT 2`),
  titulo: db.prepare(`UPDATE sessions SET title = ? WHERE id = ?`),
};

const dataBRT = (ms) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const limpar = (t) => String(t || '').replace(/\[Habilidade: [^\]]*\]\s*/g, '').replace(/\s+/g, ' ').trim();

// Título ainda é o automático? (começo da 1ª mensagem, "Nova conversa" ou rotina sem data)
function automatico(sess, primeira) {
  const t = String(sess.title || '').trim();
  if (!t || t === 'Nova conversa') return true;
  if (/^Rotina: /.test(t)) return !/ · \d{2}\/\d{2}$/.test(t);
  // o título automático é o começo cru da mensagem (com espaços duplos etc.), então compara cortando antes de limpar
  return !!primeira && [String(primeira).trim().slice(0, 60), limpar(primeira).slice(0, 60)].some(x => limpar(x) === limpar(t));
}

function haiku(prompt) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--model', 'haiku', '--tools', '', ...claudeSpawn.commonArgs({ light: true })];
    let out = '', proc;
    try { proc = spawn(CLAUDE_BIN, args, { cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() }); }
    catch (_) { return resolve(''); }
    const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 60000);
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', (code) => { clearTimeout(t); resolve(claudeSpawn.checaSaida(out, '', code) ? '' : out); });
    proc.on('error', () => { clearTimeout(t); resolve(''); });
  });
}

// Gera e grava o título. Devolve o título novo ou null (nada mudou).
async function gerar(sid) {
  const sess = st.sess.get(sid); if (!sess) return null;
  const [u, z] = st.primeiras.all(sid);
  const primeira = u && u.role === 'user' ? u.content : '';
  if (!automatico(sess, primeira)) return null;
  if (/^Rotina: /.test(sess.title || '')) {
    let nome = String(sess.title).replace(/\s*\([^)]*\)?\s*$/, '').trim();   // tira "(6/dia)" ou "(6/" cortado
    if (nome.length > 48) nome = nome.slice(0, 48).replace(/\s+\S*$/, '');
    const novo = `${nome} · ${dataBRT(sess.created_at)}`;
    st.titulo.run(novo, sid); return novo;
  }
  if (!primeira || !z || z.role !== 'zeus') return null;
  const resp = await haiku(`Crie um título curto (3 a 6 palavras, no máximo 40 caracteres) em português do Brasil que resuma o assunto desta conversa, para aparecer numa lista de conversas. Diga o assunto concreto (perfil, cliente, tarefa), não "Pedido de ajuda". Sem aspas, sem ponto final, sem emoji, sem travessão. Responda só o título.

Mensagem da pessoa: ${limpar(primeira).slice(0, 700)}
Resposta do Zeus: ${limpar(z.content).slice(0, 500)}`);
  let t = String(resp).split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
  t = t.replace(/^(t[íi]tulo:\s*)/i, '').replace(/^["'“”*#\s]+|["'“”*.\s]+$/g, '').replace(/\s*[—–]\s*/g, ': ').trim();
  if (t.length < 3 || t.length > 60 || /erro|error|claude/i.test(t)) return null;
  // a pessoa pode ter renomeado enquanto o Haiku pensava
  const agora = st.sess.get(sid); if (!agora || agora.title !== sess.title) return null;
  st.titulo.run(t, sid);
  return t;
}

// Fila: 1 de cada vez, sem travar a resposta do chat
const fila = []; let rodando = false;
function agendar(sid, aoTerminar) {
  fila.push([sid, aoTerminar]);
  if (rodando) return;
  rodando = true;
  (async () => {
    while (fila.length) {
      const [id, cb] = fila.shift();
      try { const t = await gerar(id); if (t && cb) cb(t); } catch (e) { console.error('[titulos]', e.message); }
    }
    rodando = false;
  })();
}

// Conversas antigas com título automático (rodar uma vez: node titulos.js --antigas)
async function antigas() {
  const ids = db.prepare(`SELECT id FROM sessions ORDER BY updated_at DESC`).all().map(r => r.id);
  let n = 0;
  for (const id of ids) { const t = await gerar(id); if (t) { n++; console.log(`${id}  ${t}`); } }
  return n;
}

module.exports = { gerar, agendar, antigas, automatico };

if (require.main === module && process.argv.includes('--antigas')) {
  antigas().then(n => { console.log(`${n} conversa(s) renomeada(s)`); process.exit(0); });
}
