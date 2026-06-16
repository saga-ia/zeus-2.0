-- ClickUp integration: cache local de tasks + log de eventos + state pro poll incremental.
-- Token e mapping de usuários ficam em app_settings (chaves clickup_*).

CREATE TABLE IF NOT EXISTS clickup_tasks_cache (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  space_id TEXT,
  space_name TEXT,
  folder_id TEXT,
  folder_name TEXT,
  list_id TEXT,
  list_name TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  status_type TEXT,
  priority INTEGER,
  url TEXT,
  date_created INTEGER,
  date_updated INTEGER,
  date_done INTEGER,
  date_closed INTEGER,
  due_date INTEGER,
  start_date INTEGER,
  assignees_json TEXT,
  creator_id TEXT,
  parent_id TEXT,
  raw_json TEXT,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clickup_tasks_status ON clickup_tasks_cache(status);
CREATE INDEX IF NOT EXISTS idx_clickup_tasks_due ON clickup_tasks_cache(due_date);
CREATE INDEX IF NOT EXISTS idx_clickup_tasks_list ON clickup_tasks_cache(list_id);
CREATE INDEX IF NOT EXISTS idx_clickup_tasks_updated ON clickup_tasks_cache(date_updated);

CREATE TABLE IF NOT EXISTS clickup_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT,
  event_type TEXT NOT NULL,
  event_payload TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  notified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_clickup_events_task ON clickup_events(task_id);
CREATE INDEX IF NOT EXISTS idx_clickup_events_notified ON clickup_events(notified);

CREATE TABLE IF NOT EXISTS clickup_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clickup_chase_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  assignee_id TEXT,
  recipient_phone TEXT NOT NULL,
  chase_level TEXT NOT NULL,
  due_date INTEGER,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clickup_chase_task ON clickup_chase_log(task_id);
CREATE INDEX IF NOT EXISTS idx_clickup_chase_sent ON clickup_chase_log(sent_at);
