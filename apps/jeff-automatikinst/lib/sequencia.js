// Trava de sequência + aviso de falha no WhatsApp.
//
// Problema que isso resolve: nos stories em sequência, o card 1 é a frase e os
// cards 2, 3 e 4 só fazem sentido depois dela. Se o card 1 falha na Meta e os
// outros sobem, o perfil publica uma sequência sem começo e ninguém entende.
//
// Regra: um post com seq_group e seq_index > 1 só publica se TODOS os índices
// anteriores do mesmo grupo estiverem 'published'. Se algum não estiver, o post
// vira 'blocked' (não publica, não falha) e o Jeff é avisado no telefone.
// Quando o card 1 é publicado depois, os irmãos travados com horário ainda no
// futuro voltam sozinhos pra 'scheduled'; os que já venceram ficam travados e
// o aviso diz que precisa reagendar à mão.
const { execFile } = require('child_process');

const WAPI = '/opt/jeff-worker/scripts/wapi.sh';
const AVISAR = (process.env.ZP_AVISO_WHATSAPP || '5511910075450').split(',').map(s => s.trim()).filter(Boolean);
const JANELA_AVISO_MS = 10 * 60 * 1000; // não repete o mesmo aviso dentro de 10 min

const _avisado = new Map();

function avisar(texto) {
  const agora = Date.now();
  const chave = texto.slice(0, 120);
  if (agora - (_avisado.get(chave) || 0) < JANELA_AVISO_MS) return;
  _avisado.set(chave, agora);
  for (const fone of AVISAR) {
    const body = JSON.stringify({ to: fone, body: texto });
    execFile('bash', [WAPI, 'POST', '/messages/private', body], { timeout: 30000 }, (err) => {
      if (err) console.error('[sequencia] aviso no WhatsApp falhou para ' + fone + ':', err.message);
    });
  }
}

