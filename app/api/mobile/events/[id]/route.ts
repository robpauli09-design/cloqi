import { deleteEventFor, eventDetailsFor, updateEventFor } from '@/lib/event-input';
import { body, json, withUser } from '@/lib/mobile-api';
import { eventForm } from '@/lib/mobile-form';
import { InputError } from '@/lib/validate';

const idOf = (req: Request) => decodeURIComponent(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '');
const scopeOf = (v: unknown) => (v === 'single' ? 'single' : 'series');

/** Event details for the edit sheet. ?occ=YYYY-MM-DD for one occurrence of a series. */
export const GET = withUser(async (user, req) => {
  const d = await eventDetailsFor(user, idOf(req), new URL(req.url).searchParams.get('occ'));
  if (!d) throw new InputError('Termin nicht gefunden.');
  return json(d);
});

/** Edit: same fields as POST /api/mobile/events plus { scope: 'single' | 'series', occurrenceDate }. */
export const PATCH = withUser(async (user, req) => {
  const b = await body(req);
  return json({ ok: true, message: await updateEventFor(user, idOf(req), scopeOf(b.scope), typeof b.occurrenceDate === 'string' ? b.occurrenceDate : null, eventForm(b)) });
});

/** Delete: ?scope=single&occ=YYYY-MM-DD for only this occurrence, otherwise the whole event/series. */
export const DELETE = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams;
  return json({ ok: true, message: await deleteEventFor(user, idOf(req), scopeOf(q.get('scope')), q.get('occ')) });
});
