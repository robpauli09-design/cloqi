import 'server-only';
import { getCalendarItems, mainCalendarId } from './calendar';
import { findConflicts } from './conflicts';
import { createEvent, getCalendar, type EventInput } from './repo';
import { RECURRENCE_PRESETS } from './recurrence';
import { isValidDate, utcToZoned, zonedToUtc } from './time';
import type { CalendarEvent, CalendarItem, User } from './types';
import { category, date, int, InputError, optionalText, text, time } from './validate';

// Event form rules shared by the website (server actions) and the app (/api/mobile/events).

export async function readEventForm(user: User, form: FormData): Promise<EventInput> {
  const title = text(form, 'title', { required: true, max: 120, label: 'Titel' });
  const day = date(form, 'date');
  const allDay = form.get('allDay') === 'on';
  const start = allDay ? '00:00' : time(form, 'start', 'Beginn');
  const end = allDay ? '23:59' : time(form, 'end', 'Ende');
  if (!allDay && end <= start) throw new InputError('Das Ende muss nach dem Beginn liegen.');
  const reminderRaw = String(form.get('reminder') ?? '');
  const reminderMinutes = reminderRaw === '' || reminderRaw === 'none' ? null : int(form, 'reminder', 0, 10080);

  const preset = String(form.get('repeat') ?? 'none');
  let recurrenceFreq: CalendarEvent['recurrenceFreq'] = null;
  let recurrenceInterval = 1;
  if (preset === 'custom') {
    const unit = String(form.get('repeatUnit') ?? 'weekly');
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(unit)) throw new InputError('Ungültige Wiederholung.');
    recurrenceFreq = unit as CalendarEvent['recurrenceFreq'];
    recurrenceInterval = int(form, 'repeatInterval', 1, 99, 1);
  } else {
    const rule = RECURRENCE_PRESETS.find(p => p.value === preset)?.rule ?? null;
    if (rule) { recurrenceFreq = rule.freq; recurrenceInterval = rule.interval; }
  }
  const until = String(form.get('until') ?? '');
  if (recurrenceFreq && until && (!isValidDate(until) || until < day)) throw new InputError('Das Ende der Wiederholung ist ungültig.');

  const calendarId = String(form.get('calendarId') ?? '') || await mainCalendarId(user.id);
  const cal = await getCalendar(user.id, calendarId);
  if (!cal || !cal.writable || ['study', 'timetable', 'webuntis', 'ics'].includes(cal.kind)) throw new InputError('In diesen Kalender kann nicht geschrieben werden.');

  return {
    title, allDay, calendarId,
    startAt: zonedToUtc(day, start, user.timezone).toISOString(),
    endAt: zonedToUtc(day, end, user.timezone).toISOString(),
    category: category(form), description: optionalText(form, 'description', 2000), location: optionalText(form, 'location', 200),
    reminderMinutes, recurrenceFreq, recurrenceInterval, recurrenceUntil: recurrenceFreq && until ? until : null,
  };
}

export async function conflictWarning(user: User, startAt: string, endAt: string, ignoreId?: string): Promise<string | undefined> {
  const items = (await getCalendarItems(user, startAt, endAt, { includeHidden: true })).filter(i => i.id !== ignoreId);
  const probe = { key: 'probe', kind: 'event', id: 'probe', title: '', startAt, endAt, allDay: false, status: 'active' } as CalendarItem;
  const hits = findConflicts([...items, probe]).filter(c => c.a.key === 'probe' || c.b.key === 'probe').map(c => (c.a.key === 'probe' ? c.b : c.a));
  if (!hits.length) return undefined;
  return `Achtung: überschneidet sich mit „${hits[0].title}“ (${utcToZoned(hits[0].startAt, user.timezone).time} Uhr)${hits.length > 1 ? ` und ${hits.length - 1} weiteren` : ''}.`;
}

/** Creates an event from form fields; returns the message for the user (incl. overlap warning). */
export async function createEventFor(user: User, form: FormData): Promise<string> {
  const e = await readEventForm(user, form);
  const cal = (await getCalendar(user.id, e.calendarId!))!;
  // Events created in an imported Google/Outlook calendar are written there on the next sync.
  const external = cal.kind === 'google' || cal.kind === 'outlook';
  if (external && e.recurrenceFreq) throw new InputError('Wiederkehrende Termine bitte im CLOQI-Kalender anlegen – sie werden dann exportiert.');
  // check overlaps BEFORE saving – otherwise the new event would collide with itself
  const warning = e.allDay ? undefined : await conflictWarning(user, e.startAt, e.endAt);
  await createEvent(user.id, external
    ? { ...e, source: cal.kind as 'google' | 'outlook', connectionId: cal.connectionId, syncState: 'dirty' }
    : { ...e, source: 'manual' });
  const base = external ? `Gespeichert – wird an ${cal.name} übertragen.` : 'Termin gespeichert.';
  return warning ? `Gespeichert. ${warning}` : base;
}
