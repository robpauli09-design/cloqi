import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAI } from "../server/openai";
import { readConfig } from "../server/config";
import { HttpError } from "../server/errors";
const config = readConfig({ OPENAI_API_KEY: "test-only-secret" });
function output(text: string, status = "completed") {
  return Response.json({
    id: "resp_test",
    object: "response",
    created_at: 0,
    status,
    model: "gpt-5-mini",
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  });
}
test("chat uses Responses with server key, store:false and minimized context", async () => {
  const result = await generateAI(
    {
      action: "chat",
      messages: [{ role: "user", content: "Welche Aufgabe zuerst?" }],
      context: {
        tasks: [
          {
            id: "t",
            title: "Prüfen",
            person: "PRIVATE PERSON",
            description: "PRIVATE DESCRIPTION",
            process: "production",
            priority: "Hoch",
            due: "Heute",
            done: false,
          },
        ],
        mission: 0,
      },
    },
    config,
    async (url, init) => {
      assert(String(url).endsWith("/v1/responses"));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.model, "gpt-5-mini");
      assert.equal(body.reasoning.effort, "low");
      assert(!body.input.includes("PRIVATE"));
      assert(body.input.includes("Welche Aufgabe"));
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer test-only-secret",
      );
      return output("Bitte den Prüfschritt besprechen.");
    },
  );
  assert.equal(result.source, "openai");
  assert.equal(result.text, "Bitte den Prüfschritt besprechen.");
});
test("analysis requests strict structured output and validates the returned recommendation", async () => {
  const analysis = {
    title: "Übergabe prüfen",
    findings: ["Zwei Prüfschritte"],
    recommendation: "Mit Qualität abstimmen",
    estimatedMinutesSaved: null,
  };
  const result = await generateAI(
    {
      action: "analyze",
      processId: "packaging",
      context: { tasks: [], mission: 0 },
    },
    config,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert(body.input.includes("Verpackung"));
      return output(JSON.stringify(analysis));
    },
  );
  assert.deepEqual(result.analysis, analysis);
});
test("summary sends selected article and rejects incomplete or malformed analyses", async () => {
  await generateAI(
    { action: "summarize", articleId: "quality" },
    config,
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert(body.input.includes("title"));
      assert(body.instructions.includes("Fasse ausschließlich"));
      return output("Zusammenfassung.");
    },
  );
  await assert.rejects(
    generateAI(
      { action: "summarize", articleId: "quality" },
      config,
      async () => output("", "incomplete"),
    ),
    (e) => e instanceof HttpError && e.code === "ai_incomplete",
  );
  await assert.rejects(
    generateAI(
      {
        action: "analyze",
        processId: "raw",
        context: { tasks: [], mission: 0 },
      },
      config,
      async () => output('{"invalid":true}'),
    ),
    (e) => e instanceof HttpError && e.code === "invalid_ai_response",
  );
});
test("OpenAI authentication, budget and provider failures are translated without leaking response bodies", async () => {
  for (const [status, code] of [
    [401, "openai_key_invalid"],
    [429, "openai_limit"],
    [403, "openai_model_unavailable"],
    [500, "openai_unavailable"],
  ] as const) {
    await assert.rejects(
      generateAI(
        { action: "summarize", articleId: "quality" },
        config,
        async () =>
          Response.json(
            { error: { message: "PRIVATE PROVIDER DETAILS", type: "test" } },
            { status },
          ),
      ),
      (e) =>
        e instanceof HttpError &&
        e.code === code &&
        !e.message.includes("PRIVATE"),
    );
  }
});
