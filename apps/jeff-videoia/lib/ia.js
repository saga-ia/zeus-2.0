// IA do editor: recebe o pedido em português + a edição atual + onde está o cursor, e devolve a edição nova.
// Roda `claude -p` SEM ferramentas (nada de terminal, arquivos ou internet): só lê o que mandamos e devolve JSON.
// O servidor confere tudo antes de gravar (clipes dentro do vídeo, campos conhecidos) e guarda uma versão antes.
const { spawn } = require('child_process');

const CLAUDE = process.env.CLAUDE_BIN || '/root/.nvm/versions/node/v20.20.2/bin/claude';
const MODELO = process.env.VIDEOIA_MODELO || 'sonnet';
const ESFORCO = process.env.VIDEOIA_ESFORCO || 'medium';

const SISTEMA = `Você é o editor de vídeo com IA do Zeus. A pessoa está numa tela de edição (prévia ao vivo, linha do tempo) e te pede mudanças em português.
A edição é um JSON ("props") que um componente Remotion pronto desenha. Você devolve o JSON inteiro já alterado (sem o campo "palavras") e uma resposta curta.

REFERÊNCIA DO PROPS
- Tempos de clipes[].de/ate em segundos do vídeo ORIGINAL (fonte). "em" (impactos, zooms) em segundos do vídeo FINAL.
- formato "9:16"|"4:5"|"1:1"|"16:9" · fps 30
- clipes: [{ video, de, ate, zoom?: "auto"|"nenhum"|"entrar"|"sair"|"soco"|número, foco?: [x,y] (0-1), volume? (1 = normal) }]. Tocam em sequência, nessa ordem.
- legenda: { ativa, maxPalavras (2-3), maxCaracteres (22), posicao (fração da altura, 0.68), tamanho (92), fonte "Anton"|"Montserrat", cor, corAtiva (cor da palavra falada, null = sem), caixaAlta, contorno (10), fundo (cor ou null) }
- destaque: { cor, palavras: ["boi", "big mac"], escala (1.18) }  palavras ditas que ganham a cor de destaque
- impactos: [{ texto, palavra | em, ocorrencia?, duracao (1), posicao (0.4), cor?, tamanho (150) }]  texto grande na tela
- zooms: [{ palavra | em, ocorrencia?, duracao (1.2), escala (1.25) }]  mergulho pontual
- zoom: { modo "alternado"|"suave"|"nenhum", intensidade (1.12) }  movimento de câmera padrão dos clipes
- foco [x,y] do rosto · transicao "corte"|"flash" · enquadramento "preencher"|"conter"
- cobrir { y, altura } | null  desfoca uma faixa (ex: legenda já queimada no vídeo original)
- gancho { texto, duracao, modo "sobre"|"tela", posicao } | null  texto de abertura · cta { texto, duracao, posicao } | null  chamada no fim
- trilha { arquivo, volume, inicio } | null · barraProgresso (bool) · volumeVoz (1)

COMO DECIDIR
- "aqui", "agora", "nesse ponto" = o CURSOR (tempo no vídeo final). Use o mapa de clipes pra achar o clipe e o tempo na fonte.
- Cortar um trecho dentro de um clipe = dividir em dois clipes (de..inicio_do_trecho e fim_do_trecho..ate). Use os tempos das palavras.
- Cortar uma frase/palavra: corte na fronteira entre palavras (meio do espaço entre a anterior e a seguinte), nunca no meio de uma palavra.
- "Tira a parte repetida" / take refeito: fique com o último take, apague o anterior.
- Reels/versão curta: escolha os clipes mais fortes (gancho no começo, ideia completa, final com fechamento), mantendo a ordem lógica.
- Mude SÓ o que foi pedido. Todo o resto do JSON volta igual. Nunca invente vídeo que não está em "videos".
- Se for só pergunta ou não der pra fazer com o props (ex: trocar o fundo, gerar imagem), responda e devolva "props": null.
- resposta: 1 a 3 frases, português do Brasil, direto, dizendo o que mudou (com tempos mm:ss do vídeo final quando ajudar). Sem travessão.`;

const ESQUEMA = {
  type: 'object',
  properties: { resposta: { type: 'string' }, props: { anyOf: [{ type: 'object' }, { type: 'null' }] } },
  required: ['resposta', 'props'],
};

