import { z } from "zod";
import { aiRequestSchema, workspaceSchema } from "../shared/contracts";
import type { BackendStatus } from "../shared/contracts";
import { hasSupabase } from "./config";
import type { ServerConfig } from "./config";
import { HttpError } from "./errors";
import { generateAI } from "./openai";
import {
  authenticate,
  claimQuota,
  claimDemoQuota,
  loadWorkspace,
  saveWorkspace,
} from "./supabase";

export const AI_BODY_LIMIT = 64 * 1024;
export const WORKSPACE_BODY_LIMIT = 600 * 1024;
const SNAPSHOT_LIMIT = 512 * 1024;
const saveRequestSchema = z
  .object({
    workspaceId: z.uuid(),
    revision: z.number().int().nonnegative(),
    state: workspaceSchema,
  })
  .strict();

interface Dependencies {
  authenticate: typeof authenticate;
  claimQuota: typeof claimQuota;
  claimDemoQuota: typeof claimDemoQuota;
  generateAI: typeof generateAI;
  loadWorkspace: typeof loadWorkspace;
  saveWorkspace: typeof saveWorkspace;
  now: () => number;
}

function rateLimitError() {
  return new HttpError(
    429,
    "rate_limit",
    "Dein KI-Limit ist erreicht (20 Anfragen pro Minute, 200 pro Tag). Bitte versuche es später erneut.",
  );
}

// This fallback is only used by the loopback development server without
// Supabase. Production always consumes the atomic database-backed quota.
function localQuota(now: () => number) {
  let minute = -1,
    day = -1,
    minuteCount = 0,
    dayCount = 0;
  return () => {
    const timestamp = now();
    const currentMinute = Math.floor(timestamp / 60_000);
    const currentDay = Math.floor(timestamp / 86_400_000);
    if (minute !== currentMinute) {
      minute = currentMinute;
      minuteCount = 0;
    }
    if (day !== currentDay) {
      day = currentDay;
      dayCount = 0;
    }
    if (minuteCount >= 20 || dayCount >= 200) throw rateLimitError();
    minuteCount++;
    dayCount++;
  };
}

function checkOrigin(request: Request, config: ServerConfig, headers: Headers) {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Native clients may omit Origin. Browsers making cross-site requests
    // must pass the allowlist even if an unusual request omitted Origin.
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new HttpError(
        403,
        "origin_forbidden",
        "Diese Herkunft ist für die API nicht freigegeben.",
      );
    }
    return;
  }
  if (
    origin === "null" ||
    (origin !== new URL(request.url).origin &&
      !config.allowedOrigins.includes(origin))
  ) {
    throw new HttpError(
      403,
      "origin_forbidden",
      "Diese Herkunft ist für die API nicht freigegeben.",
    );
  }
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "600");
}

async function readJson(request: Request, limit: number): Promise<unknown> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(
      415,
      "json_required",
      "Bitte sende die Anfrage als application/json.",
    );
  }
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length))
      throw new HttpError(400, "invalid_body", "Die Anfrage ist ungültig.");
    if (Number(length) > limit)
      throw new HttpError(
        413,
        "body_too_large",
        "Die Anfrage enthält zu viele Daten.",
      );
  }
  const reader = request.body?.getReader();
  if (!reader)
    throw new HttpError(
      400,
      "invalid_json",
      "Die Anfrage enthält kein gültiges JSON.",
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(
          413,
          "body_too_large",
          "Die Anfrage enthält zu viele Daten.",
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      400,
      "invalid_json",
      "Die Anfrage enthält kein gültiges JSON.",
    );
  } finally {
    reader.releaseLock();
  }
}

const methods: Record<string, string[]> = {
  "/api/status": ["GET"],
  "/api/ai": ["POST"],
  "/api/demo-ai": ["POST"],
  "/api/workspace": ["GET", "PUT"],
};

