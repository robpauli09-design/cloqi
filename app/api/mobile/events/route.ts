import { createEventFor } from '@/lib/event-input';
import { body, json, withUser } from '@/lib/mobile-api';

/**
 * New event from the app. Uses exactly the website's form rules:
 * { title, date, start, end, allDay?, category, location?, description?, reminder?, repeat? }
 */
export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const form = new FormData();
  for (const k of ['title', 'date', 'start', 'end', 'category', 'location', 'description', 'reminder', 'repeat', 'until', 'calendarId']) {
    if (b[k] !== undefined && b[k] !== null) form.set(k, String(b[k]));
  }
  if (b.allDay === true) form.set('allDay', 'on');
  return json({ ok: true, message: await createEventFor(user, form) });
});