const horaBR = (epoch) => new Date((epoch || 0) * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const nomeDe = (p) => p.title || ('post ' + p.id);

// Irmãos do mesmo grupo, em ordem de sequência.
function irmaos(db, seqGroup) {
  return db.prepare(`SELECT id, title, status, seq_index, scheduled_at FROM posts
    WHERE seq_group = ? ORDER BY COALESCE(seq_index, 999), scheduled_at`).all(seqGroup);
}

// Reordena os índices do grupo pelo horário agendado: o post mais cedo do dia
// é sempre o card 1. Chamado quando um post entra no grupo ou muda de horário,
// então a ordem de criação não importa.
function renumerar(db, seqGroup) {
  if (!seqGroup) return;
  const itens = db.prepare(`SELECT id FROM posts WHERE seq_group = ? ORDER BY scheduled_at, id`).all(seqGroup);
  const upd = db.prepare('UPDATE posts SET seq_index = ? WHERE id = ?');
  db.transaction(() => itens.forEach((p, i) => upd.run(i + 1, p.id)))();
}

// Grupo de sequência padrão: stories da mesma conta no mesmo dia em Brasília.
// É o formato que o backfill usou, então posts antigos e novos convivem.
function grupoDoDia(epochSeg, contaId) {
  const dia = new Date(epochSeg * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `dia-${dia}-c${contaId}`;
}

// Retorna o post anterior que impede a publicação, ou null se está liberado.
function travadoPor(db, post) {
  if (!post.seq_group || !(post.seq_index > 1)) return null;
  return db.prepare(`SELECT id, title, status, seq_index FROM posts
    WHERE seq_group = ? AND seq_index < ? AND status <> 'published'
    ORDER BY seq_index LIMIT 1`).get(post.seq_group, post.seq_index) || null;
}

// Trava os posts seguintes do grupo que ainda não foram publicados.
function travarSeguintes(db, post, motivo) {
  if (!post.seq_group) return [];
  const alvos = db.prepare(`SELECT id, title, seq_index FROM posts
    WHERE seq_group = ? AND COALESCE(seq_index, 0) > ? AND status IN ('scheduled','draft')
    ORDER BY seq_index`).all(post.seq_group, post.seq_index || 0);
  for (const a of alvos) {
    db.prepare(`UPDATE posts SET status = 'blocked', updated_at = unixepoch() WHERE id = ?`).run(a.id);
    console.log(`[sequencia] post ${a.id} (${nomeDe(a)}) travado: ${motivo}`);
  }
  return alvos;
}

// Depois que um post do grupo publica: devolve pra fila os irmãos travados que
// ainda têm horário no futuro.
function destravarSeguintes(db, post) {
  if (!post.seq_group) return { voltaram: [], perdidos: [] };
  const agora = Math.floor(Date.now() / 1000);
  // seq_group vai no SELECT porque travadoPor() depende dele pra checar os
  // cards anteriores: sem ele, um card destravaria por cima de um irmão travado.
  const travados = db.prepare(`SELECT id, title, seq_group, seq_index, scheduled_at FROM posts
    WHERE seq_group = ? AND COALESCE(seq_index, 0) > ? AND status = 'blocked'
    ORDER BY seq_index`).all(post.seq_group, post.seq_index || 0);
  const voltaram = [], perdidos = [];
  for (const t of travados) {
    // só destrava se tudo antes dele já está publicado
    if (travadoPor(db, t)) continue;
    if (t.scheduled_at && t.scheduled_at > agora) {
      db.prepare(`UPDATE posts SET status = 'scheduled', updated_at = unixepoch() WHERE id = ?`).run(t.id);
      voltaram.push(t);
    } else {
      perdidos.push(t);
    }
  }
  if (voltaram.length) console.log(`[sequencia] ${voltaram.length} post(s) destravado(s) no grupo ${post.seq_group}`);
  return { voltaram, perdidos };
}

// Chamado pelo scheduler ANTES de publicar. true = pode seguir.
function liberado(db, post) {
  const bloqueador = travadoPor(db, post);
  if (!bloqueador) return true;
  db.prepare(`UPDATE posts SET status = 'blocked', updated_at = unixepoch() WHERE id = ?`).run(post.id);
  const extras = travarSeguintes(db, post, 'card anterior não publicado');
  console.warn(`[sequencia] post ${post.id} (${nomeDe(post)}) NÃO publicado: o card ${bloqueador.seq_index} do grupo está ${bloqueador.status}`);
  avisar(`🔒 ZEUS POST travou a sequência\n\n${nomeDe(post)} (${horaBR(post.scheduled_at)}) não foi publicado porque o card ${bloqueador.seq_index} da sequência está ${bloqueador.status === 'failed' ? 'com falha' : bloqueador.status}: ${nomeDe(bloqueador)}.\n\n${extras.length ? `Mais ${extras.length} post(s) do mesmo dia também ficaram travados.\n\n` : ''}Resolve o card 1 primeiro. Depois os travados com horário futuro voltam sozinhos pra fila.`);
  return false;
}

// Chamado pelo scheduler DEPOIS de publicar, com o resultado.
function aposPublicar(db, post, results) {
  const falhas = (results || []).filter(r => r.status === 'failed');
  if (falhas.length) {
    const travados = travarSeguintes(db, post, 'este card falhou');
    avisar(`❌ ZEUS POST: falha na publicação\n\n${nomeDe(post)}\nHorário: ${horaBR(post.scheduled_at)}\nTipo: ${post.post_type}\nErro da Meta: ${falhas.map(f => f.error).join(' | ').slice(0, 300)}\n\n${travados.length ? `🔒 ${travados.length} post(s) seguinte(s) da sequência foram travados e NÃO vão ao ar.` : 'Não havia post seguinte na sequência.'}\n\nPainel: https://central.jefersonhenrike.com/posts/index.html`);
    return;
  }
  const { voltaram, perdidos } = destravarSeguintes(db, post);
  if (voltaram.length || perdidos.length) {
    avisar(`✅ ZEUS POST: sequência retomada\n\n${nomeDe(post)} publicado.\n${voltaram.length ? `${voltaram.length} post(s) travado(s) voltaram pra fila.\n` : ''}${perdidos.length ? `⚠️ ${perdidos.length} post(s) seguem travados porque o horário já passou: ${perdidos.map(p => nomeDe(p)).join(', ')}. Reagende à mão se ainda quiser publicar.` : ''}`);
  }
}

module.exports = { liberado, aposPublicar, travadoPor, travarSeguintes, destravarSeguintes, irmaos, avisar, renumerar, grupoDoDia };
