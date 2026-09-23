import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspaceSync } from "../src/backend/workspaceSync";
import { initialWorkspace } from "../server/supabase";
const record = { workspaceId: "test", state: initialWorkspace(), revision: 0 };
test("saving queues edits made during an in-flight save without losing either edit", async () => {
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  const saved: number[] = [];
  const sync = new WorkspaceSync(
    record,
    async (revision, state) => {
      saved.push(state.mission);
      if (saved.length === 1) await pending;
      return { ...record, state, revision: revision + 1 };
    },
    () => {},
  );
  sync.update({ ...record.state, mission: 1 });
  const run = sync.flush();
  await Promise.resolve();
  sync.update({ ...record.state, mission: 2 });
  assert.equal(sync.flush(), run);
  release();
  await run;
  assert.deepEqual(saved, [1, 2]);
  assert(!sync.dirty);
});
test("conflict leaves local edits intact and stops automatic retries", async () => {
  let calls = 0;
  const sync = new WorkspaceSync(
    record,
    async () => {
      calls++;
      throw Error("revision_conflict");
    },
    () => {},
  );
  sync.update({ ...record.state, mission: 1 });
  await assert.rejects(sync.flush());
  sync.update({ ...record.state, mission: 2 });
  await assert.rejects(sync.flush());
  assert.equal(calls, 1);
  assert(sync.dirty);
});
test("explicit retry after network failure preserves revision and saves latest edits", async () => {
  let calls = 0;
  const sync = new WorkspaceSync(
    record,
    async (revision, state) => {
      calls++;
      assert.equal(revision, 0);
      if (calls === 1) throw Error("offline");
      return { ...record, state, revision: 1 };
    },
    () => {},
  );
  sync.update({ ...record.state, mission: 1 });
  await assert.rejects(sync.flush());
  sync.update({ ...record.state, mission: 3 });
  await sync.retry();
  assert(!sync.dirty);
  assert.equal(sync.error, null);
  assert.equal(calls, 2);
});
