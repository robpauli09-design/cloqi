-- =====================================================================================
-- CLOQI – database schema (PostgreSQL / Supabase)
--
-- How to install: Supabase project (region EU / Frankfurt) → SQL Editor → paste this file → Run.
-- Safe to run again: every statement uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- Design overview (20 tables)
--
--   ACCOUNT            users ─┬─ profiles (1:1)            who the person is, app settings
--                             ├─ study_settings (1:1)      when CLOQI may plan study time
--                             ├─ subjects (1:n)            school/uni subjects + difficulty
--                             └─ sessions (1:n)            login sessions (only token hashes)
--
--   CALENDAR           calendars (1:n per user) ── events (1:n per calendar)
--                        kinds: cloqi (main), custom, study, timetable, webuntis, ics, google, outlook
--                        events.series_id → events (detached single occurrence of a series)
--
--   TIMETABLE          timetable_entries (weekly lessons) · school_holidays (no lessons)
--
--   LEARN              tasks (tests, homework) ── study_blocks (planned study time)
--
--   SYNC               calendar_connections (google, outlook, apple feed, webuntis)
--                        ├─ calendars (imported external calendars)
--                        └─ sync_mappings (CLOQI item ↔ external event id, prevents duplicates)
--
--   ASSISTANT          vault_files (Obsidian-like knowledge vault) · ai_actions (change log) · ai_usage (limits)
--                      chat_threads ── chat_messages · suggestions (proposals the user accepts/declines)
--
--   HEALTH (optional)  cycle_entries – fully encrypted by the app (GDPR Art. 9)
--
-- Conventions
--   * every user-owned table has user_id → users(id) ON DELETE CASCADE: deleting an account
--     removes all personal data in one statement (GDPR right to erasure)
--   * instants are timestamptz (UTC), calendar days are date, wall-clock times are time
--   * enumerations are text + CHECK constraint (easy to extend, readable in exports)
--   * secrets (OAuth tokens, WebUntis link, feed token, cycle data) are encrypted by the app
--     (AES-256-GCM) before they reach the database
--   * the app connects server-side via DATABASE_URL; Supabase's public REST API is locked
--     (row level security without policies + revoked grants, see the end of the file)
-- =====================================================================================

-- ---------- helpers ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------- ACCOUNT ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL CHECK (email = lower(email) AND position('@' in email) > 1),
  password_hash  text NOT NULL,                    -- scrypt, never the password itself
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);

CREATE TABLE IF NOT EXISTS profiles (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name       text NOT NULL DEFAULT '' CHECK (length(display_name) <= 40),
  user_type          text CHECK (user_type IN ('schueler', 'student', 'lehrer', 'berufstaetig', 'sonstiges')),
  gender             text CHECK (gender IN ('m', 'w', 'd')),   -- m/w/d; the Cycle module is offered for w/d only
  timezone           text NOT NULL DEFAULT 'Europe/Vienna',
  mascot             text NOT NULL DEFAULT 'cloki' CHECK (mascot IN ('cloki', 'clea')),
  nav_tabs           text,                              -- chosen areas, e.g. 'learn,life,sport,vault' (null = defaults)
  ai_mode            text NOT NULL DEFAULT 'edit' CHECK (ai_mode IN ('ask', 'edit', 'auto')), -- CLOQI AI: ask before changes · edit · auto (also deletes)
  life_areas         jsonb NOT NULL DEFAULT '[]'::jsonb,      -- ["schule","training",...]
  onboarded_at       timestamptz,
  cycle_enabled      boolean NOT NULL DEFAULT false,
  cycle_in_calendar  boolean NOT NULL DEFAULT false,
  cycle_consent_at   timestamptz,                              -- explicit consent (GDPR Art. 9)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cycle_requires_consent CHECK (NOT cycle_enabled OR cycle_consent_at IS NOT NULL)
);

-- Upgrades for databases created with an earlier version of this script
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('m', 'w', 'd'));

