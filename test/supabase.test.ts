import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite, type Transaction } from "@electric-sql/pglite";

// Executes the actual migration in a PostgreSQL WASM engine. Only Supabase's
// auth schema/JWT helper are stubbed; RLS, roles, grants and PL/pgSQL are real.
const owner = "00000000-0000-4000-8000-000000000001";
const stranger = "00000000-0000-4000-8000-000000000002";
const member = "00000000-0000-4000-8000-000000000003";
const quotaUser = "00000000-0000-4000-8000-000000000004";
const initial = { tasks: [], mission: 0, feedback: [], analyzed: [] };
let db: PGlite;
let workspaceId: string;

async function asUser<T>(
  userId: string | null,
  run: (tx: Transaction) => Promise<T>,
  role: "authenticated" | "anon" = "authenticated",
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    return run(tx);
  });
}

async function ensure(userId: string, snapshot: unknown = initial) {
  return asUser(userId, async (tx) => {
    const result = await tx.query<{
      workspace_id: string;
      state: typeof initial;
      revision: number;
    }>("select * from public.ensure_workspace($1::jsonb)", [
      JSON.stringify(snapshot),
    ]);
    return result.rows[0];
  });
}

async function save(
  userId: string,
  id: string,
  revision: number,
  snapshot: unknown,
) {
  return asUser(userId, (tx) =>
    tx.query<{ state: typeof initial; revision: number }>(
      "select * from public.save_workspace($1::uuid, $2::integer, $3::jsonb)",
      [id, revision, JSON.stringify(snapshot)],
    ),
  );
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const id of [owner, stranger, member, quotaUser]) {
    await db.query("insert into auth.users(id) values ($1)", [id]);
  }
  for (const file of [
    "202609220001_kloqi_backend.sql",
    "202609230001_demo_ai_quota.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  workspaceId = (await ensure(owner)).workspace_id;
});

after(async () => {
  await db?.close();
});