export function createHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    authenticate,
    claimQuota,
    claimDemoQuota,
    generateAI,
    loadWorkspace,
    saveWorkspace,
    now: Date.now,
    ...overrides,
  };
  const claimLocalQuota = localQuota(dependencies.now);
  return async function handle(
    request: Request,
    config: ServerConfig,
  ): Promise<Response> {
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    });
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers });
    try {
      checkOrigin(request, config, headers);
      const path = new URL(request.url).pathname;
      const supported = methods[path];
      if (!supported)
        throw new HttpError(
          404,
          "not_found",
          "Dieser API-Endpunkt existiert nicht.",
        );
      headers.set("Allow", [...supported, "OPTIONS"].join(", "));
      if (request.method === "OPTIONS") {
        const requestedMethod = request.headers.get(
          "access-control-request-method",
        );
        if (requestedMethod && !supported.includes(requestedMethod)) {
          throw new HttpError(
            405,
            "method_not_allowed",
            "Diese HTTP-Methode wird hier nicht unterstützt.",
          );
        }
        const requestedHeaders = (
          request.headers.get("access-control-request-headers") || ""
        )
          .split(",")
          .map((header) => header.trim().toLowerCase())
          .filter(Boolean);
        if (
          requestedHeaders.some(
            (header) => !["authorization", "content-type"].includes(header),
          )
        ) {
          throw new HttpError(
            400,
            "headers_not_allowed",
            "Die Anfrage enthält nicht freigegebene Header.",
          );
        }
        return new Response(null, { status: 204, headers });
      }
      if (!supported.includes(request.method)) {
        throw new HttpError(
          405,
          "method_not_allowed",
          "Diese HTTP-Methode wird hier nicht unterstützt.",
        );
      }
      if (path === "/api/status") {
        const status: BackendStatus = {
          demoAiEnabled: Boolean(config.demoAiEnabled && config.openaiKey && hasSupabase(config)),
          aiConfigured: Boolean(config.openaiKey),
          authConfigured: hasSupabase(config),
          authRequired: !config.localDevelopment || hasSupabase(config),
          mode: config.localDevelopment ? "local" : "cloud",
          model: config.openaiKey ? config.model : null,
        };
        return json(status);
      }
      if (path === "/api/ai" || path === "/api/demo-ai") {
        const demo = path === "/api/demo-ai";
        if (demo && !config.demoAiEnabled) throw new HttpError(403,"demo_disabled","Die echte Demo-KI ist noch nicht freigeschaltet.");
        if (!config.localDevelopment && !hasSupabase(config)) {
          throw new HttpError(
            503,
            "supabase_missing",
            "Für den Online-Betrieb muss Supabase zuerst konfiguriert werden.",
          );
        }
        if (!config.openaiKey) {
          throw new HttpError(
            503,
            "openai_missing",
            "Der OpenAI-Schlüssel fehlt. Bitte OPENAI_API_KEY auf dem Server hinterlegen.",
          );
        }
        const parsed = aiRequestSchema.safeParse(
          await readJson(request, AI_BODY_LIMIT),
        );
        if (!parsed.success)
          throw new HttpError(
            400,
            "invalid_ai_request",
            "Die KI-Anfrage enthält ungültige oder zu viele Daten.",
          );
        let demoRemaining: number | undefined;
        if (demo) {
          demoRemaining = await dependencies.claimDemoQuota(config);
        } else if (hasSupabase(config)) {
          const auth = await dependencies.authenticate(request, config);
          await dependencies.claimQuota(auth);
        } else {
          claimLocalQuota();
        }
        return json({...await dependencies.generateAI(parsed.data, config), ...(demoRemaining === undefined ? {} : {demoRemaining})});
      }
      const auth = await dependencies.authenticate(request, config);
      if (request.method === "GET")
        return json(await dependencies.loadWorkspace(auth));
      const parsed = saveRequestSchema.safeParse(
        await readJson(request, WORKSPACE_BODY_LIMIT),
      );
      if (!parsed.success)
        throw new HttpError(
          400,
          "invalid_workspace",
          "Der Workspace enthält ungültige Daten.",
        );
      if (
        new TextEncoder().encode(JSON.stringify(parsed.data.state)).byteLength >
        SNAPSHOT_LIMIT
      ) {
        throw new HttpError(
          413,
          "workspace_too_large",
          "Der Workspace überschreitet die maximale Größe von 512 KiB.",
        );
      }
      return json(
        await dependencies.saveWorkspace(
          auth,
          parsed.data.workspaceId,
          parsed.data.revision,
          parsed.data.state,
        ),
      );
    } catch (error) {
      // Provider responses, stack traces, request contents and credentials
      // never leave the server. HttpError messages are authored by this app.
      if (error instanceof HttpError) {
        if (error.status === 429) headers.set("Retry-After", "60");
        return json(
          { error: { code: error.code, message: error.message } },
          error.status,
        );
      }
      return json(
        {
          error: {
            code: "internal_error",
            message:
              "Die Anfrage konnte gerade nicht verarbeitet werden. Bitte versuche es erneut.",
          },
        },
        500,
      );
    }
  };
}

export const handleRequest = createHandler();
