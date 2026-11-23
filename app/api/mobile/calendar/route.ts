import { dayRange, getCalendarItems } from '@/lib/calendar';
import { appItem, json, withUser } from '@/lib/mobile-api';
import { addDays, isValidDate, todayIn } from '@/lib/time';
import { InputError } from '@/lib/validate';

/** Calendar items for a range of days: ?from=YYYY-MM-DD&days=7 (max 42). */
export const GET = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams;
  const from = q.get('from') ?? todayIn(user.timezone);
  const days = Math.min(42, Math.max(1, Number(q.get('days') ?? 7) || 7));
  if (!isValidDate(from)) throw new InputError('Ungültiges Datum.');
  const r = dayRange(from, user.timezone, days);
  const items = await getCalendarItems(user, r.from, r.to);
  return json({ from, to: addDays(from, days - 1), items: items.map(i => appItem(i, user.timezone)) });
});