describe(
  "Supabase workspace and quota isolation",
  { concurrency: false },
  () => {
    it("seeds exactly one workspace and preserves saved state on subsequent ensure calls", async () => {
      const again = await ensure(owner, { ...initial, mission: 3 });
      assert.equal(again.workspace_id, workspaceId);
      assert.equal(again.revision, 0);
      assert.equal(again.state.mission, 0);
      const rows = await asUser(owner, (tx) =>
        tx.query("select * from public.workspaces"),
      );
      assert.equal(rows.rows.length, 1);
    });

    it("rejects anonymous table reads and every anonymous RPC", async () => {
      for (const sql of [
        "select * from public.workspaces",
        "select * from public.workspace_members",
        "select * from public.workspace_states",
        'select * from public.ensure_workspace(\'{"tasks":[],"mission":0}\')',
        `select * from public.save_workspace('${workspaceId}', 0, '{"tasks":[],"mission":0}')`,
        "select public.claim_ai_request()",
      ]) {
        await assert.rejects(
          asUser(null, (tx) => tx.exec(sql), "anon"),
          { code: "42501" },
        );
      }
    });

    it("checks auth.uid even when the caller has the authenticated SQL role", async () => {
      await assert.rejects(
        asUser(null, (tx) =>
          tx.query("select * from public.ensure_workspace($1::jsonb)", [
            JSON.stringify(initial),
          ]),
        ),
        { code: "42501", message: "authentication_required" },
      );
      await assert.rejects(
        asUser(null, (tx) => tx.query("select public.claim_ai_request()")),
        { code: "42501", message: "authentication_required" },
      );
    });

    it("hides all of another user's workspace rows and prevents cross-tenant updates", async () => {
      for (const table of [
        "workspaces",
        "workspace_members",
        "workspace_states",
      ]) {
        const result = await asUser(stranger, (tx) =>
          tx.query(`select * from public.${table}`),
        );
        assert.equal(result.rows.length, 0);
      }
      await assert.rejects(save(stranger, workspaceId, 0, initial), {
        code: "42501",
        message: "workspace_forbidden",
      });
      const other = await ensure(stranger);
      assert.notEqual(other.workspace_id, workspaceId);
      const rows = await asUser(stranger, (tx) =>
        tx.query("select * from public.workspace_states"),
      );
      assert.equal(rows.rows.length, 1);
    });

    it("allows a non-owner member to read and save without recursive RLS", async () => {
      await db.query(
        "insert into public.workspace_members(workspace_id, user_id, role) values ($1, $2, 'member')",
        [workspaceId, member],
      );
      for (const table of [
        "workspaces",
        "workspace_members",
        "workspace_states",
      ]) {
        const result = await asUser(member, (tx) =>
          tx.query(`select * from public.${table}`),
        );
        assert.equal(result.rows.length, table === "workspace_members" ? 2 : 1);
      }
      const result = await save(member, workspaceId, 0, {
        ...initial,
        mission: 1,
      });
      assert.equal(result.rows[0].revision, 1);
    });

    it("refuses membership escalation and direct writes, including writes by owners", async () => {
      for (const sql of [
        `insert into public.workspace_members(workspace_id, user_id, role) values ('${workspaceId}', '${stranger}', 'owner')`,
        "update public.workspace_members set role = 'owner'",
        "delete from public.workspace_members",
        "update public.workspace_states set revision = 999",
        "delete from public.workspace_states",
        "update public.workspaces set name = 'forged'",
      ]) {
        await assert.rejects(
          asUser(owner, (tx) => tx.exec(sql)),
          { code: "42501" },
        );
      }
    });

    it("rejects stale revisions without overwriting a newer snapshot", async () => {
      await assert.rejects(
        save(owner, workspaceId, 0, { ...initial, mission: 2 }),
        { code: "P0001", message: "revision_conflict" },
      );
      const state = await ensure(owner);
      assert.equal(state.revision, 1);
      assert.equal(state.state.mission, 1);
      const saved = await save(owner, workspaceId, 1, {
        ...initial,
        mission: 2,
      });
      assert.equal(saved.rows[0].revision, 2);
      assert.equal(saved.rows[0].state.mission, 2);
    });

    it("validates direct RPC snapshots and leaves the revision unchanged on failure", async () => {
      const task = {
        id: "t1",
        title: "Übergabe prüfen",
        description: "Details",
        person: "Julia",
        due: "Heute",
        process: "production",
        priority: "Hoch",
        done: false,
      };
      const invalid = [
        null,
        [],
        {},
        { ...initial, mission: 4 },
        { ...initial, mission: null },
        { ...initial, tasks: {} },
        { ...initial, tasks: [{ ...task, priority: "admin" }] },
        { ...initial, tasks: [{ ...task, done: null }] },
        { ...initial, tasks: [task, task] },
        { ...initial, feedback: [null] },
        { ...initial, notifications: "false" },
        { ...initial, owner_id: owner },
        { ...initial, feedback: ["x".repeat(524289)] },
        {
          ...initial,
          analysisResults: {
            unknown: { source: "openai", model: "test", text: "text" },
          },
        },
        {
          ...initial,
          analysisResults: {
            raw: { source: "demo", model: "test", text: "text" },
          },
        },
        { ...initial, analyzed: ["unknown"] },
        { ...initial, tasks: [{ ...task, extra: true }] },
        {
          ...initial,
          analysisResults: {
            raw: { source: "openai", model: "", text: "text" },
          },
        },
        {
          ...initial,
          analysisResults: {
            raw: {
              source: "openai",
              model: "test",
              text: "text",
              analysis: {
                title: "t",
                findings: [],
                recommendation: "r",
                estimatedMinutesSaved: -1,
              },
            },
          },
        },
      ];
      for (const snapshot of invalid) {
        await assert.rejects(save(owner, workspaceId, 2, snapshot), {
          code: "22023",
          message: "invalid_snapshot",
        });
      }
      assert.equal((await ensure(owner)).revision, 2);
      const valid = {
        ...initial,
        tasks: [task],
        analysisResults: {
          production: {
            source: "openai",
            model: "test-model",
            text: "Analyse",
            analysis: {
              title: "Übergabe",
              findings: ["Wartezeit"],
              recommendation: "Prüfen",
              estimatedMinutesSaved: null,
            },
          },
        },
      };
      const saved = await save(owner, workspaceId, 2, valid);
      assert.equal(saved.rows[0].revision, 3);
      assert.deepEqual(saved.rows[0].state, valid);
    });

    it("limits an authenticated user to 20 requests per UTC minute", async () => {
      const result = await asUser(quotaUser, (tx) =>
        tx.query<{ allowed: boolean }>(
          "select public.claim_ai_request() as allowed from generate_series(1, 21)",
        ),
      );
      assert.deepEqual(
        result.rows.map((row) => row.allowed),
        [...Array(20).fill(true), false],
      );
      const different = await asUser(stranger, (tx) =>
        tx.query<{ allowed: boolean }>(
          "select public.claim_ai_request() as allowed",
        ),
      );
      assert.equal(different.rows[0].allowed, true);
    });

    it("does not expose quota counters or allow clients to reset them", async () => {
      for (const sql of [
        "select * from kloqi_private.ai_usage",
        "update kloqi_private.ai_usage set minute_count = 0, day_count = 0",
        "delete from kloqi_private.ai_usage",
      ]) {
        await assert.rejects(
          asUser(quotaUser, (tx) => tx.exec(sql)),
          { code: "42501" },
        );
      }
    });

    it("enforces the daily cap independently and replenishes only expired UTC windows", async () => {
      // Admin-only fixture placement avoids waiting 24 hours. Calls below still
      // use the authenticated role, real locks, and the deployed RPC itself.
      await db.query(
        `
      update kloqi_private.ai_usage set minute_started = now() - interval '2 minutes',
        minute_count = 20, day_started = (now() at time zone 'UTC')::date, day_count = 199
      where user_id = $1`,
        [quotaUser],
      );
      const daily = await asUser(quotaUser, (tx) =>
        tx.query<{ allowed: boolean }>(
          "select public.claim_ai_request() as allowed from generate_series(1, 2)",
        ),
      );
      assert.deepEqual(
        daily.rows.map((row) => row.allowed),
        [true, false],
      );
      await db.query(
        `
      update kloqi_private.ai_usage set minute_started = now() - interval '1 day',
        minute_count = 20, day_started = (now() at time zone 'UTC')::date - 1, day_count = 200
      where user_id = $1`,
        [quotaUser],
      );
      const refreshed = await asUser(quotaUser, (tx) =>
        tx.query<{ allowed: boolean }>(
          "select public.claim_ai_request() as allowed",
        ),
      );
      assert.equal(refreshed.rows[0].allowed, true);
      const counter = await db.query<{
        minute_count: number;
        day_count: number;
      }>(
        "select minute_count, day_count from kloqi_private.ai_usage where user_id = $1",
        [quotaUser],
      );
      assert.deepEqual(counter.rows[0], { minute_count: 1, day_count: 1 });
    });
  },
);

