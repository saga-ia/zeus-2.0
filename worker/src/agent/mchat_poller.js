// mchat: Instagram comment-to-DM automation (substituto do ManyChat)
// Roda em background como cron, pega comentários novos no Insta @lucas.labastie,
// filtra por palavra-chave (default "paradigma"), responde o comentário e manda DM.

const { db } = require('../db');
const logger = require('../logger');
const { appendMchatRow } = require('./mchat_sheet');

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const REQUEST_TIMEOUT_MS = 15_000;

const stmt = {
  getSetting: db.prepare(`SELECT value FROM mchat_settings WHERE key = ?`),
  getAppSetting: db.prepare(`SELECT value FROM app_settings WHERE key = ?`),
  setSetting: db.prepare(`
    INSERT INTO mchat_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `),
  getProcessed: db.prepare(`SELECT 1 FROM mchat_processed_comments WHERE comment_id = ?`),
  insertProcessed: db.prepare(`
    INSERT INTO mchat_processed_comments
      (comment_id, media_id, ig_user_id, ig_username, text, matched_keyword, reply_sent, reply_id, dm_sent, dm_message_id, error)
    VALUES (@comment_id, @media_id, @ig_user_id, @ig_username, @text, @matched_keyword, @reply_sent, @reply_id, @dm_sent, @dm_message_id, @error)
  `),
};

function getSetting(key, fallback = null) {
  const row = stmt.getSetting.get(key);
  return row ? row.value : fallback;
}

function getAppSetting(key) {
  const row = stmt.getAppSetting.get(key);
  return row ? row.value : null;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function fetchJson(url, opts = {}) {
  const res = await withTimeout(fetch(url, opts), REQUEST_TIMEOUT_MS, `meta fetch ${url.slice(0, 60)}`);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Meta API ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

async function listRecentMedia(igAccount, pageToken) {
  const url = `${GRAPH_BASE}/${igAccount}/media?fields=id,timestamp,comments_count&limit=20&access_token=${pageToken}`;
  const data = await fetchJson(url);
  return data.data || [];
}

async function listComments(mediaId, pageToken) {
  const url = `${GRAPH_BASE}/${mediaId}/comments?fields=id,text,username,from,timestamp&limit=50&access_token=${pageToken}`;
  const data = await fetchJson(url);
  return data.data || [];
}

async function replyToComment(commentId, replyText, pageToken) {
  const url = `${GRAPH_BASE}/${commentId}/replies?access_token=${pageToken}`;
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: replyText }),
  });
}

async function sendDM(igAccount, recipientUserId, dmText, pageToken) {
  // Instagram Messaging API — envia DM em resposta a comentário (within 24h window).
  const url = `${GRAPH_BASE}/${igAccount}/messages?access_token=${pageToken}`;
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientUserId },
      message: { text: dmText },
    }),
  });
}

async function processComment(media, comment, settings) {
  const text = (comment.text || '').toLowerCase();
  const keywords = (settings.keywords || 'paradigma').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

  // Fuzzy match: detect typos / variations of trigger words
  // Levenshtein distance ≤ 2 OR contains key letters in order
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
        else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
  function fuzzyMatch(needle, haystack) {
    // Direct substring match
    if (haystack.includes(needle)) return true;
    // Token-level Levenshtein
    const tokens = haystack.split(/[\s.,!?@#]+/).filter(Boolean);
    return tokens.some(t => {
      if (Math.abs(t.length - needle.length) > 3) return false;
      return levenshtein(t, needle) <= 2;
    });
  }
  const matched = keywords.find(k => fuzzyMatch(k, text));
  if (!matched) return; // not a trigger

  if (stmt.getProcessed.get(comment.id)) return; // already handled

  // Skip self-comments (Lucas himself replying)
  if (comment.username === 'lucas.labastie') return;

  const userId = comment.from?.id || null;
  const username = comment.username || comment.from?.username || null;

  let replyResult = { sent: 0, id: null, error: null };
  let dmResult = { sent: 0, id: null, error: null };

  // 1) Reply on the comment
  try {
    const r = await replyToComment(comment.id, settings.comment_reply, settings.pageToken);
    replyResult = { sent: 1, id: r.id, error: null };
  } catch (err) {
    replyResult = { sent: 0, id: null, error: String(err).slice(0, 200) };
  }

  // 2) Send DM (requires user_id + Instagram Messaging permissions)
  if (userId) {
    try {
      const d = await sendDM(settings.igAccount, userId, settings.dm_message, settings.pageToken);
      dmResult = { sent: 1, id: d.message_id || d.id || null, error: null };
    } catch (err) {
      dmResult = { sent: 0, id: null, error: String(err).slice(0, 200) };
    }
  }

  stmt.insertProcessed.run({
    comment_id: comment.id,
    media_id: media.id,
    ig_user_id: userId,
    ig_username: username,
    text: comment.text,
    matched_keyword: matched,
    reply_sent: replyResult.sent,
    reply_id: replyResult.id,
    dm_sent: dmResult.sent,
    dm_message_id: dmResult.id,
    error: replyResult.error || dmResult.error,
  });

  logger.info({
    commentId: comment.id, username, matched,
    replyOk: !!replyResult.sent, dmOk: !!dmResult.sent,
    replyErr: replyResult.error, dmErr: dmResult.error,
  }, 'mchat processed comment');

  // Append to Google Sheet (best-effort, don't fail processing)
  appendMchatRow({
    timestamp: new Date().toISOString(),
    username,
    text: comment.text,
    mediaId: media.id,
    replySent: !!replyResult.sent,
    dmSent: !!dmResult.sent,
  }).catch((err) => logger.warn({ err: String(err) }, 'mchat sheet append failed'));
}

async function pollOnce() {
  const enabled = getSetting('enabled', '1');
  if (enabled !== '1') return;

  const settings = {
    keywords: getSetting('keywords', 'paradigma'),
    comment_reply: getSetting('comment_reply', ''),
    dm_message: getSetting('dm_message', ''),
    pageToken: getAppSetting('meta_page_token_lucas'),
    igAccount: getAppSetting('meta_ig_account_lucas'),
  };

  if (!settings.pageToken || !settings.igAccount) {
    logger.warn('mchat: missing meta_page_token_lucas or meta_ig_account_lucas');
    return;
  }

  let medias = [];
  try {
    medias = await listRecentMedia(settings.igAccount, settings.pageToken);
  } catch (err) {
    logger.error({ err: String(err) }, 'mchat list media failed');
    return;
  }

  for (const media of medias) {
    if ((media.comments_count || 0) === 0) continue;
    let comments = [];
    try {
      comments = await listComments(media.id, settings.pageToken);
    } catch (err) {
      logger.warn({ mediaId: media.id, err: String(err) }, 'mchat list comments failed');
      continue;
    }
    for (const c of comments) {
      try {
        await processComment(media, c, settings);
      } catch (err) {
        logger.warn({ commentId: c.id, err: String(err) }, 'mchat process comment failed');
      }
    }
  }
}

let timer = null;
function start() {
  const interval = parseInt(getSetting('poll_interval_ms', '30000'), 10);
  if (timer) clearInterval(timer);
  // Initial run after 5s, then every interval
  setTimeout(() => { pollOnce().catch((e) => logger.error({ err: String(e) }, 'mchat first poll error')); }, 5000);
  timer = setInterval(() => {
    pollOnce().catch((e) => logger.error({ err: String(e) }, 'mchat poll error'));
  }, interval);
  logger.info({ intervalMs: interval }, 'mchat poller started');
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, pollOnce };