CREATE TABLE IF NOT EXISTS study_settings (
  user_id                   uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekday_start             time NOT NULL DEFAULT '15:00',
  weekday_end               time NOT NULL DEFAULT '20:30',
  weekend_start             time NOT NULL DEFAULT '10:00',
  weekend_end               time NOT NULL DEFAULT '18:00',
  study_on_sunday           boolean NOT NULL DEFAULT false,
  max_minutes_per_day       smallint NOT NULL DEFAULT 120 CHECK (max_minutes_per_day BETWEEN 30 AND 480),
  max_block_minutes         smallint NOT NULL DEFAULT 60  CHECK (max_block_minutes BETWEEN 15 AND 180),
  break_minutes             smallint NOT NULL DEFAULT 15  CHECK (break_minutes BETWEEN 0 AND 60),
  daily_goal_minutes        smallint NOT NULL DEFAULT 45  CHECK (daily_goal_minutes BETWEEN 0 AND 480),
  default_reminder_minutes  smallint NOT NULL DEFAULT 15  CHECK (default_reminder_minutes BETWEEN 0 AND 1440),
  pause_until               date,                         -- study break: no study blocks up to and including this day
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (weekday_end > weekday_start AND weekend_end > weekend_start)
);

CREATE TABLE IF NOT EXISTS subjects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  difficulty  smallint NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_user_name_key ON subjects (user_id, lower(name));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,                      -- sha256 of the cookie token
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- ---------- SYNC (connections first: calendars reference them) -----------------------

CREATE TABLE IF NOT EXISTS calendar_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider           text NOT NULL CHECK (provider IN ('google', 'outlook', 'apple', 'webuntis', 'school')),
  status             text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'expired')),
  secret_enc         text,          -- WebUntis iCal link / Apple feed token (encrypted)
  lookup_hash        text,          -- sha256 of the Apple feed token, for the public feed URL
  access_token_enc   text,          -- OAuth (encrypted)
  refresh_token_enc  text,          -- OAuth (encrypted)
  token_expires_at   timestamptz,
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- chosen calendars, export categories
  last_sync_at       timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
CREATE UNIQUE INDEX IF NOT EXISTS connections_lookup_key ON calendar_connections (lookup_hash) WHERE lookup_hash IS NOT NULL;

-- ---------- CALENDAR -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendars (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  color          text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  kind           text NOT NULL CHECK (kind IN ('cloqi', 'custom', 'study', 'timetable', 'webuntis', 'ics', 'google', 'outlook')),
  connection_id  uuid REFERENCES calendar_connections(id) ON DELETE CASCADE,
  external_id    text,                                    -- id of the calendar at Google/Outlook
  is_visible     boolean NOT NULL DEFAULT true,
  is_writable    boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('google', 'outlook')) = (external_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS calendars_user_idx ON calendars (user_id);
-- exactly one built-in calendar of each singleton kind per user
CREATE UNIQUE INDEX IF NOT EXISTS calendars_singleton_key ON calendars (user_id, kind) WHERE kind IN ('cloqi', 'study', 'timetable', 'webuntis', 'ics');
CREATE UNIQUE INDEX IF NOT EXISTS calendars_external_key ON calendars (connection_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id          uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title                text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description          text,
  location             text,
  teacher              text,                              -- lessons (WebUntis / imported timetables)
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  all_day              boolean NOT NULL DEFAULT false,
  category             text NOT NULL CHECK (category IN ('schule', 'lernen', 'pruefung', 'hausuebung', 'training', 'arbeit', 'freizeit', 'privat')),
  source               text NOT NULL CHECK (source IN ('manual', 'assistant', 'webuntis', 'ics', 'google', 'outlook')),
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  reminder_minutes     smallint CHECK (reminder_minutes BETWEEN 0 AND 10080),
  -- repetition (expanded by the app; exdates = skipped occurrences)
  recurrence_freq      text CHECK (recurrence_freq IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval  smallint NOT NULL DEFAULT 1 CHECK (recurrence_interval BETWEEN 1 AND 99),
  recurrence_until     date,
  recurrence_days      text,                              -- weekly on weekdays, e.g. '1,3,5' (Mo, Mi, Fr)
  exdates              jsonb NOT NULL DEFAULT '[]'::jsonb,
  series_id            uuid REFERENCES events(id) ON DELETE CASCADE,   -- edited single occurrence of a series
  -- external sync
  external_uid         text,                              -- id at WebUntis/ICS/Google/Outlook
  sync_state           text NOT NULL DEFAULT 'clean' CHECK (sync_state IN ('clean', 'dirty', 'conflict')),
  remote_version       text,                              -- etag / changeKey of the external event
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at),
  CHECK (recurrence_freq IS NOT NULL OR recurrence_until IS NULL)
);
CREATE INDEX IF NOT EXISTS events_user_time_idx ON events (user_id, starts_at);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events (calendar_id);
CREATE INDEX IF NOT EXISTS events_recurring_idx ON events (user_id) WHERE recurrence_freq IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_external_key ON events (calendar_id, external_uid) WHERE external_uid IS NOT NULL;

-- ---------- TIMETABLE --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS timetable_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id   uuid REFERENCES subjects(id) ON DELETE SET NULL,
  subject      text NOT NULL CHECK (length(subject) BETWEEN 1 AND 80),
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),    -- 1 = Monday
  starts       time NOT NULL,
  ends         time NOT NULL,
  room         text,
  teacher      text,
  institution  text,
  exdates      jsonb NOT NULL DEFAULT '[]'::jsonb,                    -- single cancelled lessons
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (ends > starts)
);
CREATE INDEX IF NOT EXISTS timetable_user_idx ON timetable_entries (user_id, weekday);

