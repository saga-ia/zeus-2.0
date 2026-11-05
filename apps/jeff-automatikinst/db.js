const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'zeus_post.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_user_id TEXT,
      platform_username TEXT,
      platform_name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      page_id TEXT,
      ig_business_id TEXT,
      profile_picture TEXT,
      followers INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      connected_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      caption TEXT NOT NULL,
      media_path TEXT,
      media_type TEXT,
      post_type TEXT DEFAULT 'image',
      platforms TEXT NOT NULL DEFAULT '[]',
      account_ids TEXT NOT NULL DEFAULT '[]',
      scheduled_at INTEGER,
      status TEXT DEFAULT 'draft',
      published_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS post_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      account_id INTEGER REFERENCES social_accounts(id),
      platform TEXT NOT NULL,
      platform_post_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      published_at INTEGER,
      access_token_used TEXT,
      UNIQUE(post_id, platform, account_id)
    );

    CREATE TABLE IF NOT EXISTS post_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_result_id INTEGER REFERENCES post_results(id),
      account_id INTEGER REFERENCES social_accounts(id),
      platform TEXT NOT NULL,
      platform_post_id TEXT,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      reach INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      collected_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS upload_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      mimetype TEXT,
      size INTEGER,
      path TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS bulk_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'drive',
      drive_folder_id TEXT,
      drive_url TEXT,
      post_format TEXT NOT NULL,
      account_ids TEXT NOT NULL DEFAULT '[]',
      posts_per_day INTEGER NOT NULL,
      total_days INTEGER NOT NULL,
      times TEXT NOT NULL DEFAULT '[]',
      start_date TEXT NOT NULL,
      jitter_minutes INTEGER DEFAULT 5,
      caption_mode TEXT NOT NULL,
      caption_config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      total_items INTEGER DEFAULT 0,
      published_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS bulk_campaign_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES bulk_campaigns(id) ON DELETE CASCADE,
      slot_index INTEGER NOT NULL,
      scheduled_at INTEGER NOT NULL,
      drive_file_id TEXT,
      drive_folder_id TEXT,
      drive_meta TEXT,
      post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      processed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_bulk_items_pending
      ON bulk_campaign_items(status, scheduled_at);
  `);

  // migrations idempotentes (colunas novas em bases existentes)
  const colsInfo = db.prepare("PRAGMA table_info(bulk_campaigns)").all();
  const colNames = colsInfo.map(c => c.name);
  if (!colNames.includes('source_type')) {
    db.exec("ALTER TABLE bulk_campaigns ADD COLUMN source_type TEXT NOT NULL DEFAULT 'drive'");
  }
  if (!colNames.includes('scheduled_start_at')) {
    db.exec("ALTER TABLE bulk_campaigns ADD COLUMN scheduled_start_at INTEGER");
  }
  if (!colNames.includes('suspensions')) {
    db.exec("ALTER TABLE bulk_campaigns ADD COLUMN suspensions TEXT NOT NULL DEFAULT '{}'");
  }

  // posts: sequência de cards (trava de publicação encadeada).
  // seq_group junta os cards que formam uma sequência; seq_index é a ordem
  // dentro dela (1 = card base, do qual os outros dependem).
  const pCols = db.prepare("PRAGMA table_info(posts)").all().map(c => c.name);
  if (!pCols.includes('seq_group')) {
    db.exec("ALTER TABLE posts ADD COLUMN seq_group TEXT");
    db.exec("ALTER TABLE posts ADD COLUMN seq_index INTEGER");
    db.exec("CREATE INDEX IF NOT EXISTS idx_posts_seq ON posts(seq_group, seq_index)");
    backfillSequencias(db);
  }

  // post_analytics: permalink
  const paCols = db.prepare("PRAGMA table_info(post_analytics)").all().map(c => c.name);
  if (!paCols.includes('permalink')) {
    db.exec("ALTER TABLE post_analytics ADD COLUMN permalink TEXT");
  }

  // bulk_campaign_items: retry automático
  const biCols = db.prepare("PRAGMA table_info(bulk_campaign_items)").all().map(c => c.name);
  if (!biCols.includes('retry_count')) {
    db.exec("ALTER TABLE bulk_campaign_items ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
  }

  // post_analytics: métricas exclusivas de Stories (replies/exits/taps)
  for (const col of ['replies', 'exits', 'taps_forward', 'taps_back']) {
    if (!paCols.includes(col)) {
      db.exec(`ALTER TABLE post_analytics ADD COLUMN ${col} INTEGER DEFAULT 0`);
    }
  }

  // Rebuild pra remover NOT NULL de drive_folder_id / drive_url (compatibilidade com source_type='upload')
  const driveFolderCol = colsInfo.find(c => c.name === 'drive_folder_id');
  if (driveFolderCol && driveFolderCol.notnull === 1) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE bulk_campaigns_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'drive',
        drive_folder_id TEXT,
        drive_url TEXT,
        post_format TEXT NOT NULL,
        account_ids TEXT NOT NULL DEFAULT '[]',
        posts_per_day INTEGER NOT NULL,
        total_days INTEGER NOT NULL,
        times TEXT NOT NULL DEFAULT '[]',
        start_date TEXT NOT NULL,
        jitter_minutes INTEGER DEFAULT 5,
        caption_mode TEXT NOT NULL,
        caption_config TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active',
        total_items INTEGER DEFAULT 0,
        published_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        scheduled_start_at INTEGER,
        suspensions TEXT NOT NULL DEFAULT '{}'
      );
      INSERT INTO bulk_campaigns_new
        (id, name, source_type, drive_folder_id, drive_url, post_format, account_ids, posts_per_day, total_days,
         times, start_date, jitter_minutes, caption_mode, caption_config, status, total_items, published_count, failed_count,
         created_at, updated_at, scheduled_start_at, suspensions)
      SELECT id, name, source_type, drive_folder_id, drive_url, post_format, account_ids, posts_per_day, total_days,
        times, start_date, jitter_minutes, caption_mode, caption_config, status, total_items, published_count, failed_count,
        created_at, updated_at, scheduled_start_at, suspensions FROM bulk_campaigns;
      DROP TABLE bulk_campaigns;
      ALTER TABLE bulk_campaigns_new RENAME TO bulk_campaigns;
      COMMIT;
    `);
    db.pragma('foreign_keys = ON');
    console.log('[db] Migration: drive_folder_id/drive_url agora aceitam NULL (para modo upload)');
  }

  // bulk_campaigns: configurações de Stories.
  // DEPOIS do rebuild acima — ele recria a tabela com lista fixa de colunas e
  // apagaria esta se o ALTER viesse antes.
  const colNamesAfter = db.prepare("PRAGMA table_info(bulk_campaigns)").all().map(c => c.name);
  if (!colNamesAfter.includes('story_config')) {
    db.exec("ALTER TABLE bulk_campaigns ADD COLUMN story_config TEXT NOT NULL DEFAULT '{}'");
  }

  migrateEncryption();
}

