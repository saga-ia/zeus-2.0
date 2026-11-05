// Aprovação de posts propostos pela IA (bloco ```zeus-aprovacao no markdown de uma resposta ou entrega).
// Compartilhado pelas Equipes (teams.js) e pelo chat central (chat.js): a IA propõe imagem + legenda + conta + data,
// a pessoa aprova ou reprova na tela, e só a aprovação agenda no ZEUS POST, pelo servidor (a IA nunca grava sozinha).
const fs = require('fs');
const path = require('path');

// Lê os blocos ```zeus-aprovacao de um markdown → [{ bloco, titulo, itens: [{ id, imagens, legenda, conta, conta_nome, quando, tipo }] }]
function aprovacoesDe(md) {
  const out = []; let m, n = 0; const re = /```zeus-aprovacao\s*\n([\s\S]*?)```/g;
  while ((m = re.exec(String(md || '')))) {
    let d; try { d = JSON.parse(m[1]); } catch (_) { d = null; }
    const itens = d && Array.isArray(d.itens) ? d.itens : (Array.isArray(d) ? d : []);
    out.push({ bloco: n++, titulo: d && d.titulo ? String(d.titulo) : '', itens: itens.filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || ''), imagens: [].concat(x.imagens || x.imagem || []).map(String).filter(Boolean), legenda: String(x.legenda || ''),
      conta: x.conta == null ? '' : String(x.conta), conta_nome: String(x.conta_nome || ''), quando: String(x.quando || ''), tipo: String(x.tipo || 'feed') })) });
  }
  return out;
}
const temBloco = md => /```zeus-aprovacao/.test(String(md || ''));

// Só aceita imagens geradas pelo Agente de Design (/api/design/arquivo/<cid>/<nome>), resolvidas para o arquivo no disco
function arquivosDaProposta(item) {
  const design = require('./design');
  return item.imagens.map(u => {
    const m = /^(?:https?:\/\/[^/]+)?\/api\/design\/arquivo\/([\w-]+)\/((?:v\d+-s\d+-\w+|anexo-\d+)\.(?:png|jpe?g|webp))(?:[?#].*)?$/.exec(String(u).trim());
    if (!m) throw new Error('imagem fora do padrão do Agente de Design: ' + String(u).slice(0, 80));
    const p = path.join(design.dirCria(path.basename(m[1])), path.basename(m[2]));
    if (!fs.existsSync(p)) throw new Error('imagem não encontrada no servidor: ' + m[2]);
    return p;
  });
}

// "AAAA-MM-DD HH:MM" sem fuso é horário de Brasília: o servidor roda em outro fuso (CEST), então fixa -03:00
function dataBRT(q) {
  const t = String(q || '').trim().replace(' ', 'T');
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(t) || !/T\d{2}:\d{2}/.test(t) ? t : (t.length === 16 ? t + ':00' : t) + '-03:00');
}

// Valida a decisão e, se for aprovar, agenda no ZEUS POST. Devolve { quando, conta, post } ou lança erro legível.
async function agendar(blk, item, b) {
  const rotulo = item.id || 'post';
  const quando = String((b && b.quando) || item.quando || '').trim(), conta = String((b && b.conta) || item.conta || '').trim();
  if (!conta) throw new Error('escolha a conta do Instagram');
  if (!quando) throw new Error('informe data e hora da publicação');
  const dt = dataBRT(quando);
  if (isNaN(dt)) throw new Error('data inválida: ' + quando);
  if (dt < new Date()) throw new Error('a data já passou (' + dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '); escolha um horário futuro');
  const arquivos = arquivosDaProposta(item);
  const post = await require('./zeuspost').criarPost({ arquivos, legenda: item.legenda, contas: [conta], quando, tipo: item.tipo, titulo: (blk && blk.titulo ? blk.titulo + ' · ' : '') + rotulo });
  return { quando, conta, post, quandoBR: dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) };
}

// Texto que volta para a IA quando a pessoa reprova com motivo
const pedidoDeRefazer = (item, nota) => `Reprovei o ${item.id || 'post'}${item.conta_nome ? ' (' + item.conta_nome + ')' : ''}. Motivo: ${nota}\nRefaça esse post levando em conta o motivo (arte e/ou legenda) e devolva a nova proposta num bloco zeus-aprovacao, mantendo os demais posts como estavam.`;

// Resumo único do "Aprovar todos": um registro na conversa em vez de um por post. rows = aprovações gravadas do bloco
function resumoLote(blk, rows) {
  const ok = rows.filter(r => r.status === 'aprovado'), err = rows.filter(r => r.status === 'erro');
  const rot = r => (blk.itens[r.idx] && blk.itens[r.idx].id) || ('post ' + (r.idx + 1));
  const br = q => { const d = dataBRT(q); return isNaN(d) ? String(q || '') : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const linhas = ok.map(r => `- ${rot(r)}: #${r.post_id} para ${br(r.quando)}`).concat(err.map(r => `- ${rot(r)}: não agendado (${r.erro || 'erro'})`));
  return {
    usuario: `Aprovei todos os posts${blk.titulo ? ' de "' + blk.titulo + '"' : ''}.`,
    resposta: `${ok.length} de ${blk.itens.length} ${blk.itens.length === 1 ? 'post agendado' : 'posts agendados'} no ZEUS POST${err.length ? `, ${err.length} com erro` : ''}.\n\n${linhas.join('\n')}\n\nDá para ver e editar em Instagram › Posts › Calendário.`,
  };
}

module.exports = { resumoLote, dataBRT, aprovacoesDe, temBloco, arquivosDaProposta, agendar, pedidoDeRefazer };
