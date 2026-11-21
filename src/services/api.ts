import { supabase } from "../backend/client";
import {restoreDemo} from '../auth/users';
import {demoBudget,demoDailyLimit,refundDemoRequest,reserveDemoRequest,saveDemoBudget} from './demoBudget';
import {setAIQueueStatus} from './aiQueueStatus';
import {
  aiRequestSchema,
  aiResultSchema,
  parseWorkspace,
} from "../../shared/contracts";
import type {
  BackendStatus,
  WorkspaceRecord,
  WorkspaceState,
} from "../../shared/contracts";
export type { AIResult } from "../../shared/contracts";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
async function request(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const { data } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  if (token || data.session)
    headers.set(
      "Authorization",
      `Bearer ${token || data.session!.access_token}`,
    );
  let response: Response;
  try {
    response = await fetch(`${base}/api/${path}`, {
      ...init,
      headers,
      // The self-hosted AI server can need minutes; match vercel.json (180 s).
      signal: init.signal || AbortSignal.timeout(path === "ai" || path === "demo-ai" ? 180_000 : 60_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      0,
      "network_error",
      "Das Backend ist nicht erreichbar. Prüfe die Verbindung und versuche es erneut.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.error?.code || "api_error",
      body?.error?.message || "Die Anfrage konnte nicht abgeschlossen werden.",
    );
  if (!body)
    throw new ApiError(
      502,
      "invalid_response",
      "Das Backend hat keine gültige Antwort gesendet.",
    );
  return body;
}
export async function getBackendStatus(): Promise<BackendStatus> {
  return request("status");
}
const QUEUE_POLL_MS = 2000;
const QUEUE_MAX_WAIT_MS = 10 * 60_000;
function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}
interface QueueTurn { position: number; ready: boolean }
// The self-hosted AI answers one request at a time: take a ticket, wait for
// our turn (the status bar shows the position), then send the request.
export async function requestAI(input: unknown, signal?: AbortSignal) {
  let demo = false;
  try { demo = Boolean(restoreDemo(localStorage.getItem('cloqi_user'))); } catch { /* no persisted session */ }
  const parsed = aiRequestSchema.parse(input);
  if(demo&&!reserveDemoRequest())throw new ApiError(429,'demo_browser_limit',`Deine ${demoDailyLimit} Demo-Anfragen für heute sind aufgebraucht. Morgen (UTC) geht es weiter.`);
  const queuePath = demo ? "ai-queue?mode=demo" : "ai-queue";
  let ticket: string | undefined;
  try {
    const joined = await request(queuePath, { method: "POST", body: "{}", signal }) as QueueTurn & { ticket: string; demoRemaining?: number };
    ticket = joined.ticket;
    if(demo&&joined.demoRemaining!==undefined)saveDemoBudget({...demoBudget(),globalRemaining:joined.demoRemaining});
    let turn: QueueTurn = joined;
    const giveUp = Date.now() + QUEUE_MAX_WAIT_MS;
    while (!turn.ready) {
      setAIQueueStatus({ position: turn.position });
      if (Date.now() > giveUp)
        throw new ApiError(504, "ai_queue_timeout", "Die Wartezeit auf die KI war zu lang. Bitte versuche es später erneut.");
      await wait(QUEUE_POLL_MS, signal);
      turn = await request(queuePath, { headers: { "X-AI-Ticket": ticket }, signal }) as QueueTurn;
    }
    setAIQueueStatus({ position: 0 });
    const body = await request(demo?"demo-ai":"ai", {
      method: "POST",
      headers: { "X-AI-Ticket": ticket },
      body: JSON.stringify(parsed),
      signal,
    });
    ticket = undefined; // the server releases the slot after answering
    return aiResultSchema.parse(body);
  } catch (error) {
    if(demo)refundDemoRequest();
    throw error;
  } finally {
    setAIQueueStatus(null);
    // Leaving early frees our place for the next person straight away.
    if (ticket) void request(queuePath, { method: "DELETE", headers: { "X-AI-Ticket": ticket } }).catch(() => {});
  }
}
function workspaceRecord(body: WorkspaceRecord): WorkspaceRecord {
  return { ...body, state: parseWorkspace(body.state) };
}
export async function getWorkspace(token?: string) {
  return workspaceRecord(await request("workspace", {}, token));
}
export async function putWorkspace(
  workspaceId: string,
  revision: number,
  state: WorkspaceState,
  token?: string,
) {
  return workspaceRecord(
    await request(
      "workspace",
      {
        method: "PUT",
        body: JSON.stringify({
          workspaceId,
          revision,
          state: parseWorkspace(state),
        }),
      },
      token,
    ),
  );
}
