// Opções comuns pra subir o `claude -p` da central (chat, equipes, criar com IA).
// Objetivo: resposta rápida. Três decisões medidas em 23/09/2026 (mesma pergunta real no ClickUp):
//   - esforço "high" herdado do ambiente: 48s / 10 turnos; "medium": 23s / 3 turnos; "low": 19s / 2 turnos.
//   - 15 servidores MCP (168 ferramentas) sobem em toda mensagem: +3 a 4s de partida e ~15k tokens por turno.
//     Os agentes usam os scripts em Bash (clickup.sh, asaas.sh, google.sh...), então os MCPs ficam desligados.
//   - Opus por padrão em todos os agentes do catálogo: Sonnet responde na metade do tempo.
// Tudo configurável por variável de ambiente (ecosystem.config.js) sem mexer no código.
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'central.db');

const CLAUDE_BIN = process.env.CLAUDE_BIN || '/root/.nvm/versions/node/v20.20.2/bin/claude';
const DEFAULT_MODEL = process.env.CENTRAL_CHAT_MODEL || 'opus';           // Zeus principal (chat da home e Conversas)
const AGENT_DEFAULT_MODEL = process.env.CENTRAL_AGENT_MODEL || 'sonnet';  // agentes do catálogo sem modelo marcado na tela
const EFFORT = process.env.CENTRAL_CHAT_EFFORT || 'medium';               // chat e equipes
const EFFORT_LIGHT = process.env.CENTRAL_LIGHT_EFFORT || 'low';           // widget assistente, enriquecer prompt, criar com IA
const MCP_ENABLED = process.env.CENTRAL_MCP === '1';                      // '1' volta a carregar os servidores MCP da conta

// O PM2 pode ter sido reiniciado de dentro de uma sessão do Claude Code: aí o processo herda CLAUDE_EFFORT=high,
// CLAUDECODE=1 e afins, e cada `claude -p` filho pensa que é uma sessão aninhada. Limpa antes de subir.
function claudeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === 'CLAUDECODE' || k === 'CLAUDE_EFFORT' || k === 'CLAUDE_PID' || k === 'CLAUDE_AGENT_SDK_VERSION' || k.startsWith('CLAUDE_CODE_')) continue;
    env[k] = v;
  }
  return env;
}

// Flags comuns: esforço explícito e MCPs desligados (salvo CENTRAL_MCP=1).
function commonArgs(opts) {
  opts = opts || {};
  const args = ['--effort', opts.light ? EFFORT_LIGHT : EFFORT];
  if (!MCP_ENABLED) args.push('--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}');
  return args;
}

// Modelo padrão dos agentes do catálogo: preferência salva em Configurações > "Modelo padrão", senão Sonnet.
function agentDefaultModel() {
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    try {
      const r = db.prepare(`SELECT data FROM config_kv WHERE section = 'prefs'`).get();
      const m = r && JSON.parse(r.data).modeloPadrao;
      if (m === 'opus' || m === 'sonnet' || m === 'haiku') return m;
    } finally { db.close(); }
  } catch (_) {}
  return AGENT_DEFAULT_MODEL;
}

// Modelo final de uma conversa: o marcado no agente > padrão dos agentes; sem agente é o Zeus principal.
function pickModel(agentModel, isAgent) {
  if (agentModel) return agentModel;
  return isAgent ? agentDefaultModel() : DEFAULT_MODEL;
}

// Quem não é Proprietário/Admin usa o Claude sem terminal, sem arquivos do servidor e sem buscar URLs:
// o `claude -p` roda como root nesta máquina, então com essas ferramentas qualquer pessoa leria .env, bancos e tokens.
// Conversa, análise, base de conhecimento (vai no prompt), anexos (vão no prompt) e pesquisa web continuam.
const MEMBRO_BLOQUEADAS = ['Bash', 'BashOutput', 'KillBash', 'KillShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'NotebookRead',
  'Glob', 'Grep', 'LS', 'Agent', 'Task', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'TaskStop', 'Monitor',
  'CronCreate', 'CronList', 'CronDelete', 'ScheduleWakeup', 'WebFetch'];
const restrito = (user) => !!(user && !user.admin);
// Um único --disallowedTools com o que já era bloqueado (extra) + o bloqueio de membro
function bloqueio(user, extra) {
  const set = new Set(extra || []);
  if (!restrito(user)) return set.size ? ['--disallowedTools', [...set].join(' ')] : [];
  // Membro: lista PERMITIDA (só pesquisa web), não lista de bloqueio: ferramentas novas do Claude
  // (Workflow, SendMessage, RemoteTrigger...) já ficam de fora. Sem as configurações e o CLAUDE.md do
  // usuário root: carrega só o contexto da plataforma (projeto).
  MEMBRO_BLOQUEADAS.forEach((t) => set.add(t));
  const tools = set.has('WebSearch') ? '' : 'WebSearch';
  return ['--tools', tools, '--setting-sources', 'project,local', '--disallowedTools', [...set].join(' ')];
}

// Erro do `claude -p` nunca chega cru pra quem usa (12/10/2026: "Your organization has disabled Claude subscription
// access..." foi gravado no chat e entregue por WhatsApp em 6 rotinas). Problema de conta/assinatura/limite vira
// PLANO_VENCIDO; qualquer outra falha vira FALHA_GERAL. Nunca cita o Claude, nunca sai em inglês.
const PLANO_VENCIDO = 'Seu plano está vencido. Por favor, renove com o Jeferson.';
const FALHA_GERAL = 'Não consegui concluir agora. Tente de novo em alguns minutos.';
const CONTA_RE = /subscription access|organization has disabled|anthropic api key|invalid api key|not logged in|please run \/login|oauth token|authentication_error|credit balance|hit your .*limit|usage limit|weekly limit|rate limit reached|billing|plan (has )?expired/i;
// texto: o que o claude devolveu (ou o stderr); falhou: o processo terminou com erro (exit != 0, is_error, sem saída).
// Devolve a mensagem em PT-BR que deve substituir o texto, ou null quando é uma resposta normal.
function falhaClaude(texto, falhou) {
  const t = String(texto || '').trim();
  // Resposta normal curta que menciona "billing" etc. não pode virar erro: sem falha, só conta se for curta
  if ((falhou || t.length < 600) && CONTA_RE.test(t)) return PLANO_VENCIDO;
  return falhou ? FALHA_GERAL : null;
}
// Atalho pros spawns em --output-format text (lá o erro da conta sai no stdout com exit 1)
function checaSaida(out, err, code) {
  const falhou = code !== 0 || !String(out || '').trim();
  const ruim = falhaClaude(falhou ? `${out || ''}\n${err || ''}` : out, falhou);
  if (ruim) console.error(`[claude] falha (exit ${code}): ${String((out || '') + ' ' + (err || '')).trim().slice(-300)}`);
  return ruim;
}

module.exports = { restrito, bloqueio, MEMBRO_BLOQUEADAS, CLAUDE_BIN, DEFAULT_MODEL, EFFORT, EFFORT_LIGHT, MCP_ENABLED, claudeEnv, commonArgs, agentDefaultModel, pickModel,
  PLANO_VENCIDO, FALHA_GERAL, falhaClaude, checaSaida };
