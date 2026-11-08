import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyStorage } from "../src/legacyStorage";

function memoryStorage(initial: Record<string, string>): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => void data.set(name, value),
    removeItem: (name: string) => void data.delete(name),
    clear: () => data.clear(),
  };
}

test("old KLOQI browser keys move to their CLOQI names", () => {
  const storage = memoryStorage({
    kloqi_user: "lea",
    "kloqi-demo-v1-lea": "{\"tasks\":[]}",
    "kloqi-ai-demo-budget-v1": "{\"used\":3}",
    unrelated: "keep",
  });
  migrateLegacyStorage(storage);
  assert.equal(storage.getItem("cloqi_user"), "lea");
  assert.equal(storage.getItem("cloqi-demo-v1-lea"), "{\"tasks\":[]}");
  assert.equal(storage.getItem("cloqi-ai-demo-budget-v1"), "{\"used\":3}");
  assert.equal(storage.getItem("kloqi_user"), null);
  assert.equal(storage.getItem("unrelated"), "keep");
});

test("a value already saved under the new name wins over the old one", () => {
  const storage = memoryStorage({ kloqi_user: "old", cloqi_user: "new" });
  migrateLegacyStorage(storage);
  assert.equal(storage.getItem("cloqi_user"), "new");
  assert.equal(storage.getItem("kloqi_user"), null);
});
