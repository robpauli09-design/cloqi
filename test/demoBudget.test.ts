import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoBudget,
  demoDailyLimit,
  refundDemoRequest,
  reserveDemoRequest,
} from "../src/services/demoBudget";

const store = new Map<string, string>();
const globals = globalThis as Record<string, unknown>;
// The stubs exist only while the synchronous call runs: other suites share this
// process and libraries there switch to browser mode when they spot `window`.
function inBrowser<T>(run: () => T): T {
  globals.localStorage = {
    getItem: (name: string) => store.get(name) ?? null,
    setItem: (name: string, value: string) => void store.set(name, value),
    removeItem: (name: string) => void store.delete(name),
  };
  globals.window = { dispatchEvent: () => true };
  globals.Event = class {
    constructor(public type: string) {}
  };
  try {
    return run();
  } finally {
    delete globals.localStorage;
    delete globals.window;
    delete globals.Event;
  }
}
const key = "kloqi-ai-demo-budget-v1";

test("a browser gets ten tries per UTC day and is refused afterwards", () => {
  store.clear();
  inBrowser(() => {
    for (let i = 0; i < demoDailyLimit; i++)
      assert.equal(reserveDemoRequest(), true);
    assert.equal(demoBudget().used, demoDailyLimit);
    assert.equal(reserveDemoRequest(), false);
    assert.equal(demoBudget().used, demoDailyLimit);
  });
});

test("an attempt that failed is refunded instead of burning a daily try", () => {
  store.clear();
  inBrowser(() => {
    reserveDemoRequest();
    reserveDemoRequest();
    refundDemoRequest();
    assert.equal(demoBudget().used, 1);
    refundDemoRequest();
    refundDemoRequest();
    assert.equal(demoBudget().used, 0);
  });
});

test("yesterday's counter and unreadable storage both start from a full budget", () => {
  for (const stored of ['{"day":"2000-01-01","used":10}', "not json", ""]) {
    store.set(key, stored);
    inBrowser(() => {
      assert.equal(demoBudget().used, 0);
      assert.equal(reserveDemoRequest(), true);
      assert.equal(demoBudget().day, new Date().toISOString().slice(0, 10));
    });
  }
});
