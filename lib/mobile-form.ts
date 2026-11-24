import 'server-only';

/** App JSON → the FormData the website's event rules read (lib/event-input.ts readEventForm). */
export function eventForm(b: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const k of ['title', 'date', 'start', 'end', 'category', 'location', 'description', 'reminder', 'repeat', 'until', 'calendarId']) {
    if (b[k] !== undefined && b[k] !== null) form.set(k, String(b[k]));
  }
  if (b.allDay === true) form.set('allDay', 'on');
  if (Array.isArray(b.repeatDays)) for (const d of b.repeatDays) form.append('repeatDays', String(d));
  return form;
}
