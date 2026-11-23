import { aiConfig, chatFor } from '@/lib/ai';
import { body, json, withUser } from '@/lib/mobile-api';
import { clearChat, listChat } from '@/lib/repo';

export const maxDuration = 60;

/** Chat history + whether the AI is configured. */
export const GET = withUser(async user => json({
  enabled: Boolean(aiConfig()),
  messages: (await listChat(user.id, 40)).map(m => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
}));

/** One message to CLOQI AI → { ok, reply, actions }. */
export const POST = withUser(async (user, req) => {
  const b = await body(req);
  return json(await chatFor(user, String(b.message ?? '')));
});

/** New chat (the vault – what CLOQI knows about you – stays). */
export const DELETE = withUser(async user => {
  await clearChat(user.id);
  return json({ ok: true });
});
