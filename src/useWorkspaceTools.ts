import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { Page, Task } from "./data";
import { processes } from "./data";

interface Workspace {
  page: Page;
  tasks: Task[];
  mission: number;
  openProcess: (id: string) => void;
}
interface ModelTool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
}
interface ModelContext {
  registerTool: (
    tool: ModelTool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
}

/** Optional browser integration. The UI remains fully functional without WebMCP. */
export function useWorkspaceTools(workspace: Workspace) {
  const current = useRef(workspace);
  current.current = workspace;
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: ModelTool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {
          /* Optional integration cannot block the application. */
        });
      } catch {
        /* Browser does not support this API version. */
      }
    };
    register({
      name: "kloqi_read_workspace",
      title: "KLOQI-Workspace lesen",
      description:
        "Liest den aktuellen lokalen Demo-Fortschritt und Aufgabenstatus. Ändert keine Daten.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => ({
        page: current.current.page,
        missionSteps: current.current.mission,
        tasks: current.current.tasks.map(({ id, title, done, process }) => ({
          id,
          title,
          done,
          process,
        })),
        dataSource: "local-demo",
      }),
    });
    register({
      name: "kloqi_open_process",
      title: "KLOQI-Prozess öffnen",
      description:
        "Öffnet die Detailansicht eines Beispielprozesses. Analysiert und verändert keine Produktionsdaten.",
      inputSchema: {
        type: "object",
        properties: {
          processId: { type: "string", enum: processes.map((p) => p.id) },
        },
        required: ["processId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          Object.keys(input).some((key) => key !== "processId")
        )
          throw new Error("Erwartet wird ausschließlich processId.");
        const id = (input as { processId?: unknown }).processId;
        if (typeof id !== "string" || !processes.some((p) => p.id === id))
          throw new Error("Unbekannter Beispielprozess.");
        flushSync(() => current.current.openProcess(id));
        return { page: "processes", processId: id };
      },
    });
    return () => lifecycle.abort();
  }, []);
}
