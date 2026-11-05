-- estrutura de /opt/jeff-apps/jeff-zeus-post/data/zeus_post.db (sem dados)
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
CREATE TABLE social_accounts (
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
CREATE TABLE posts (
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
    , is_trial INTEGER NOT NULL DEFAULT 0);
CREATE TABLE post_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      account_id INTEGER REFERENCES social_accounts(id),
      platform TEXT NOT NULL,
      platform_post_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      published_at INTEGER, access_token_used TEXT,
      UNIQUE(post_id, platform, account_id)
    );
CREATE TABLE post_analytics (
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
    , permalink TEXT, replies INTEGER DEFAULT 0, exits INTEGER DEFAULT 0, taps_forward INTEGER DEFAULT 0, taps_back INTEGER DEFAULT 0);
CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
CREATE TABLE upload_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      mimetype TEXT,
      size INTEGER,
      path TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
CREATE TABLE bulk_campaign_items (
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
    , retry_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "bulk_campaigns" (
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
      , story_config TEXT NOT NULL DEFAULT '{}', is_trial INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_bulk_items_pending
      ON bulk_campaign_items(status, scheduled_at);
COMMIT;
