import { json, withUser } from '@/lib/mobile-api';
import { deleteThread, listThreads } from '@/lib/repo';

/** Chat history: conversations, newest first. */
export const GET = withUser(async user => json({ threads: await listThreads(user.id) }));

/** ?id=<thread> deletes one conversation. */
export const DELETE = withUser(async (user, req) => {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  await deleteThread(user.id, id);
  return json({ ok: true });
});
