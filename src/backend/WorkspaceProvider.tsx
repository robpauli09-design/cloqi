import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { parseWorkspace } from "../../shared/contracts";
import type { WorkspaceRecord, WorkspaceState } from "../../shared/contracts";
import { initialTasks } from "../data";
import { ApiError, getWorkspace, putWorkspace } from "../services/api";
import { useBackend } from "./BackendProvider";
import { supabase } from "./client";
import { WorkspaceSync } from "./workspaceSync";
import { useAuth } from "../auth/AuthProvider";
import { initialTasksFor } from "../auth/users";
import type { DemoUser } from "../auth/users";

const storageKeyFor = (user?:DemoUser) => !user || user.role==='management' ? 'kloqi-demo-v1' : `kloqi-demo-v1-${user.username}`;
function localState(user?:DemoUser): WorkspaceState {
  try {
    const raw = localStorage.getItem(storageKeyFor(user));
    if (raw) {const parsed=parseWorkspace(JSON.parse(raw));return user&&user.role!=='management'?{...parsed,tasks:parsed.tasks.filter(task=>task.process==='packaging'&&task.person===user.name)}:parsed;}
  } catch {
    /* Keep the demo usable if local storage is unavailable or old. */
  }
  return parseWorkspace({
    tasks: user?initialTasksFor(user):initialTasks,
    mission: 0,
    analyzed: [],
    feedback: [
      "Eine klarere Übergabe zwischen Produktion und Verpackung würde uns helfen.",
      "Die neue Übersicht macht es leichter, die richtige Ansprechperson zu finden.",
    ],
    notifications: true,
    reducedMotion: false,
    analysisResults: {},
  });
}
interface Store {
  state: WorkspaceState;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
  flush: () => Promise<void>;
}
const WorkspaceContext = createContext<Store | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace fehlt.");
  return value;
}
export function useOptionalWorkspace() {
  return useContext(WorkspaceContext);
}
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { session, authLoading } = useBackend();
  if(user)return <WorkspaceStore key={user.username} record={null} demoUser={user}>{children}</WorkspaceStore>;
  if (authLoading)
    return (
      <div className="workspace-loading" role="status">
        Anmeldung wird geprüft…
      </div>
    );
  return (
    <WorkspaceLoader key={session?.user.id || "demo"}>
      {children}
    </WorkspaceLoader>
  );
}
function WorkspaceLoader({ children }: { children: ReactNode }) {
  const { session } = useBackend();
  const [record, setRecord] = useState<WorkspaceRecord | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!session) return;
    let active = true;
    setError("");
    getWorkspace(session.access_token)
      .then((value) => {
        if (active) setRecord(value);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Workspace konnte nicht geladen werden.",
          );
      });
    return () => {
      active = false;
    };
  }, [session?.user.id, attempt]);
  if (session && !record)
    return (
      <div className="workspace-loading">
        <h1>Dein Workspace</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="button primary"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Erneut laden
            </button>
            <button
              className="button secondary"
              onClick={() => void supabase?.auth.signOut()}
            >
              Abmelden
            </button>
          </>
        ) : (
          <p role="status">Cloud-Daten werden geladen…</p>
        )}
      </div>
    );
  return <WorkspaceStore record={record}>{children}</WorkspaceStore>;
}
function WorkspaceStore({
  children,
  record,
  demoUser,
}: {
  children: ReactNode;
  record: WorkspaceRecord | null;
  demoUser?: DemoUser;
}) {
  const { session } = useBackend();
  const [state, setState] = useState<WorkspaceState>(
    () => record?.state || localState(demoUser),
  );
  const [, redraw] = useState(0);
  const mounted = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [sync] = useState(() =>
    record
      ? new WorkspaceSync(
          record,
          (revision, snapshot) =>
            putWorkspace(
              record.workspaceId,
              revision,
              snapshot,
              sessionRef.current!.access_token,
            ),
          () => {
            if (mounted.current) redraw((n) => n + 1);
          },
        )
      : null,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const flush = () => {
    if (!sync) return Promise.resolve();
    sync.update(stateRef.current);
    return sync.flush();
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!sync) {
      try {
        localStorage.setItem(storageKeyFor(demoUser), JSON.stringify(state));
      } catch {
        /* Visible app continues without browser persistence. */
      }
      return;
    }
    sync.update(state);
    const timer = setTimeout(() => {
      void sync.flush().catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [state, sync, demoUser]);
  useEffect(() => {
    if (!sync) return;
    const prevent = (event: BeforeUnloadEvent) => {
      sync.update(stateRef.current);
      if (sync.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [sync]);
  const conflict = sync?.error instanceof ApiError && sync.error.status === 409;
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "kloqi-workspace-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <WorkspaceContext.Provider value={{ state, setState, flush }}>
      {sync && (
        <div
          className={`workspace-sync ${sync.error ? "sync-error" : ""}`}
          role="status"
        >
          <span>
            {sync.error
              ? sync.error.message
              : sync.dirty || sync.saving
                ? "Änderungen werden gespeichert…"
                : "In Supabase gespeichert"}
          </span>
          {sync.error && (
            <>
              <button onClick={download}>Änderungen sichern</button>
              {!conflict && (
                <button onClick={() => void sync.retry().catch(() => {})}>
                  Erneut speichern
                </button>
              )}
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "Cloud-Stand neu laden? Ungespeicherte Änderungen werden verworfen. Du kannst sie vorher als Datei sichern.",
                    )
                  )
                    window.location.reload();
                }}
              >
                Cloud-Stand laden
              </button>
            </>
          )}
        </div>
      )}
      {children}
    </WorkspaceContext.Provider>
  );
}
