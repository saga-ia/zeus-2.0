// Renovação automática de tokens de acesso antes de publicar/coletar.
// - YouTube (Google): access_token expira em ~1h → refresh via refresh_token.
// - TikTok: access_token expira em ~24h → refresh via refresh_token (que rotaciona).
// - Instagram (Meta): page tokens de longa duração (~60 dias) → tentativa de
//   fb_exchange_token quando estiver perto de expirar; se não der, marca a
//   conta como 'expiring' pra UI avisar que precisa reautorizar.
const axios = require('axios');
const { seal, open } = require('./crypto');
const { getSetting } = require('./settings');

// Garante token válido pra conta e retorna o access_token EM TEXTO PLANO
// (pronto pra usar na API). Persiste o token renovado criptografado.
async function ensureFreshToken(db, account) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = open(account.access_token);
  const refreshToken = open(account.refresh_token);

  // margem de 5 min pra não expirar no meio do upload
  const stillValid = account.token_expires_at && account.token_expires_at > now + 300;

  if (account.platform === 'youtube') {
    if (stillValid) return accessToken;
    if (!refreshToken) {
      throw new Error('Token do YouTube expirado e sem refresh_token — reconecte a conta em Conectar Perfis');
    }
    const res = await axios.post('https://oauth2.googleapis.com/token', {
      refresh_token: refreshToken,
      client_id: getSetting('google_client_id'),
      client_secret: getSetting('google_client_secret'),
      grant_type: 'refresh_token'
    });
    const { access_token, expires_in } = res.data;
    db.prepare('UPDATE social_accounts SET access_token=?, token_expires_at=?, updated_at=unixepoch() WHERE id=?')
      .run(seal(access_token), now + (expires_in || 3600), account.id);
    console.log(`[tokens] YouTube @${account.platform_username}: access_token renovado`);
    return access_token;
  }

  if (account.platform === 'tiktok') {
    if (stillValid) return accessToken;
    if (!refreshToken) {
      throw new Error('Token do TikTok expirado e sem refresh_token — reconecte a conta em Conectar Perfis');
    }
    const res = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', new URLSearchParams({
      client_key: getSetting('tiktok_client_key'),
      client_secret: getSetting('tiktok_client_secret'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const data = res.data.data || res.data;
    if (!data.access_token) throw new Error('TikTok não devolveu access_token no refresh: ' + JSON.stringify(res.data).slice(0, 200));
    db.prepare('UPDATE social_accounts SET access_token=?, refresh_token=?, token_expires_at=?, updated_at=unixepoch() WHERE id=?')
      .run(seal(data.access_token), seal(data.refresh_token || refreshToken), now + (data.expires_in || 86400), account.id);
    console.log(`[tokens] TikTok @${account.platform_username}: access_token renovado`);
    return data.access_token;
  }

  // Instagram: page token de longa duração — usa direto
  return accessToken;
}

// Job diário: renova tokens Meta que expiram em <10 dias via fb_exchange_token.
// Se a troca falhar (page token não trocável), marca status='expiring' pra UI.
async function refreshExpiringMetaTokens() {
  const { getDb } = require('../db');
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const soon = now + 10 * 24 * 3600;

  const appId = getSetting('meta_app_id');
  const appSecret = getSetting('meta_app_secret');
  if (!appId || !appSecret) return { refreshed: 0, expiring: 0 };

  const accounts = db.prepare(`SELECT * FROM social_accounts
    WHERE platform = 'instagram' AND token_expires_at IS NOT NULL AND token_expires_at < ?`).all(soon);

  let refreshed = 0, expiring = 0;
  for (const a of accounts) {
    try {
      const res = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: open(a.access_token)
        }
      });
      const { access_token, expires_in } = res.data;
      db.prepare(`UPDATE social_accounts SET access_token=?, token_expires_at=?, status='active', updated_at=unixepoch() WHERE id=?`)
        .run(seal(access_token), now + (expires_in || 60 * 24 * 3600), a.id);
      refreshed++;
      console.log(`[tokens] Instagram @${a.platform_username}: token de longa duração renovado`);
    } catch (err) {
      expiring++;
      db.prepare(`UPDATE social_accounts SET status='expiring', updated_at=unixepoch() WHERE id=?`).run(a.id);
      const days = Math.max(0, Math.round((a.token_expires_at - now) / 86400));
      console.warn(`[tokens] Instagram @${a.platform_username}: não foi possível renovar automaticamente ` +
        `(expira em ~${days} dia(s)) — reautorize em Conectar Perfis. Detalhe: ${err.response?.data?.error?.message || err.message}`);
    }
  }
  return { refreshed, expiring };
}

module.exports = { ensureFreshToken, refreshExpiringMetaTokens };
