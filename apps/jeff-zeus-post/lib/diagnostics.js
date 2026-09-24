// Diagnóstico da conexão com a Meta.
// Em vez de "não funciona", diz exatamente QUAL elo está quebrado e o que
// fazer pra consertar. Interroga a própria Graph API — nada aqui é chute.
const axios = require('axios');
const { getDb } = require('../db');
const { getSetting } = require('./settings');
const { open } = require('./crypto');

const GRAPH = 'https://graph.facebook.com/v19.0';

// Escopos exigidos pra publicar e ler métricas
const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement'
];

function check(ok, title, detail, fix) {
  return { ok, title, detail, fix: ok ? null : fix };
}

async function diagnoseMeta() {
  const db = getDb();
  const steps = [];
  const appId = getSetting('meta_app_id');
  const appSecret = getSetting('meta_app_secret');

  // === 1. Credenciais do app ===
  if (!appId || !appSecret) {
    steps.push(check(false, 'Credenciais do app Meta',
      `App ID ${appId ? 'configurado' : 'FALTANDO'} · App Secret ${appSecret ? 'configurado' : 'FALTANDO'}`,
      'Vá em Configurações e preencha App ID e App Secret, copiados de developers.facebook.com → seu app → Configurações → Básico.'));
    return { ok: false, steps, accounts: [] };
  }
  steps.push(check(true, 'Credenciais do app Meta', `App ID ${appId} configurado`, null));

  // === 2. As credenciais são válidas? ===
  const appToken = `${appId}|${appSecret}`;
  try {
    await axios.get(`${GRAPH}/${appId}`, { params: { fields: 'id,name', access_token: appToken } });
    steps.push(check(true, 'App Secret confere', 'A Meta aceitou o par App ID + App Secret.', null));
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    steps.push(check(false, 'App Secret confere', `A Meta rejeitou: ${msg}`,
      'O App Secret está errado ou é de outro app. Copie de novo em developers.facebook.com → seu app → Configurações → Básico → Mostrar Chave Secreta.'));
    return { ok: false, steps, accounts: [] };
  }

  // === 3. Contas conectadas ===
  const accounts = db.prepare(`SELECT id, platform_username, ig_business_id, page_id, access_token, token_expires_at, status
    FROM social_accounts WHERE platform = 'instagram'`).all();

  if (!accounts.length) {
    steps.push(check(false, 'Contas do Instagram conectadas', 'Nenhuma conta conectada ainda.',
      'Use "Conectar Instagram" ou "Importar via BM (Meta)" nesta mesma tela. Se o botão Conectar não retorna nada, o motivo mais comum é o app estar em Modo de Desenvolvimento e seu usuário não estar em App Roles → Testadores.'));
    return { ok: false, steps, accounts: [] };
  }
  steps.push(check(true, 'Contas do Instagram conectadas', `${accounts.length} conta(s) no sistema.`, null));

  // === 4. Diagnóstico por conta ===
  const accountReports = [];
  for (const a of accounts) {
    const rep = { id: a.id, username: a.platform_username, checks: [] };
    const token = open(a.access_token);

    if (!token) {
      rep.checks.push(check(false, 'Token legível', 'O token guardado não pôde ser descriptografado.',
        'A chave de criptografia (data/.encryption-key) mudou ou se perdeu. Reconecte esta conta.'));
      accountReports.push(rep);
      continue;
    }

    // 4a. Token válido + escopos concedidos
    try {
      const dbg = await axios.get(`${GRAPH}/debug_token`, {
        params: { input_token: token, access_token: appToken }
      });
      const d = dbg.data.data || {};
      if (!d.is_valid) {
        rep.checks.push(check(false, 'Token válido', 'A Meta diz que o token expirou ou foi revogado.',
          'Reconecte a conta em "Conectar Instagram".'));
      } else {
        const expira = d.expires_at ? new Date(d.expires_at * 1000).toLocaleDateString('pt-BR') : 'sem expiração';
        rep.checks.push(check(true, 'Token válido', `Ativo · expira em ${expira}`, null));
      }

      const scopes = d.scopes || [];
      const faltando = REQUIRED_SCOPES.filter(s => !scopes.includes(s));
      rep.checks.push(faltando.length
        ? check(false, 'Permissões concedidas', `Faltam: ${faltando.join(', ')}`,
            'Reautorize clicando em "Corrigir permissões agora" e marque TODAS as contas na tela do Facebook. Se instagram_content_publish não aparece nem reautorizando, o app precisa desse produto adicionado em developers.facebook.com → seu app → Produtos.')
        : check(true, 'Permissões concedidas', 'Todas as permissões necessárias estão no token.', null));

      // 4b. A permissão vale PRA ESTA conta? (granular scopes)
      const gs = d.granular_scopes || [];
      const pub = gs.find(s => s.scope === 'instagram_content_publish');
      const podePublicar = pub ? (pub.target_ids ? pub.target_ids.includes(a.ig_business_id) : true) : false;
      rep.checks.push(podePublicar
        ? check(true, 'Autorizada a publicar', 'Esta conta específica está incluída na permissão de publicação.', null)
        : check(false, 'Autorizada a publicar', 'A permissão existe no token, mas NÃO cobre esta conta.',
            'Ao reautorizar no Facebook, marque explicitamente esta conta na lista de Instagrams. É o erro mais comum: autorizar só a primeira conta da lista.'));
    } catch (err) {
      rep.checks.push(check(false, 'Token válido',
        `Não foi possível verificar: ${err.response?.data?.error?.message || err.message}`,
        'Reconecte a conta.'));
    }

    // 4c. A conta é Business/Creator?
    try {
      const ig = await axios.get(`${GRAPH}/${a.ig_business_id}`, {
        params: { fields: 'username,name,followers_count', access_token: token }
      });
      rep.checks.push(check(true, 'Conta Business/Creator',
        `@${ig.data.username} respondeu à Graph API — é conta profissional vinculada a uma Página.`, null));
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      rep.checks.push(check(false, 'Conta Business/Creator', `A Graph API não retornou esta conta: ${msg}`,
        'A conta precisa ser Business ou Creator E estar vinculada a uma Página do Facebook. No app do Instagram: Configurações → Tipo de conta → Mudar para conta profissional, e vincule à Página.'));
    }

    // 4d. Quota de publicação nas últimas 24h
    try {
      const q = await axios.get(`${GRAPH}/${a.ig_business_id}/content_publishing_limit`, {
        params: { fields: 'config,quota_usage', access_token: token }
      });
      const row = q.data.data?.[0] || {};
      const usado = row.quota_usage ?? 0;
      const limite = row.config?.quota_total ?? 50;
      rep.checks.push(check(usado < limite, 'Cota de publicação (24h)',
        `${usado} de ${limite} publicações usadas nas últimas 24h.`,
        'A cota de 24h da Meta está esgotada. Aguarde a janela virar ou reduza o volume da campanha.'));
    } catch (err) {
      rep.checks.push(check(true, 'Cota de publicação (24h)',
        'Não foi possível consultar a cota (endpoint opcional) — não impede publicar.', null));
    }

    rep.ok = rep.checks.every(c => c.ok);
    accountReports.push(rep);
  }

  const tudoOk = steps.every(s => s.ok) && accountReports.every(r => r.ok);
  return { ok: tudoOk, steps, accounts: accountReports };
}

module.exports = { diagnoseMeta };