// Marca as sequências de stories que já estavam no banco antes da trava existir.
// Só agrupa os stories nomeados pelo fluxo de sequência ("30 stories de bom dia"
// = card da frase, "… · dNcM" = cards derivados): mesma conta, mesmo dia em
// Brasília, 2 ou mais posts. O índice vem da ordem do horário, então o primeiro
// do dia é sempre o card 1.
function backfillSequencias(db) {
  const PADRAO = /(30 stories de bom dia|·\s*d\d+c\d+)/i;
  const posts = db.prepare(`SELECT id, title, account_ids, scheduled_at FROM posts
    WHERE post_type = 'story' AND scheduled_at IS NOT NULL ORDER BY scheduled_at`).all();
  const grupos = new Map();
  for (const p of posts) {
    if (!PADRAO.test(p.title || '')) continue;
    const dia = new Date(p.scheduled_at * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const chave = `dia-${dia}-c${(p.account_ids || '[]').replace(/\D/g, '') || '0'}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }
  const upd = db.prepare('UPDATE posts SET seq_group = ?, seq_index = ? WHERE id = ?');
  let marcados = 0, seqs = 0;
  const tx = db.transaction(() => {
    for (const [chave, itens] of grupos) {
      if (itens.length < 2) continue;
      seqs++;
      itens.forEach((p, i) => { upd.run(chave, i + 1, p.id); marcados++; });
    }
  });
  tx();
  console.log(`[db] Migration: trava de sequência aplicada a ${marcados} story(ies) em ${seqs} sequência(s)`);
}

// Criptografa em repouso dados sensíveis que estejam em texto plano
// (bases antigas). Idempotente: valores já criptografados são pulados.
function migrateEncryption() {
  const { seal, isSealed } = require('./lib/crypto');
  let migrated = 0;

  // tokens das contas sociais
  const accounts = db.prepare('SELECT id, access_token, refresh_token FROM social_accounts').all();
  const updAcc = db.prepare('UPDATE social_accounts SET access_token=?, refresh_token=? WHERE id=?');
  for (const a of accounts) {
    const needsAccess = a.access_token && !isSealed(a.access_token);
    const needsRefresh = a.refresh_token && !isSealed(a.refresh_token);
    if (needsAccess || needsRefresh) {
      updAcc.run(seal(a.access_token), seal(a.refresh_token), a.id);
      migrated++;
    }
  }

  // token usado no publish (post_results)
  const results = db.prepare("SELECT id, access_token_used FROM post_results WHERE access_token_used IS NOT NULL").all();
  const updRes = db.prepare('UPDATE post_results SET access_token_used=? WHERE id=?');
  for (const r of results) {
    if (r.access_token_used && !isSealed(r.access_token_used)) {
      updRes.run(seal(r.access_token_used), r.id);
      migrated++;
    }
  }

  // settings sensíveis (mesma lista de lib/settings.js — duplicada aqui pra
  // evitar require circular db → settings → db)
  const sensitiveKeys = ['meta_app_secret', 'google_client_secret', 'tiktok_client_secret',
    'ai_claude_key', 'ai_openai_key', 'ai_gemini_key',
    'google_drive_access_token', 'google_drive_refresh_token'];
  const updSet = db.prepare('UPDATE settings SET value=? WHERE key=?');
  for (const key of sensitiveKeys) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (row?.value && !isSealed(row.value)) {
      updSet.run(seal(row.value), key);
      migrated++;
    }
  }

  if (migrated > 0) console.log(`[db] Criptografia em repouso: ${migrated} registro(s) sensível(is) criptografado(s)`);
}

module.exports = { getDb };

