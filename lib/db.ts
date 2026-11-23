import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// SQLite via Node's built-in driver: no extra dependency, one file per installation.
// For multi-instance production hosting, swap this module for Postgres (EU region).

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    user_type TEXT,
    timezone TEXT NOT NULL,
    onboarded INTEGER NOT NULL DEFAULT 0,
    life_areas TEXT NOT NULL DEFAULT '[]',
    prefs TEXT NOT NULL DEFAULT '{}',
    cycle_consent_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE timetable_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    subject TEXT NOT NULL,
    teacher TEXT,
    room TEXT,
    institution TEXT,
    weekday INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    exdates TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_tt_user ON timetable_entries(user_id);
  CREATE TABLE timetable_breaks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL
  );
  CREATE TABLE calendars (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    kind TEXT NOT NULL,
    connection_id TEXT,
    external_id TEXT,
    visible INTEGER NOT NULL DEFAULT 1,
    writable INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_cal_user ON calendars(user_id);
  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id TEXT REFERENCES calendars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    source TEXT NOT NULL,
    external_uid TEXT,
    connection_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    location TEXT,
    teacher TEXT,
    reminder_minutes INTEGER,
    recurrence_freq TEXT,
    recurrence_interval INTEGER NOT NULL DEFAULT 1,
    recurrence_until TEXT,
    exdates TEXT NOT NULL DEFAULT '[]',
    series_id TEXT,
    sync_state TEXT NOT NULL DEFAULT 'clean',
    remote_version TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_events_user_start ON events(user_id, start_at);
  CREATE UNIQUE INDEX idx_events_external ON events(user_id, source, external_uid) WHERE external_uid IS NOT NULL;
  CREATE INDEX idx_events_recurring ON events(user_id) WHERE recurrence_freq IS NOT NULL;
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    kind TEXT NOT NULL,
    due_at TEXT NOT NULL,
    estimated_minutes INTEGER NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 2,
    status TEXT NOT NULL DEFAULT 'open',
    priority INTEGER NOT NULL DEFAULT 2,
    not_before TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_tasks_user ON tasks(user_id, due_at);
  CREATE TABLE study_blocks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    completed_at TEXT,
    note TEXT
  );
  CREATE INDEX idx_blocks_user_start ON study_blocks(user_id, start_at);
  CREATE TABLE calendar_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    secret_enc TEXT,
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at TEXT,
    lookup_hash TEXT,
    config TEXT NOT NULL DEFAULT '{}',
    last_sync_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, provider)
  );
  CREATE INDEX idx_conn_lookup ON calendar_connections(lookup_hash);
  CREATE TABLE sync_map (
    connection_id TEXT NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
    local_key TEXT NOT NULL,
    external_id TEXT NOT NULL,
    external_calendar_id TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL,
    start_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (connection_id, local_key)
  );
  CREATE INDEX idx_sync_external ON sync_map(connection_id, external_id);
  CREATE TABLE suggestions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open',
    dedupe_key TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_suggest_dedupe ON suggestions(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
  CREATE TABLE cycle_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_enc TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_cycle_user ON cycle_entries(user_id);
  `,
];

declare global {
  // eslint-disable-next-line no-var
  var __cloqiDb: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), '.data', 'cloqi.db');
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export function db(): DatabaseSync {
  if (!globalThis.__cloqiDb) globalThis.__cloqiDb = open();
  return globalThis.__cloqiDb;
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

export function newId(): string { return crypto.randomUUID(); }
export function nowIso(): string { return new Date().toISOString(); }
