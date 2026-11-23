import 'server-only';
import { after } from 'next/server';
import { chatFor, type StreamEvent } from './ai';
import type { User } from './types';

/**
 * Streams one CLOQI AI turn as NDJSON (one JSON object per line):
 *   {"type":"thread","id":"…"}                       – conversation id, sent first
 *   {"type":"status","text":"Schaut in deinen Kalender …"}
 *   {"type":"delta","text":"Morgen hast"} …
 *   {"type":"done","ok":true,"reply":"…","actions":[…],"threadId":"…"}
 * Used by the website (/api/ai/stream, cookie) and the app (/api/mobile/ai/stream, token).
 *
 * If the client goes away (switches tab, app in background), the turn still finishes and is
 * saved – the client reopens the conversation and picks up the answer.
 */
export function streamChat(user: User, b: Record<string, unknown>): Response {
  const enc = new TextEncoder();
  let open = true;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const send = (e: StreamEvent) => {
    if (!open || !controller) return;
    try { controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`)); } catch { open = false; }
  };
  const turn = (async () => {
    const r = await chatFor(user, String(b.message ?? ''), {
      threadId: typeof b.threadId === 'string' ? b.threadId : null,
      attachments: b.attachments,
      emit: send,
    });
    send({ type: 'done', ok: r.ok, reply: r.reply, actions: r.actions, threadId: r.threadId });
    if (open) { open = false; try { (controller as ReadableStreamDefaultController<Uint8Array> | null)?.close(); } catch { /* already closed */ } }
  })();
  // keep the function alive until the answer is saved, even if the client disconnects
  after(turn.catch(() => undefined));
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { open = false; },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
