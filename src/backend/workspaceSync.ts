import type { WorkspaceRecord, WorkspaceState } from "../../shared/contracts";

/** Serializes saves, retaining edits made while a request is in flight. */
export class WorkspaceSync {
  private latest: WorkspaceState;
  private saved: string;
  private revision: number;
  private running: Promise<void> | null = null;
  error: Error | null = null;
  constructor(
    record: WorkspaceRecord,
    private save: (
      revision: number,
      state: WorkspaceState,
    ) => Promise<WorkspaceRecord>,
    private changed: () => void,
  ) {
    this.latest = record.state;
    this.saved = JSON.stringify(record.state);
    this.revision = record.revision;
  }
  get dirty() {
    return JSON.stringify(this.latest) !== this.saved;
  }
  get saving() {
    return this.running !== null;
  }
  update(state: WorkspaceState) {
    this.latest = state;
    this.changed();
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.error) return Promise.reject(this.error);
    if (!this.dirty) return Promise.resolve();
    this.running = Promise.resolve()
      .then(async () => {
        while (this.dirty) {
          const snapshot = this.latest;
          const json = JSON.stringify(snapshot);
          const result = await this.save(this.revision, snapshot);
          this.revision = result.revision;
          this.saved = json;
        }
      })
      .catch((error: unknown) => {
        this.error =
          error instanceof Error
            ? error
            : new Error("Speichern fehlgeschlagen.");
        throw this.error;
      })
      .finally(() => {
        this.running = null;
        this.changed();
      });
    this.changed();
    return this.running;
  }
  retry() {
    this.error = null;
    return this.flush();
  }
}