CREATE TABLE IF NOT EXISTS school_holidays (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT 'Ferien',
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS holidays_user_idx ON school_holidays (user_id, starts_on);

-- ---------- LEARN ------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id         uuid REFERENCES subjects(id) ON DELETE SET NULL,
  subject            text NOT NULL,
  title              text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  kind               text NOT NULL CHECK (kind IN ('test', 'schularbeit', 'pruefung', 'hausuebung', 'referat', 'lernziel')),
  due_at             timestamptz NOT NULL,
  not_before         date,                                  -- planning starts on this day
  estimated_minutes  smallint NOT NULL CHECK (estimated_minutes BETWEEN 15 AND 1200),
  difficulty         smallint NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
  priority           smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  external_id        text                                   -- e.g. 'teams:<assignment id>' (read-only import)
);
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks (user_id, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_external_idx ON tasks (user_id, external_id) WHERE external_id IS NOT NULL;

-- Microsoft Schule (read-only): Teams homework + OneNote page index. Page content is fetched live, never stored.
CREATE TABLE IF NOT EXISTS school_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('assignment', 'page')),
  external_id   text NOT NULL,
  title         text NOT NULL,
  context       text NOT NULL DEFAULT '',          -- class / notebook › section
  body          text NOT NULL DEFAULT '',          -- homework instructions (short)
  api_path      text NOT NULL DEFAULT '',          -- 'me' or 'groups/<id>' (where the page lives)
  web_url       text,
  due_at        timestamptz,
  done          boolean NOT NULL DEFAULT false,
  modified_at   timestamptz,
  UNIQUE (user_id, kind, external_id)
);

CREATE TABLE IF NOT EXISTS study_blocks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'missed')),
  label         text,                                       -- Grundlagen / Übungen / Wiederholung
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS study_blocks_user_time_idx ON study_blocks (user_id, starts_at);
CREATE INDEX IF NOT EXISTS study_blocks_task_idx ON study_blocks (task_id);

-- ---------- SYNC mapping -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_mappings (
  connection_id         uuid NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  local_key             text NOT NULL,      -- CLOQI item key (event id, event@date, sb:<block>, task:<id>)
  external_calendar_id  text NOT NULL,
  external_id           text NOT NULL,
  content_hash          text NOT NULL,      -- detects which side changed
  starts_at             timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, local_key)
);
CREATE INDEX IF NOT EXISTS sync_mappings_external_idx ON sync_mappings (connection_id, external_id);

