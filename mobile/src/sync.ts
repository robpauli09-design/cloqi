import { api } from './api';

// Keeps WebUntis & co. fresh: the server re-checks them when they are older than 10 minutes.
// Called when the app comes to the front and when the calendar is shown; screens subscribe to reload.

let last = 0;
let running: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export function onSynced(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Asks the server to refresh (at most once a minute from this device). Calls listeners if something changed. */
export function syncSoon(): Promise<boolean> {
  if (running) return running;
  if (Date.now() - last < 60_000) return Promise.resolve(false);
  last = Date.now();
  running = api<{ changed: boolean }>('/sync', { method: 'POST' })
    .then(r => { if (r.changed) listeners.forEach(fn => fn()); return r.changed; })
    .catch(() => false)
    .finally(() => { running = null; });
  return running;
}
