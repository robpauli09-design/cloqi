import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import { readConfig } from "./config";
import { AI_BODY_LIMIT, handleRequest, WORKSPACE_BODY_LIMIT } from "./handler";

export function allowedLocalHost(
  host: string | undefined,
  port: number,
): boolean {
  if (!host) return false;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(
    host.toLowerCase(),
  );
}

function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify({ error: { code, message } }));
}

async function serveApi(
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  url: URL,
) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = incoming.method || "GET";
  const bodyAllowed = method !== "GET" && method !== "HEAD";
  const limit =
    url.pathname === "/api/workspace" ? WORKSPACE_BODY_LIMIT : AI_BODY_LIMIT;
  const chunks: Buffer[] = [];
  let size = 0;
  if (Number(incoming.headers["content-length"]) > limit) {
    incoming.resume();
    sendError(
      outgoing,
      413,
      "body_too_large",
      "Die Anfrage enthält zu viele Daten.",
    );
    return;
  }
  // for-await destroys a stream on early return. iterator() preserves the
  // socket long enough to deliver a useful 413 and drain the remaining body.
  for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      incoming.resume();
      sendError(
        outgoing,
        413,
        "body_too_large",
        "Die Anfrage enthält zu viele Daten.",
      );
      return;
    }
    if (bodyAllowed) chunks.push(Buffer.from(chunk));
  }
  const request = new Request(url, {
    method,
    headers,
    ...(bodyAllowed ? { body: Buffer.concat(chunks) } : {}),
  });
  const response = await handleRequest(request, readConfig(process.env, true));
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

export async function startDevServer(port = 5173) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Bitte einen Port zwischen 1024 und 65535 angeben.");
  const server = createServer();
  const vite = await createViteServer({
    server: { middlewareMode: true, host: "127.0.0.1", hmr: { server } },
    appType: "spa",
  });
  server.on("request", (request, response) => {
    // A malicious site can resolve its own hostname to loopback. Reject it
    // before serving HTML, assets or API; never trust X-Forwarded-Host here.
    if (!allowedLocalHost(request.headers.host, port)) {
      sendError(
        response,
        403,
        "host_forbidden",
        "Der lokale Server ist nur über localhost erreichbar.",
      );
      return;
    }
    const target = request.url || "/";
    if (!target.startsWith("/") || target.startsWith("//")) {
      sendError(response, 400, "invalid_url", "Die Anfrage-URL ist ungültig.");
      return;
    }
    const url = new URL(target, `http://${request.headers.host}`);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      void serveApi(request, response, url).catch(() => {
        if (!response.headersSent)
          sendError(
            response,
            500,
            "internal_error",
            "Die Anfrage konnte gerade nicht verarbeitet werden.",
          );
        else response.end();
      });
    } else {
      vite.middlewares(request, response, () => {
        response.writeHead(404);
        response.end("Nicht gefunden.");
      });
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    await vite.close();
    throw error;
  }
  console.info(`CLOQI läuft unter http://127.0.0.1:${port}/`);
  const close = async () => {
    await vite.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  };
  return { server, close };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const index = process.argv.indexOf("--port");
  const inline = process.argv.find((arg) => arg.startsWith("--port="));
  const port = Number(
    inline?.split("=")[1] ?? (index >= 0 ? process.argv[index + 1] : 5173),
  );
  startDevServer(port)
    .then(({ close }) => {
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => {
          void close().finally(() => process.exit(0));
        });
    })
    .catch((error: unknown) => {
      const code =
        error && typeof error === "object" && "code" in error ? error.code : "";
      console.error(
        code === "EADDRINUSE"
          ? `Port ${port} wird bereits verwendet. Beende den bisherigen Server oder nutze --port 5174.`
          : "Der lokale Server konnte nicht gestartet werden. Bitte Node-Version und Port prüfen.",
      );
      process.exitCode = 1;
    });
}
