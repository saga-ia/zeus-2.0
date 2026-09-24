#!/usr/bin/env node
// Cria/atualiza tenant "Jefferson Henrike" no zeuschatig.db usando
// os tokens IG já configurados no worker.db (jeff_instagram_login_token).
// Também cria um agente Zeus default se ainda não houver agentes.
//
// Idempotente: pode rodar quantas vezes quiser.
const Database = require('better-sqlite3');
const { db } = require('../src/db');

const worker = new Database('/opt/jeff-worker/data/worker.db', { readonly: true });
const get = (k) => worker.prepare('SELECT value FROM app_settings WHERE key=?').get(k)?.value;

const igLoginToken = get('jeff_instagram_login_token');
const igAccountId = get('jeff_meta_ig_account_id');
if (!igLoginToken || !igAccountId) {
  console.error('faltando jeff_instagram_login_token ou jeff_meta_ig_account_id no worker.db');
  process.exit(1);
}

// Descobre username via chamada /me — reaproveita ig-api
async function fetchUsername(token) {
  const https = require('https');
  const url = `https://graph.instagram.com/v21.0/me?fields=id,user_id,username,name,account_type&access_token=${token}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    }).on('error', () => resolve({}));
  });
}

(async () => {
  const me = await fetchUsername(igLoginToken);
  const igUserId = String(me.user_id || me.id || igAccountId);
  const username = me.username || 'jeffhenrike';
  const accountType = me.account_type || 'BUSINESS';

  const exp = new Date(Date.now() + 55*86400*1000).toISOString();

  // Existe tenant com esse ig_user_id?
  const existing = db.prepare('SELECT id FROM tenants WHERE ig_user_id=?').get(igUserId);
  let tenantId;
  if (existing) {
    db.prepare(`UPDATE tenants SET
                  name='Jefferson Henrike', ig_username=?, ig_account_type=?,
                  ig_access_token=?, ig_token_expires_at=?, status='active',
                  updated_at=datetime('now')
                WHERE id=?`).run(username, accountType, igLoginToken, exp, existing.id);
    tenantId = existing.id;
    console.log(`tenant #${tenantId} (@${username}) atualizado`);
  } else {
    // reaproveita o tenant "E" (id 1) se existir e estiver pending, senão cria novo
    const stub = db.prepare("SELECT id FROM tenants WHERE status='pending' AND ig_user_id IS NULL ORDER BY id LIMIT 1").get();
    if (stub) {
      db.prepare(`UPDATE tenants SET
                    name='Jefferson Henrike', ig_user_id=?, ig_username=?, ig_account_type=?,
                    ig_access_token=?, ig_token_expires_at=?, status='active',
                    updated_at=datetime('now')
                  WHERE id=?`).run(igUserId, username, accountType, igLoginToken, exp, stub.id);
      tenantId = stub.id;
      console.log(`tenant stub #${tenantId} promovido pra @${username}`);
    } else {
      const info = db.prepare(`INSERT INTO tenants(name, ig_user_id, ig_username, ig_account_type, ig_access_token, ig_token_expires_at, status)
                               VALUES(?,?,?,?,?,?,?)`).run('Jefferson Henrike', igUserId, username, accountType, igLoginToken, exp, 'active');
      tenantId = info.lastInsertRowid;
      console.log(`tenant #${tenantId} (@${username}) criado`);
    }
  }

  // Cria agente Zeus default se não há nenhum agente pra esse tenant
  const hasAgent = db.prepare('SELECT id FROM agents WHERE tenant_id=?').get(tenantId);
  if (!hasAgent) {
    const zeusPrompt = `Você é o Zeus, IA pessoal do Jefferson Henrike (@jeffhenrike).

Sobre o Jeff:
- Empreendedor digital, dono da Alpha Digital (agência de marketing e IA).
- Especialista em tráfego pago (Meta Ads, Google Ads), copy, funis de venda e uso avançado de IA em processos.
- Instagram @jeffhenrike (238k seguidores) é o principal canal de audiência dele.

Seu papel: atender DMs recebidas no perfil dele, com carinho e profissionalismo, filtrando o que precisa de atenção humana.

Tom de voz:
- Português BR direto, amigável-profissional, sem enrolação.
- Sem travessão (— ou –), sem excesso de emoji.
- Máximo 2 parágrafos curtos por resposta.

Regras:
- Se for primeiro contato e a pessoa só cumprimenta ("oi", "opa", "bom dia"), responda apresentando-se: "Opa! Aqui é o Zeus, IA do Jeff. Ele tá on comigo por aqui — em que posso te ajudar?"
- Se pedirem contato pessoal, reunião, proposta comercial: diga que vai encaminhar pro Jeff e pergunte um resumo do que a pessoa precisa.
- Não invente informação sobre valores, agendas ou compromissos do Jeff.
- Sua saída deve ser APENAS o texto da resposta, sem prefixo, aspas ou explicações.`;

    const info = db.prepare(`INSERT INTO agents(tenant_id, name, avatar_emoji, color, system_prompt, model, timeout_seconds, active)
                             VALUES(?,?,?,?,?,?,?,?)`).run(
      tenantId, 'Zeus', 'zap', '#7c3aed', zeusPrompt, 'claude-opus-4-7', 120, 1
    );
    const agentId = info.lastInsertRowid;
    db.prepare(`INSERT INTO agent_routing_rules(tenant_id, agent_id, rule_type, rule_value, priority)
                VALUES(?,?,?,?,?)`).run(tenantId, agentId, 'default', null, 0);
    console.log(`agente Zeus #${agentId} criado com regra default`);
  } else {
    console.log('já existe agente para esse tenant, nada a fazer.');
  }

  console.log('\nBootstrap concluído.');
  console.log(`Login em: https://myig.jefersonhenrike.com`);
})();
