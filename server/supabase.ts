import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerConfig } from "./config";
import { hasSupabase } from "./config";
import { authError, HttpError } from "./errors";
import { parseWorkspace } from "../shared/contracts";
import type { WorkspaceState, WorkspaceRecord } from "../shared/contracts";
import { initialTasks } from "../src/data";

export interface AuthContext {
  userId: string;
  client: SupabaseClient;
}
export async function claimDemoQuota(config: ServerConfig): Promise<number> {
  if (!hasSupabase(config)) throw new HttpError(503, "demo_quota_missing", "Für die Demo-KI muss Supabase konfiguriert sein.");
  const client = createClient(config.supabaseUrl, config.supabaseKey, {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data,error} = await client.rpc("claim_demo_ai_quota");
  if (error?.message?.includes("demo_rate_limit")) throw new HttpError(429,"demo_rate_limit","Die Demo macht kurz Pause: maximal 3 Anfragen pro Minute und 50 pro UTC-Tag für alle Besucher zusammen. Bitte später erneut versuchen.");
  if (error || !Number.isInteger(data) || data < 0 || data > 49) throw new HttpError(503,"demo_quota_unavailable","Das Demo-Kontingent ist gerade nicht erreichbar. Es wurde keine KI-Anfrage gestartet.");
  return data;
}
export async function authenticate(
  request: Request,
  config: ServerConfig,
): Promise<AuthContext> {
  if (!hasSupabase(config))
    throw new HttpError(
      503,
      "supabase_missing",
      "Supabase ist noch nicht konfiguriert.",
    );
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ") || header.length > 8192) throw authError();
  const token = header.slice(7).trim();
  if (!token) throw authError();
  const client = createClient(config.supabaseUrl, config.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw authError();
  return { userId: data.user.id, client };
}
export function initialWorkspace(): WorkspaceState {
  return {
    tasks: initialTasks.map((t) => ({ ...t })),
    mission: 0,
    analyzed: [],
    analysisResults: {},
    feedback: [
      "Eine klarere Übergabe zwischen Produktion und Verpackung würde uns helfen.",
      "Die neue Übersicht macht es leichter, die richtige Ansprechperson zu finden.",
    ],
    notifications: true,
    reducedMotion: false,
  };
}
function databaseError(error: { code?: string; message?: string }): never {
  if (error.message?.includes("revision_conflict"))
    throw new HttpError(
      409,
      "revision_conflict",
      "Der Workspace wurde zwischenzeitlich geändert. Lade den Cloud-Stand neu, bevor du weiterarbeitest.",
    );
  if (error.code === "42501")
    throw new HttpError(
      403,
      "workspace_forbidden",
      "Du hast keinen Zugriff auf diesen Workspace.",
    );
  if (error.code === "22023")
    throw new HttpError(
      400,
      "invalid_workspace",
      "Der Workspace enthält ungültige Daten.",
    );
  throw new HttpError(
    503,
    "database_unavailable",
    "Die Datenbank ist nicht erreichbar oder die KLOQI-Migration wurde noch nicht ausgeführt.",
  );
}
export async function loadWorkspace(
  auth: AuthContext,
): Promise<WorkspaceRecord> {
  const { data, error } = await auth.client.rpc("ensure_workspace", {
    p_initial_state: initialWorkspace(),
  });
  if (error) databaseError(error);
  const row = data?.[0];
  if (!row)
    throw new HttpError(
      503,
      "workspace_missing",
      "Der Workspace konnte nicht geladen werden.",
    );
  return {
    workspaceId: row.workspace_id,
    state: parseWorkspace(row.state),
    revision: row.revision,
  };
}
export async function saveWorkspace(
  auth: AuthContext,
  workspaceId: string,
  revision: number,
  state: WorkspaceState,
): Promise<WorkspaceRecord> {
  const { data, error } = await auth.client.rpc("save_workspace", {
    p_workspace_id: workspaceId,
    p_expected_revision: revision,
    p_state: state,
  });
  if (error) databaseError(error);
  const row = data?.[0];
  if (!row)
    throw new HttpError(
      503,
      "workspace_missing",
      "Der Workspace konnte nicht gespeichert werden.",
    );
  return {
    workspaceId,
    state: parseWorkspace(row.state),
    revision: row.revision,
  };
}
export async function claimQuota(auth: AuthContext) {
  const { data, error } = await auth.client.rpc("claim_ai_request");
  if (error) databaseError(error);
  if (data !== true)
    throw new HttpError(
      429,
      "rate_limit",
      "Dein KI-Limit ist erreicht (20 Anfragen pro Minute, 200 pro Tag). Bitte versuche es später erneut.",
    );
}
