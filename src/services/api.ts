import { supabase } from "../backend/client";
import {restoreDemo} from '../auth/users';
import {demoBudget,demoDailyLimit,refundDemoRequest,reserveDemoRequest,saveDemoBudget} from './demoBudget';
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
      signal: init.signal || AbortSignal.timeout(60_000),
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
export async function requestAI(input: unknown, signal?: AbortSignal) {
  let demo = false;
  try { demo = Boolean(restoreDemo(localStorage.getItem('kloqi_user'))); } catch { /* no persisted session */ }
  const parsed = aiRequestSchema.parse(input);
  if(demo&&!reserveDemoRequest())throw new ApiError(429,'demo_browser_limit',`Deine ${demoDailyLimit} Demo-Anfragen für heute sind aufgebraucht. Morgen (UTC) geht es weiter.`);
  let body: unknown;
  try {
    body = await request(demo?"demo-ai":"ai", {
      method: "POST",
      body: JSON.stringify(parsed),
      signal,
    });
  } catch (error) {
    if(demo)refundDemoRequest();
    throw error;
  }
  const result = aiResultSchema.parse(body);
  if(demo)saveDemoBudget({...demoBudget(),globalRemaining:result.demoRemaining});
  return result;
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
