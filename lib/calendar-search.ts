import 'server-only';
import { getCalendarItems } from './calendar';
import { addDays, todayIn, zonedToUtc } from './time';
import type { CalendarItem, User } from './types';

/**
 * Finds calendar entries by title, place or notes – 60 days back to 1 year ahead.
 * Upcoming hits first (repeating series: the next dates), then the last few past ones.
 * Used by the calendar search (website/app) and CLOQI AI's search_calendar.
 */
export async function searchCalendarItems(user: User, query: string, opts: { aheadDays?: number } = {}): Promise<CalendarItem[]> {
  const q = query.trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return [];
  const today = todayIn(user.timezone);
  const items = await getCalendarItems(user,
    zonedToUtc(addDays(today, -60), '00:00', user.timezone).toISOString(),
    zonedToUtc(addDays(today, opts.aheadDays ?? 365), '00:00', user.timezone).toISOString(), { includeHidden: true });
  const hits = items.filter(i => `${i.title} ${i.location ?? ''} ${i.description ?? ''} ${i.teacher ?? ''}`.toLowerCase().includes(q));
  const cut = new Date(Date.now() - 86400000).toISOString();
  return [...hits.filter(i => i.startAt >= cut).slice(0, 25), ...hits.filter(i => i.startAt < cut).slice(-5).reverse()];
}
