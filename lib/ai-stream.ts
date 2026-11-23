import 'server-only';
import { chatFor, type StreamEvent } from './ai';
import type { User } from './types';

/**
 * Streams one CLOQI AI turn as NDJSON (one JSON object per line):
 *   {"type":"status","text":"Schaut in deinen Kalender …"}
 *   {"type":"delta","text":"Morgen hast"} …
 *   {"type":"done","ok":true,"reply":"…","actions":[…],"threadId":"…"}
 * Used by the website (/api/ai/stream, cookie) and the app (/api/mobile/ai/stream, token).
 */
export function streamChat(user: User, b: Record<string, unknown>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: StreamEvent) => {
        if (!open) return;
        try { controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`)); } catch { open = false; }
      };
      const r = await chatFor(user, String(b.message ?? ''), {
        threadId: typeof b.threadId === 'string' ? b.threadId : null,
        attachments: b.attachments,
        emit: send,
      });
      send({ type: 'done', ok: r.ok, reply: r.reply, actions: r.actions, threadId: r.threadId });
      if (open) controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