async function claimDemo(role: "anon" | "authenticated" = "anon") {
  return asUser(
    null,
    async (tx) => {
      const result = await tx.query<{ remaining: number }>(
        "select public.claim_demo_ai_quota() as remaining",
      );
      return result.rows[0].remaining;
    },
    role,
  );
}
const rateLimited = (error: unknown) =>
  error instanceof Error && error.message.includes("demo_rate_limit");

describe("shared public demo budget", { concurrency: false }, () => {
  it("pools every visitor into one budget and stops at three per minute", async () => {
    await db.exec("delete from kloqi_private.demo_ai_budget");
    assert.deepEqual(
      [await claimDemo(), await claimDemo("authenticated"), await claimDemo()],
      [49, 48, 47],
    );
    await assert.rejects(claimDemo(), rateLimited);
    const counter = await db.query<{ minute_count: number }>(
      "select minute_count from kloqi_private.demo_ai_budget",
    );
    assert.equal(counter.rows[0].minute_count, 3);
  });

  it("caps the whole demo at fifty per UTC day even while minutes are free", async () => {
    const freeMinute = `update kloqi_private.demo_ai_budget
      set minute_bucket = now() - interval '1 hour', minute_count = 3`;
    await db.query(
      "update kloqi_private.demo_ai_budget set day_count = 49, minute_bucket = now() - interval '1 hour', minute_count = 3",
    );
    assert.equal(await claimDemo(), 0);
    await db.query(freeMinute);
    await assert.rejects(claimDemo(), rateLimited);
    const counter = await db.query<{ day_count: number }>(
      "select day_count from kloqi_private.demo_ai_budget",
    );
    assert.equal(counter.rows[0].day_count, 50);
  });

  it("replenishes only after the UTC day rolls over", async () => {
    await db.query(
      "update kloqi_private.demo_ai_budget set day_bucket = day_bucket - interval '1 day', minute_bucket = now() - interval '1 hour'",
    );
    assert.equal(await claimDemo(), 49);
  });

  it("lets anonymous visitors consume but never read or reset the counter", async () => {
    for (const sql of [
      "select * from kloqi_private.demo_ai_budget",
      "update kloqi_private.demo_ai_budget set day_count = 0",
      "delete from kloqi_private.demo_ai_budget",
    ]) {
      await assert.rejects(
        asUser(null, (tx) => tx.exec(sql), "anon"),
        { code: "42501" },
      );
    }
    const counter = await db.query<{ day_count: number }>(
      "select day_count from kloqi_private.demo_ai_budget",
    );
    assert.equal(counter.rows[0].day_count, 1);
  });
});
