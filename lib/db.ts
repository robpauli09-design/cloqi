import 'server-only';

// PostgreSQL (Supabase, EU region) via DATABASE_URL – server side only.
// Queries are written with `?` placeholders; values are returned in the shapes the app uses:
//   timestamptz → ISO string ("2026-11-23T07:00:00.000Z"), date → "YYYY-MM-DD", time → "HH:MM",
//   jsonb → parsed JSON, boolean → boolean.

export type Param = string | number | boolean | null;
export type Row = Record<string, unknown>;

export interface Db {
  all(sql: string, params?: Param[]): Promise<Row[]>;
  get(sql: string, params?: Param[]): Promise<Row | undefined>;
  run(sql: string, params?: Param[]): Promise<void>;
  /** Runs `fn` in one transaction; use the passed handle for every statement inside. */
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
}

const toPg = (sql: string) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

interface PgSql {
  unsafe(q: string, p?: Param[]): Promise<Row[]>;
  begin<T>(fn: (tx: PgSql) => Promise<T>): Promise<T>;
}

function wrap(sql: PgSql): Db {
  return {
    all: async (q, p = []) => [...(await sql.unsafe(toPg(q), p))],
    get: async (q, p = []) => (await sql.unsafe(toPg(q), p))[0],
    run: async (q, p = []) => { await sql.unsafe(toPg(q), p); },
    tx: fn => sql.begin(tx => fn(wrap(tx))),
  };
}

/** Keep in sync with supabase/schema.sql – only ADD … IF NOT EXISTS style statements here. */
const UPGRADES = [
  "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('m', 'w', 'd'))",
  // chat history (conversations)
  `CREATE TABLE IF NOT EXISTS chat_threads (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     title text NOT NULL DEFAULT 'Neuer Chat' CHECK (length(title) BETWEEN 1 AND 80),
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now())`,
  'CREATE INDEX IF NOT EXISTS chat_threads_user_idx ON chat_threads (user_id, updated_at DESC)',
  'ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE',
  'CREATE INDEX IF NOT EXISTS chat_thread_idx ON chat_messages (thread_id, created_at)',
  'ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY',
  "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.chat_threads FROM anon, authenticated; END IF; END $$",
];

const isoInstant =(x: string) => new Date(x.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString();

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL fehlt (Supabase → Project Settings → Database → Connection string).');
  const { default: postgres } = await import('postgres');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // TLS: with DATABASE_CA_CERT (Supabase → Project Settings → Database → SSL certificate, PEM content)
  // the server certificate is fully verified. Without it the connection is still encrypted,
  // but the server identity is not checked – set the CA for production.
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  if (!local && !ca && process.env.NODE_ENV === 'production') {
    console.warn('[cloqi] DATABASE_CA_CERT fehlt: Datenbankverbindung ist verschlüsselt, das Server-Zertifikat wird aber nicht geprüft.');
  }
  const ssl = local ? false : ca ? { rejectUnauthorized: true, ca } : 'require';
  const sql = postgres(url, {
    prepare: false,           // required for Supabase's transaction pooler (port 6543) on serverless hosts
    max: Number(process.env.DATABASE_POOL_MAX ?? 3), idle_timeout: 20, connect_timeout: 15,
    ssl,
    types: {
      instant: { to: 1184, from: [1184, 1114], serialize: (x: unknown) => String(x), parse: isoInstant },
      day: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
      clock: { to: 1083, from: [1083], serialize: (x: unknown) => String(x), parse: (x: string) => x.slice(0, 5) },
    },
  }) as unknown as PgSql;
  const db = wrap(sql);
  const ok = await db.get("SELECT to_regclass('public.vault_files') AS t");
  if (!ok?.t) throw new Error('Die Datenbank ist noch nicht eingerichtet: bitte supabase/schema.sql im Supabase SQL Editor ausführen.');
  // Small additive upgrades for databases created with an older schema.sql (idempotent, never drop data).
  for (const stmt of UPGRADES) {
    try { await db.run(stmt); } catch (e) { console.error('[cloqi] Datenbank-Upgrade fehlgeschlagen:', stmt, e); }
  }
  return db;
}

declare global {
  // eslint-disable-next-line no-var
  var __cloqiDb: Promise<Db> | undefined;
}

export function db(): Promise<Db> {
  if (!globalThis.__cloqiDb) globalThis.__cloqiDb = open().catch(e => { globalThis.__cloqiDb = undefined; throw e; });
  return globalThis.__cloqiDb;
}

export function newId(): string { return crypto.randomUUID(); }
export function nowIso(): string { return new Date().toISOString(); }
