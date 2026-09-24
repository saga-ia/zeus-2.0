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

module.exports = { CLAUDE_BIN, DEFAULT_MODEL, EFFORT, EFFORT_LIGHT, MCP_ENABLED, claudeEnv, commonArgs, agentDefaultModel, pickModel };
