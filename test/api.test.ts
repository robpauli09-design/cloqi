import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../server/handler";
import { readConfig } from "../server/config";
import { HttpError } from "../server/errors";
import { initialWorkspace, authenticate } from "../server/supabase";
import type { AuthContext } from "../server/supabase";
import { memoryQueue } from "../server/queue";
import type { AIQueue } from "../server/queue";
import { allowedLocalHost } from "../server/dev";
const local = readConfig({ AI_BASE_URL: "http://ai.test/v1", AI_MODEL: "test-model" }, true);
const cloud = {
  ...local,
  localDevelopment: false,
  supabaseUrl: "https://example.supabase.co",
  supabaseKey: "public-key",
};
const input = { action: "summarize", articleId: "quality" };
const TICKET = "12345678-1234-4234-8234-123456789abc";
function req(path = "/api/ai", body: unknown = input, extra: RequestInit = {}) {
  return new Request(`https://cloqi.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...extra,
  });
}
function withTicket(ticket: string, path = "/api/ai", body: unknown = input) {
  return req(path, body, {
    headers: { "Content-Type": "application/json", "X-AI-Ticket": ticket },
  });
}
type Handler = ReturnType<typeof createHandler>;
async function join(h: Handler, config: typeof local, mode = "") {
  const r = await h(req(`/api/ai-queue${mode}`, {}), config);
  return { status: r.status, body: await r.json() };
}
// Takes a place in the queue, then asks the AI, like the browser does.
async function ask(h: Handler, config: typeof local) {
  const joined = await join(h, config);
  if (joined.status !== 200) return joined.status;
  return (await h(withTicket(joined.body.ticket), config)).status;
}
// Records calls; every ticket is immediately ready unless told otherwise.
function fakeQueue(log: string[], overrides: Partial<AIQueue> = {}): () => AIQueue {
  const queue: AIQueue = {
    join: async (auth) => {
      log.push(auth ? "join:user" : "join:demo");
      return { ticket: TICKET };
    },
    poll: async () => {
      log.push("poll");
      return { position: 0, ready: true };
    },
    begin: async () => {
      log.push("begin");
      return true;
    },
    leave: async () => {
      log.push("leave");
    },
    ...overrides,
  };
  return () => queue;
}
const generated = { text: "Generated result", model: "test-model", source: "openai" as const };

test("status exposes configuration flags, never credentials", async () => {
  const r = await createHandler()(
    new Request("https://cloqi.example/api/status"),
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
test("unauthorized calls can neither join the queue nor invoke the AI server", async () => {
  const log: string[] = [];
  const h = createHandler({
    authenticate: async () => {
      throw new HttpError(401, "sign_in_required", "Bitte anmelden.");
    },
    generateAI: async () => {
      log.push("ai");
      throw Error();
    },
    queue: fakeQueue(log),
  });
  assert.equal((await h(req("/api/ai-queue", {}), cloud)).status, 401);
  assert.equal((await h(withTicket(TICKET), cloud)).status, 401);
  assert.deepEqual(log, []);
});
test("signed-in request: join spends the quota, then the granted turn runs the AI once and frees the slot", async () => {
  const log: string[] = [];
  const h = createHandler({
    authenticate: async () => {
      log.push("auth");
      return {} as AuthContext;
    },
    queue: fakeQueue(log),
    generateAI: async (data) => {
      log.push("ai");
      assert.equal(data.action, "summarize");
      return generated;
    },
  });
  const joined = await join(h, cloud);
  assert.equal(joined.status, 200);
  assert.deepEqual(joined.body, { ticket: TICKET, position: 0, ready: true });
  const r = await h(withTicket(TICKET), cloud);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).text, "Generated result");
  assert.deepEqual(log, ["auth", "join:user", "poll", "auth", "begin", "ai", "leave"]);
});
test("a quota failure at the queue door sends a retry hint and never reaches the AI", async () => {
  const h = createHandler({
    authenticate: async () => ({}) as AuthContext,
    queue: fakeQueue([], {
      join: async () => {
        throw new HttpError(429, "rate_limit", "Limit");
      },
    }),
    generateAI: async () => {
      assert.fail("must not run");
    },
  });
  const r = await h(req("/api/ai-queue", {}), cloud);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("Retry-After"), "60");
});
test("the AI only runs for a valid ticket whose turn has come, and only once", async () => {
  let calls = 0;
  const h = createHandler({
    generateAI: async () => {
      calls++;
      return generated;
    },
  });
  assert.equal((await h(req(), local)).status, 400);
  assert.equal((await h(withTicket("not-a-uuid"), local)).status, 400);
  const first = await join(h, local);
  const second = await join(h, local);
  assert.equal(first.body.ready, true);
  assert.deepEqual({ position: second.body.position, ready: second.body.ready }, { position: 1, ready: false });
  // The second caller cannot jump the queue.
  const early = await h(withTicket(second.body.ticket), local);
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, "ai_queue_not_ready");
  assert.equal((await h(withTicket(first.body.ticket), local)).status, 200);
  // A used ticket is gone: it cannot buy a second answer.
  assert.equal((await h(withTicket(first.body.ticket), local)).status, 409);
  // The slot is free again, so the next one in line is up.
  const poll = await h(
    new Request("https://cloqi.example/api/ai-queue", { headers: { "X-AI-Ticket": second.body.ticket } }),
    local,
  );
  assert.deepEqual(await poll.json(), { position: 0, ready: true });
  assert.equal(calls, 1);
});
test("abandoned places expire and leaving frees the queue for the next person", async () => {
  let time = 0;
  const h = createHandler({ now: () => time, generateAI: async () => generated });
  const first = await join(h, local);
  const second = await join(h, local);
  const third = await join(h, local);
  assert.equal(third.body.position, 2);
  // The first holder never starts within 20 s, the second leaves on purpose.
  time = 21_000;
  await h(
    new Request("https://cloqi.example/api/ai-queue", { method: "DELETE", headers: { "X-AI-Ticket": second.body.ticket } }),
    local,
  );
  const poll = await h(
    new Request("https://cloqi.example/api/ai-queue", { headers: { "X-AI-Ticket": third.body.ticket } }),
    local,
  );
  assert.deepEqual(await poll.json(), { position: 0, ready: true });
  const gone = await h(
    new Request("https://cloqi.example/api/ai-queue", { headers: { "X-AI-Ticket": first.body.ticket } }),
    local,
  );
  assert.equal(gone.status, 410);
});
test("a full queue turns new callers away before they spend quota", async () => {
  let spent = 0;
  const queue = memoryQueue(() => void spent++);
  for (let n = 0; n < 30; n++) await queue.join(null);
  await assert.rejects(
    queue.join(null),
    (e) => e instanceof HttpError && e.code === "ai_queue_full",
  );
  assert.equal(spent, 30);
});
test("local-only quota caps AI calls at 20 per minute and 200 per day", async () => {
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
    for (let n = 0; n < 20; n++) assert.equal(await ask(h, local), 200);
    assert.equal(await ask(h, local), 429);
  }
  time = 600000;
  assert.equal(await ask(h, local), 429);
  assert.equal(count, 200);
  time = 86400000;
  assert.equal(await ask(h, local), 200);
});
test("request validation blocks malformed JSON, unsupported inputs, large bodies and methods", async () => {
  const h = createHandler();
  const { ticket } = (await join(h, local)).body;
  const headers = { "Content-Type": "application/json", "X-AI-Ticket": ticket };
  const cases: Array<[Request, number]> = [
    [req("/api/ai", {}, { headers, body: "{" }), 400],
    [req("/api/ai", { ...input, apiKey: "not-allowed" }, { headers }), 400],
    [req("/api/ai", input, { headers: { ...headers, "Content-Type": "text/plain" } }), 415],
    [req("/api/ai", input, { headers, body: "x".repeat(65537) }), 413],
    [new Request("https://cloqi.example/api/ai"), 405],
    [new Request("https://cloqi.example/api/ai-queue", { method: "PUT" }), 405],
    [new Request("https://cloqi.example/api/unknown"), 404],
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
    new Request("https://cloqi.example/api/ai", {
      method: "OPTIONS",
      headers: {
        Origin: "capacitor://localhost",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,x-ai-ticket",
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
  let left = false;
  const h = createHandler({
    generateAI: async () => {
      throw Error("test-secret private-provider-payload");
    },
    authenticate: async () => ({}) as AuthContext,
    saveWorkspace: async () => {
      throw new HttpError(409, "revision_conflict", "Neu laden.");
    },
  });
  const { ticket } = (await join(h, local)).body;
  const r = await h(withTicket(ticket), local);
  assert.equal(r.status, 500);
  assert(!(await r.text()).includes("test-secret"));
  // A failed AI call still frees the slot for the next person.
  const next = await join(h, local);
  left = next.body.ready;
  assert(left);
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
const demoCloud = { ...cloud, demoAiEnabled: true };
test("demo endpoint stays closed until the operator enables it", async () => {
  const log: string[] = [];
  const h = createHandler({
    authenticate: async () => {
      log.push("auth");
      return {} as AuthContext;
    },
    queue: fakeQueue(log),
    generateAI: async () => {
      log.push("ai");
      throw Error();
    },
  });
  const r = await h(req("/api/ai-queue?mode=demo", {}), cloud);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, "demo_disabled");
  assert.equal((await h(withTicket(TICKET, "/api/demo-ai"), cloud)).status, 403);
  assert.deepEqual(log, []);
});
test("demo requests need no sign-in, spend the shared budget when joining and report what is left", async () => {
  const log: string[] = [];
  const h = createHandler({
    authenticate: async () => {
      assert.fail("the public demo must not require a Supabase session");
    },
    queue: fakeQueue(log, {
      join: async (auth) => {
        assert.equal(auth, null, "the public demo must not spend a personal quota");
        log.push("join:demo");
        return { ticket: TICKET, demoRemaining: 7 };
      },
    }),
    generateAI: async () => {
      log.push("ai");
      return { text: "Demo result", model: "test-model", source: "openai" };
    },
  });
  const joined = await join(h, demoCloud, "?mode=demo");
  assert.equal(joined.status, 200);
  assert.equal(joined.body.demoRemaining, 7);
  const r = await h(withTicket(TICKET, "/api/demo-ai"), demoCloud);
  assert.equal(r.status, 200);
  assert.deepEqual(log, ["join:demo", "poll", "begin", "ai", "leave"]);
});
test("an exhausted shared demo budget never reaches the AI server", async () => {
  const h = createHandler({
    queue: fakeQueue([], {
      join: async () => {
        throw new HttpError(429, "demo_rate_limit", "Die Demo macht kurz Pause.");
      },
    }),
    generateAI: async () => {
      assert.fail("must not run");
    },
  });
  const r = await join(h, demoCloud, "?mode=demo");
  assert.equal(r.status, 429);
  assert.equal(r.body.error.code, "demo_rate_limit");
});
test("signed-in requests keep their own quota and never touch the demo budget", async () => {
  const log: string[] = [];
  const h = createHandler({
    authenticate: async () => ({}) as AuthContext,
    queue: fakeQueue(log),
    generateAI: async () => ({
      text: "Live result",
      model: "test-model",
      source: "openai" as const,
    }),
  });
  const joined = await join(h, demoCloud);
  assert.equal(joined.body.demoRemaining, undefined);
  const r = await h(withTicket(TICKET), demoCloud);
  assert.equal(r.status, 200);
  assert.equal(log[0], "join:user");
});
