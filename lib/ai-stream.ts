import 'server-only';
import { after } from 'next/server';
import { chatFor, type StreamEvent } from './ai';
import type { User } from './types';

/**
 * Streams one CLOQI AI turn as Server-Sent Events (text/event-stream – proxies and browsers pass
 * these through immediately instead of buffering them). Each event is `data: {json}\n\n`:
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
  const t0 = Date.now();
  const stats = { deltas: 0, firstDeltaMs: -1, statuses: 0 };
  let open = true;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const write = (s: string) => {
    if (!open || !controller) return;
    try { controller.enqueue(enc.encode(s)); } catch { open = false; }
  };
  const send = (e: StreamEvent) => {
    if (e.type === 'delta') { stats.deltas++; if (stats.firstDeltaMs < 0) stats.firstDeltaMs = Date.now() - t0; }
    if (e.type === 'status') stats.statuses++;
    write(`data: ${JSON.stringify(e)}\n\n`);
  };
  const turn = (async () => {
    const r = await chatFor(user, String(b.message ?? ''), {
      threadId: typeof b.threadId === 'string' ? b.threadId : null,
      attachments: b.attachments,
      emit: send,
    });
    send({ type: 'done', ok: r.ok, reply: r.reply, actions: r.actions, threadId: r.threadId });
    // diagnostics in the Vercel logs: did the model really stream (many deltas, early first delta)?
    console.log(`[cloqi] stream done: ${stats.deltas} text pieces, first after ${stats.firstDeltaMs} ms, ${stats.statuses} status, total ${Date.now() - t0} ms, client ${open ? 'connected' : 'gone'}`);
    if (open) { open = false; try { (controller as ReadableStreamDefaultController<Uint8Array> | null)?.close(); } catch { /* already closed */ } }
  })();
  // keep the function alive until the answer is saved, even if the client disconnects
  after(turn.catch(() => undefined));
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      // ~2 KB comment first: some proxies/browsers only start passing data on after a few KB
      write(`: ${' '.repeat(2048)}\n\n`);
    },
    cancel() { open = false; },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
