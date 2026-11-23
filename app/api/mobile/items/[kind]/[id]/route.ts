import { body, json, withUser } from '@/lib/mobile-api';
import { deleteBlocks, deleteTask, getBlock, getTask, setTaskStatus, updateBlock } from '@/lib/repo';
import { InputError } from '@/lib/validate';

// Study blocks (kind "study") and tests/tasks (kind "deadline") from the app: mark done, delete.
const parts = (req: Request) => new URL(req.url).pathname.split('/').filter(Boolean).slice(-2).map(decodeURIComponent);

/** { done: boolean } */
export const PATCH = withUser(async (user, req) => {
  const [kind, id] = parts(req);
  const done = (await body(req)).done === true;
  if (kind === 'study') {
    if (!await getBlock(user.id, id)) throw new InputError('Lernblock nicht gefunden.');
    await updateBlock(user.id, id, done ? { status: 'done', completedAt: new Date().toISOString() } : { status: 'planned', completedAt: null });
    return json({ ok: true, message: done ? 'Stark! Lernblock erledigt.' : 'Wieder offen.' });
  }
  if (kind === 'deadline') {
    if (!await getTask(user.id, id)) throw new InputError('Test nicht gefunden.');
    await setTaskStatus(user.id, id, done ? 'done' : 'open');
    return json({ ok: true, message: done ? 'Erledigt – stark!' : 'Wieder offen.' });
  }
  throw new InputError('Unbekannter Eintrag.');
});

export const DELETE = withUser(async (user, req) => {
  const [kind, id] = parts(req);
  if (kind === 'study') { await deleteBlocks(user.id, [id]); return json({ ok: true, message: 'Lernblock entfernt.' }); }
  if (kind === 'deadline') { await deleteTask(user.id, id); return json({ ok: true, message: 'Gelöscht, inklusive Lernblöcken.' }); }
  throw new InputError('Unbekannter Eintrag.');
});
