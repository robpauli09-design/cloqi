import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerConfig } from "./config";
import { HttpError } from "./errors";
import type { AuthContext } from "./supabase";

// The AI server answers one request at a time, so callers line up here.
// `auth` is the signed-in caller; null means the public demo.
export interface QueueTurn {
  position: number; // 0 = your turn, 1 = next, ...
  ready: boolean;
}
export interface AIQueue {
  join(auth: AuthContext | null): Promise<{ ticket: string; demoRemaining?: number }>;
  poll(ticket: string, auth: AuthContext | null): Promise<QueueTurn>;
  begin(ticket: string, auth: AuthContext | null): Promise<boolean>;
  leave(ticket: string, auth: AuthContext | null): Promise<void>;
}

export function queueFullError() {
  return new HttpError(
    503,
    "ai_queue_full",
    "Gerade warten sehr viele Anfragen auf die KI. Bitte versuche es in ein paar Minuten erneut.",
  );
}
export function ticketUnknownError() {
  return new HttpError(
    410,
    "ai_ticket_unknown",
    "Dein Platz in der Warteschlange ist abgelaufen. Bitte starte die Anfrage neu.",
  );
}

function queueError(error: { message?: string }): never {
  const message = error.message || "";
  if (message.includes("ai_queue_full")) throw queueFullError();
  if (message.includes("ai_ticket_unknown")) throw ticketUnknownError();
  if (message.includes("demo_rate_limit"))
    throw new HttpError(429, "demo_rate_limit", "Die Demo macht kurz Pause: maximal 3 Anfragen pro Minute und 50 pro UTC-Tag für alle Besucher zusammen. Bitte später erneut versuchen.");
  if (message.includes("rate_limit"))
    throw new HttpError(429, "rate_limit", "Dein KI-Limit ist erreicht (20 Anfragen pro Minute, 200 pro Tag). Bitte versuche es später erneut.");
  throw new HttpError(503, "ai_queue_unavailable", "Die KI-Warteschlange ist gerade nicht erreichbar. Es wurde keine KI-Anfrage gestartet.");
}

export function supabaseQueue(config: ServerConfig): AIQueue {
  let anon: SupabaseClient | undefined;
  const client = (auth: AuthContext | null) =>
    auth?.client ??
    (anon ??= createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }));
  return {
    async join(auth) {
      if (auth) {
        const { data, error } = await auth.client.rpc("join_ai_queue");
        if (error || typeof data !== "string") queueError(error ?? {});
        return { ticket: data };
      }
      const { data, error } = await client(null).rpc("join_demo_ai_queue");
      const row = Array.isArray(data) ? data[0] : undefined;
      if (error || typeof row?.ticket !== "string") queueError(error ?? {});
      return { ticket: row.ticket, demoRemaining: row.remaining };
    },
    async poll(ticket, auth) {
      const { data, error } = await client(auth).rpc("poll_ai_queue", { p_ticket: ticket });
      const row = Array.isArray(data) ? data[0] : undefined;
      if (error || !row) queueError(error ?? {});
      return { position: row.queue_position, ready: row.ready };
    },
    async begin(ticket, auth) {
      const { data, error } = await client(auth).rpc("begin_ai_queue_turn", { p_ticket: ticket });
      if (error) queueError(error);
      return data === true;
    },
    async leave(ticket, auth) {
      // Best effort: an abandoned ticket also expires on its own.
      await client(auth).rpc("leave_ai_queue", { p_ticket: ticket });
    },
  };
}

// Same rules in memory, for the loopback development server without Supabase.
export function memoryQueue(
  claimQuota: () => void,
  now: () => number = Date.now,
  slots = 1,
  capacity = 30,
): AIQueue {
  interface Entry { id: string; seq: number; lastSeen: number; grantedAt?: number; generating: boolean }
  const entries = new Map<string, Entry>();
  let seq = 0;
  const tidy = () => {
    const t = now();
    for (const [id, e] of entries)
      if (
        (e.grantedAt === undefined && t - e.lastSeen > 30_000) ||
        (e.grantedAt !== undefined && !e.generating && t - e.grantedAt > 20_000) ||
        (e.generating && t - (e.grantedAt ?? 0) > 200_000)
      )
        entries.delete(id);
  };
  return {
    async join() {
      tidy();
      if (entries.size >= capacity) throw queueFullError();
      claimQuota();
      const id = crypto.randomUUID();
      entries.set(id, { id, seq: seq++, lastSeen: now(), generating: false });
      return { ticket: id };
    },
    async poll(ticket) {
      tidy();
      const entry = entries.get(ticket);
      if (!entry) throw ticketUnknownError();
      entry.lastSeen = now();
      if (entry.grantedAt !== undefined) return { position: 0, ready: true };
      const all = [...entries.values()];
      const ahead = all.filter((e) => e.grantedAt === undefined && e.seq < entry.seq).length;
      const active = all.filter((e) => e.grantedAt !== undefined).length;
      if (ahead === 0 && active < slots) {
        entry.grantedAt = now();
        return { position: 0, ready: true };
      }
      return { position: ahead + 1, ready: false };
    },
    async begin(ticket) {
      tidy();
      const entry = entries.get(ticket);
      if (!entry || entry.grantedAt === undefined || entry.generating) return false;
      entry.generating = true;
      return true;
    },
    async leave(ticket) {
      entries.delete(ticket);
    },
  };
}
