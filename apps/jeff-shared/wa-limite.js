'use strict';
// Limite de WhatsApps conectados no Zeus (regra base, Jeferson 2026-11-17):
// no máximo 3 números por instalação, CONTANDO O PRÓPRIO ZEUS. Nada além disso.
//
// Quem ocupa vaga:
//   - Zeus (whatsapp-worker): 1 vaga fixa, sempre reservada.
//   - Evolution (números da Central): cada instância criada ocupa 1 vaga, conectada ou não.
//   - jeff-disparador: cada slot fora de 'idle' (conectando, QR, pronto).
//   - jeff-wa-relay: cada sessão que ele subiu.
// Quem for conectar um número novo chama estado() e só segue se livres > 0.
// Se não der pra contar (Evolution fora do ar etc.), a resposta é "não": o limite falha fechado.
//
// WA_LIMITE no .env só serve pra BAIXAR o limite; nunca passa de 3.

const fs = require('fs');
const { execFileSync } = require('child_process');

const TETO = 3;
const LIMITE = Math.max(1, Math.min(TETO, parseInt(process.env.WA_LIMITE || String(TETO), 10) || TETO));

const EVO_DIR = '/opt/jeff-apps/jeff-evolution';
const DISPARADOR_DB = '/opt/jeff-apps/jeff-disparador/data/disparador.db';
const RELAY_ENV = '/opt/jeff-apps/jeff-wa-relay/.env';

function lerEnv(arquivo) {
  const out = {};
  try {
    for (const l of fs.readFileSync(arquivo, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* sem arquivo */ }
  return out;
}

function evolutionConfig() {
  if (!fs.existsSync(EVO_DIR)) return null; // Evolution não instalada nesta máquina
  const env = lerEnv(EVO_DIR + '/.env');
  let url = process.env.EVOLUTION_URL || '';
  if (!url) {
    try {
      const m = fs.readFileSync(EVO_DIR + '/docker-compose.yml', 'utf8').match(/SERVER_URL=(\S+)/);
      if (m) url = m[1];
    } catch { /* sem compose */ }
  }
  const key = process.env.EVOLUTION_API_KEY || env.EVOLUTION_API_KEY || '';
  if (!url || !key) throw new Error('config da Evolution não encontrada');
  return { url: url.replace(/\/+$/, ''), key };
}

async function contarEvolution() {
  const cfg = evolutionConfig();
  if (!cfg) return { n: 0, itens: [] };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(cfg.url + '/instance/fetchInstances', { headers: { apikey: cfg.key }, signal: ctl.signal });
    if (!r.ok) throw new Error('Evolution respondeu ' + r.status);
    const lista = await r.json();
    if (!Array.isArray(lista)) throw new Error('resposta inesperada da Evolution');
    return { n: lista.length, itens: lista.map(i => ({ nome: i.name, status: i.connectionStatus })) };
  } finally { clearTimeout(t); }
}

function contarDisparador() {
  if (!fs.existsSync(DISPARADOR_DB)) return { n: 0, itens: [] };
  const out = execFileSync('sqlite3', [DISPARADOR_DB, "SELECT slot || ':' || status FROM agents WHERE status IS NOT NULL AND status <> 'idle';"],
    { encoding: 'utf8', timeout: 5000 }).trim();
  const itens = out ? out.split('\n') : [];
  return { n: itens.length, itens };
}

async function contarRelay() {
  const env = lerEnv(RELAY_ENV);
  if (!env.PORT) return { n: 0, itens: [] };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetch(`http://127.0.0.1:${env.PORT}/health`, { signal: ctl.signal });
    const j = await r.json();
    const itens = Object.keys((j && j.sessions) || {});
    return { n: itens.length, itens };
  } catch { return { n: 0, itens: [] }; } // relay parado = não ocupa vaga
  finally { clearTimeout(t); }
}

// ignorar: ['relay'] etc. pra quem está se contando (ex.: o relay no boot, antes de subir as sessões)
async function estado({ ignorar = [] } = {}) {
  const partes = { zeus: { n: 1, itens: ['whatsapp-worker'] } };
  partes.evolution = ignorar.includes('evolution') ? { n: 0, itens: [] } : await contarEvolution();
  partes.disparador = ignorar.includes('disparador') ? { n: 0, itens: [] } : contarDisparador();
  partes.relay = ignorar.includes('relay') ? { n: 0, itens: [] } : await contarRelay();
  const usados = Object.values(partes).reduce((s, p) => s + p.n, 0);
  return { limite: LIMITE, usados, livres: Math.max(0, LIMITE - usados), partes };
}

function mensagemLimite(e) {
  return `Limite de ${e.limite} WhatsApps conectados atingido (o Zeus conta como 1). ` +
    `Para conectar outro número, exclua um dos que já estão cadastrados.`;
}

module.exports = { LIMITE, TETO, estado, mensagemLimite };

if (require.main === module) {
  estado().then(e => console.log(JSON.stringify(e, null, 2))).catch(err => { console.error('ERRO:', err.message); process.exit(1); });
}
