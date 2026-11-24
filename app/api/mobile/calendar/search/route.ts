import { searchCalendarItems } from '@/lib/calendar-search';
import { appItem, json, withUser } from '@/lib/mobile-api';

/** Calendar search: ?q=Fußball (title, place, notes, teacher; 60 days back to 1 year ahead). */
export const GET = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const items = await searchCalendarItems(user, q);
  return json({ items: items.map(i => appItem(i, user.timezone)) });
});
