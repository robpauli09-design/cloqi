import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../server/handler";
import { readConfig } from "../server/config";
import { HttpError } from "../server/errors";
import { initialWorkspace, authenticate } from "../server/supabase";
import type { AuthContext } from "../server/supabase";
import { allowedLocalHost } from "../server/dev";
const local = readConfig({ OPENAI_API_KEY: "test-secret" }, true);
const cloud = {
  ...local,
  localDevelopment: false,
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "public-key",
};
const input = { action: "summarize", articleId: "quality" };
function req(path = "/api/ai", body: unknown = input, extra: RequestInit = {}) {
  return new Request(`https://kloqi.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...extra,
  });
}
test("status exposes configuration flags, never credentials", async () => {
  const r = await createHandler()(
    new Request("https://kloqi.example/api/status"),
    cloud,
  );
  assert.equal(r.status, 200);
  const body = await r.text();
  assert(!body.includes("test-secret"));
  assert(!body.includes("public-key"));
  assert.equal(JSON.parse(body).authRequired, true);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});
test("production fails closed without Supabase", async () => {
  const r = await createHandler()(req(), { ...local, localDevelopment: false });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, "supabase_missing");
});
test("auth validator rejects absent and empty bearer token before contacting Supabase", async () => {
  for (const header of ["", "Bearer "])
    await assert.rejects(
      authenticate(
        req("/api/ai", input, { headers: { authorization: header } }),
        cloud,
      ),
      (e) => e instanceof HttpError && e.status === 401,
    );
});
test("unauthorized calls cannot consume quota or invoke OpenAI", async () => {
  let called = false;
  const h = createHandler({
    authenticate: async () => {
      throw new HttpError(401, "sign_in_required", "Bitte anmelden.");
    },
    generateAI: async () => {
      called = true;
      throw Error();
    },
    claimQuota: async () => {
      called = true;
    },
  });
  assert.equal((await h(req(), cloud)).status, 401);
  assert.equal(called, false);
});
test("live request requires auth then quota and returns actual generated output", async () => {
  const order: string[] = [];
  const h = createHandler({
    authenticate: async () => {
      order.push("auth");
      return {} as AuthContext;
    },
    claimQuota: async () => {
      order.push("quota");
    },
    generateAI: async (data) => {
      order.push("ai");
      assert.equal(data.action, "summarize");
      return {
        text: "Generated result",
        model: "test-model",
        source: "openai",
      };
    },
  });
  const r = await h(req(), cloud);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).text, "Generated result");
  assert.deepEqual(order, ["auth", "quota", "ai"]);
});
test("quota failure stops OpenAI and sends a retry hint", async () => {
  const h = createHandler({
    authenticate: async () => ({}) as AuthContext,
    claimQuota: async () => {
      throw new HttpError(429, "rate_limit", "Limit");
    },
    generateAI: async () => {
      assert.fail("must not run");
    },
  });
  const r = await h(req(), cloud);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "60");
});
test("local-only quota caps provider calls at 20 per minute and 200 per day", async () => {
  let time = 0,
    count = 0;
  const h = createHandler({
    now: () => time,
    generateAI: async () => {
      count++;
      return { text: "ok", source: "openai", model: "test" };
    },
  });
  for (let minute = 0; minute < 10; minute++) {
    time = minute * 60000;
    for (let n = 0; n < 20; n++)
      assert.equal((await h(req(), local)).status, 200);
    assert.equal((await h(req(), local)).status, 429);
  }
  time = 600000;
  assert.equal((await h(req(), local)).status, 429);
  assert.equal(count, 200);
  time = 86400000;
  assert.equal((await h(req(), local)).status, 200);
});
test("request validation blocks malformed JSON, unsupported inputs, large bodies and methods", async () => {
  const h = createHandler();
  const cases: Array<[Request, number]> = [
    [req("/api/ai", {}, { body: "{" }), 400],
    [req("/api/ai", { ...input, apiKey: "not-allowed" }), 400],
    [req("/api/ai", input, { headers: { "Content-Type": "text/plain" } }), 415],
    [req("/api/ai", input, { body: "x".repeat(65537) }), 413],
    [new Request("https://kloqi.example/api/ai"), 405],
    [new Request("https://kloqi.example/api/unknown"), 404],
  ];
  for (const [request, status] of cases)
    assert.equal((await h(request, local)).status, status);
});
test("CORS rejects untrusted origins and allows explicit native clients", async () => {
  const h = createHandler();
  assert.equal(
    (
      await h(
        req("/api/ai", input, { headers: { Origin: "https://evil.example" } }),
        local,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h(
        req("/api/ai", input, { headers: { "Sec-Fetch-Site": "cross-site" } }),
        local,
      )
    ).status,
    403,
  );
  const r = await h(
    new Request("https://kloqi.example/api/ai", {
      method: "OPTIONS",
      headers: {
        Origin: "capacitor://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    }),
    { ...cloud, allowedOrigins: ["capacitor://localhost"] },
  );
  assert.equal(r.status, 204);
  assert.equal(
    r.headers.get("Access-Control-Allow-Origin"),
    "capacitor://localhost",
  );
});
test("workspace saves pass verified identity, revision and validated state", async () => {
  const state = initialWorkspace();
  let saved = false;
  const h = createHandler({
    authenticate: async () => ({ userId: "u" }) as AuthContext,
    saveWorkspace: async (auth, id, revision, snapshot) => {
      assert.equal(auth.userId, "u");
      assert.equal(revision, 7);
      assert.deepEqual(snapshot, state);
      saved = true;
      return { workspaceId: id, state: snapshot, revision: 8 };
    },
  });
  const body = {
    workspaceId: "12345678-1234-4234-8234-123456789abc",
    revision: 7,
    state,
  };
  const r = await h(req("/api/workspace", body, { method: "PUT" }), cloud);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).revision, 8);
  assert(saved);
});
test("stale save reports 409 and unexpected provider errors are redacted", async () => {
  const h = createHandler({
    generateAI: async () => {
      throw Error("test-secret private-provider-payload");
    },
    authenticate: async () => ({}) as AuthContext,
    saveWorkspace: async () => {
      throw new HttpError(409, "revision_conflict", "Neu laden.");
    },
  });
  const r = await h(req(), local);
  assert.equal(r.status, 500);
  assert(!(await r.text()).includes("test-secret"));
  const stale = await h(
    req(
      "/api/workspace",
      {
        workspaceId: "12345678-1234-4234-8234-123456789abc",
        revision: 0,
        state: initialWorkspace(),
      },
      { method: "PUT" },
    ),
    cloud,
  );
  assert.equal(stale.status, 409);
});
test("local server rejects DNS rebinding Host headers", () => {
  assert(allowedLocalHost("127.0.0.1:5173", 5173));
  assert(allowedLocalHost("localhost:5173", 5173));
  assert(!allowedLocalHost("attacker.example:5173", 5173));
  assert(!allowedLocalHost("localhost:9999", 5173));
  assert(!allowedLocalHost(undefined, 5173));
});