-- ---------- ASSISTANT ----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('cancellation', 'missed', 'change', 'conflict', 'sync_conflict', 'info')),
  message      text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed')),
  dedupe_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);
CREATE INDEX IF NOT EXISTS suggestions_open_idx ON suggestions (user_id, created_at DESC) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS suggestions_dedupe_key ON suggestions (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Obsidian-like knowledge vault: one row per Markdown file (CLOQI.md, user.md, soul.md, wiki/…).
CREATE TABLE IF NOT EXISTS vault_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path        text NOT NULL CHECK (path ~ '^[A-Za-z0-9ÄÖÜäöüß _.\-/]+\.md$' AND path NOT LIKE '%..%' AND length(path) <= 160),
  content     text NOT NULL DEFAULT '' CHECK (length(content) <= 100000),
  updated_by  text NOT NULL CHECK (updated_by IN ('user', 'ai', 'system')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, path)
);

-- Everything the AI changed. Append-only for the app; shown as wiki/log.md.
CREATE TABLE IF NOT EXISTS ai_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool        text NOT NULL,
  summary     text NOT NULL CHECK (length(summary) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_actions_user_idx ON ai_actions (user_id, created_at DESC);

-- Usage counter for the soft abuse limits (lib/limits.ts). Independent of chats: deleting a chat doesn't reset it.
CREATE TABLE IF NOT EXISTS ai_usage (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('ai', 'voice')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage (user_id, kind, created_at DESC);

-- One row per conversation with CLOQI AI (chat history like ChatGPT/Claude).
CREATE TABLE IF NOT EXISTS chat_threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'Neuer Chat' CHECK (length(title) BETWEEN 1 AND 80),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_threads_user_idx ON chat_threads (user_id, updated_at DESC);
-- deletions CLOQI asked the user to confirm (server-side, so a plain "ja" can only confirm exactly these)
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS pending jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id   uuid REFERENCES chat_threads(id) ON DELETE CASCADE,   -- NULL only for messages from before chat history existed
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL CHECK (length(content) <= 8000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_user_idx ON chat_messages (user_id, created_at DESC);
-- upgrade for databases created before chat history existed
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS chat_thread_idx ON chat_messages (thread_id, created_at);

-- ---------- HEALTH (optional module) ----------------------------------------------------------

-- Date, symptoms, mood … are inside data_enc (AES-256-GCM): the database never sees health data in clear text.
CREATE TABLE IF NOT EXISTS cycle_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_enc    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cycle_user_idx ON cycle_entries (user_id);

-- ---------- triggers ------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'study_settings', 'events', 'vault_files'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------- SPORT -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  exercises   jsonb NOT NULL DEFAULT '[]'::jsonb,        -- [{id, name, kind, sets:[{kg, reps, sec, km}]}]
  schedule    jsonb,                                     -- {weekdays:[1,3], time:'18:00', minutes:90}
  event_id    uuid REFERENCES events(id) ON DELETE SET NULL,  -- the weekly calendar series
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id  uuid REFERENCES workout_templates(id) ON DELETE SET NULL,
  name         text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,                              -- null = running
  exercises    jsonb NOT NULL DEFAULT '[]'::jsonb,
  note         text
);
CREATE INDEX IF NOT EXISTS workouts_user_idx ON workouts (user_id, finished_at DESC);

-- ---------- lock the public Supabase API --------------------------------------------------
-- CLOQI only talks to the database server-side (DATABASE_URL). Row level security without
-- policies + revoked grants make the tables unreachable with the public anon/authenticated keys.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'profiles', 'study_settings', 'subjects', 'sessions', 'calendar_connections', 'calendars',
    'events', 'timetable_entries', 'school_holidays', 'tasks', 'study_blocks', 'sync_mappings', 'suggestions', 'vault_files',
    'ai_actions', 'ai_usage', 'chat_threads', 'chat_messages', 'cycle_entries', 'school_items', 'workout_templates', 'workouts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
