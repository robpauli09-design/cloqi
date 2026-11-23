import { aiConfig, chatFor } from '@/lib/ai';
import { body, json, withUser } from '@/lib/mobile-api';
import { getThread, listChat } from '@/lib/repo';
import { InputError } from '@/lib/validate';

// the agent may call the model several times per message (and think before each step)
export const maxDuration = 120;

/** ?thread=<id> → messages of that conversation; without → just whether the AI is configured. */
export const GET = withUser(async (user, req) => {
  const id = new URL(req.url).searchParams.get('thread');
  if (id && !(await getThread(user.id, id))) throw new InputError('Dieser Chat existiert nicht mehr.');
  return json({
    enabled: Boolean(aiConfig()),
    messages: id ? (await listChat(user.id, id, 200)).map(m => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })) : [],
  });
});

/** One message → { ok, reply, actions, threadId }. threadId null starts a new conversation. Attachments: [{ name, mime, data(base64) }]. */
export const POST = withUser(async (user, req) => {
  const b = await body(req, 4_500_000);
  return json(await chatFor(user, String(b.message ?? ''), { threadId: typeof b.threadId === 'string' ? b.threadId : null, attachments: b.attachments }));
});