const mmss = (s) => { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

// mapa da linha do tempo: cada clipe com tempo final, tempo na fonte e o que é dito (palavras com tempo perto do cursor)
function mapa(props, cursor, selecionado) {
  const fps = props.fps || 30;
  let t = props.gancho && props.gancho.modo === 'tela' ? (props.gancho.duracao ?? 1.5) : 0;
  const linhas = [];
  (props.clipes || []).forEach((c, i) => {
    const dur = Math.max(1 / fps, c.ate - c.de), ini = t, fim = t + dur; t = fim;
    const ws = ((props.palavras || {})[c.video] || []).filter(w => (w.inicio + w.fim) / 2 >= c.de && (w.inicio + w.fim) / 2 <= c.ate);
    const perto = (cursor >= ini - 3 && cursor <= fim + 3) || i === selecionado;
    const texto = perto ? ws.map(w => `${w.texto}[${w.inicio.toFixed(2)}-${w.fim.toFixed(2)}]`).join(' ') : ws.map(w => w.texto).join(' ');
    linhas.push(`#${i} ${c.video} fonte ${c.de.toFixed(2)}-${c.ate.toFixed(2)}s | final ${mmss(ini)}-${mmss(fim)}${i === selecionado ? ' | SELECIONADO' : ''}${cursor >= ini && cursor < fim ? ' | CURSOR AQUI' : ''}\n   ${texto || '(sem fala)'}`);
  });
  return { texto: linhas.join('\n'), total: t };
}

function pedir({ pedido, props, cursor, selecionado, midias, historico }) {
  const semPalavras = { ...props }; delete semPalavras.palavras;
  const m = mapa(props, cursor || 0, selecionado);
  const conversa = (historico || []).slice(-6).map(h => `${h.quem === 'eu' ? 'Pessoa' : 'Você'}: ${h.texto}`).join('\n');
  const entrada = `VIDEOS: ${midias.map(x => `${x.nome} (${x.duracao.toFixed(1)} s, ${x.largura}x${x.altura})`).join(', ')}
DURAÇÃO FINAL ATUAL: ${mmss(m.total)} · CURSOR: ${mmss(cursor || 0)}${selecionado != null ? ` · CLIPE SELECIONADO: #${selecionado}` : ''}

MAPA DOS CLIPES (palavras com [início-fim na fonte] perto do cursor e no selecionado):
${m.texto}

PROPS ATUAL (sem "palavras"):
${JSON.stringify(semPalavras)}
${conversa ? `\nCONVERSA ATÉ AQUI:\n${conversa}\n` : ''}
PEDIDO: ${pedido}`;

  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!(k === 'CLAUDECODE' || k === 'CLAUDE_EFFORT' || k.startsWith('CLAUDE_CODE_'))) env[k] = v;
  const args = ['-p', '--model', MODELO, '--effort', ESFORCO, '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence', '--output-format', 'json', '--system-prompt', SISTEMA, '--json-schema', JSON.stringify(ESQUEMA)];
  return new Promise((ok, falha) => {
    const ch = spawn(CLAUDE, args, { cwd: '/tmp', env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const limite = setTimeout(() => { ch.kill('SIGTERM'); }, 240000);
    ch.stdout.on('data', d => out += d); ch.stderr.on('data', d => err += d);
    ch.on('error', falha);
    ch.on('close', () => {
      clearTimeout(limite);
      let j; try { j = JSON.parse(out); } catch (_) { return falha(new Error('a IA não respondeu (' + (err || out).trim().slice(-200) + ')')); }
      if (j.is_error || !j.structured_output) return falha(new Error('a IA falhou: ' + String(j.result || err).slice(0, 200)));
      ok({ ...j.structured_output, custo: j.total_cost_usd, ms: j.duration_ms });
    });
    ch.stdin.end(entrada);
  });
}

// confere o que a IA devolveu antes de gravar
function validar(novo, atual, midias) {
  if (!novo || typeof novo !== 'object' || Array.isArray(novo)) throw new Error('edição inválida');
  const dur = Object.fromEntries(midias.map(m => [m.nome, m.duracao]));
  if (!Array.isArray(novo.clipes)) throw new Error('a edição veio sem clipes');
  novo.clipes = novo.clipes.filter(c => c && dur[c.video] !== undefined).map(c => {
    const de = Math.max(0, Math.min(+c.de || 0, dur[c.video])), ate = Math.max(0, Math.min(+c.ate || 0, dur[c.video]));
    return { ...c, de: +de.toFixed(3), ate: +ate.toFixed(3) };
  }).filter(c => c.ate - c.de >= 0.1);
  if (!novo.clipes.length) throw new Error('a IA tirou todos os clipes; nada foi mudado');
  novo.palavras = atual.palavras || {};
  novo.fps = atual.fps || 30;
  return novo;
}

module.exports = { pedir, validar };
