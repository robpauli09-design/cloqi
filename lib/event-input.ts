import 'server-only';
import { getCalendarItems, mainCalendarId } from './calendar';
import { findConflicts } from './conflicts';
import { deleteRemote, splitExternalUid, type OAuthProvider } from './integrations';
import { createEvent, deleteEvent, getCalendar, getEvent, updateEvent, type EventInput } from './repo';
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
  // weekly on chosen weekdays (checkboxes repeatDays=1…7); the event's own weekday is always included
  let recurrenceDays: number[] | null = null;
  if (recurrenceFreq === 'weekly') {
    const picked = form.getAll('repeatDays').map(Number).filter(d => d >= 1 && d <= 7);
    const own = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const set = [...new Set([...picked, ...(picked.length ? [own] : [])])].sort((a, b) => a - b);
    recurrenceDays = set.length > 1 ? set : null;
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
    reminderMinutes, recurrenceFreq, recurrenceInterval, recurrenceUntil: recurrenceFreq && until ? until : null, recurrenceDays,
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

const EXTERNAL = ['google', 'outlook'];
const IMPORT_ONLY = ['webuntis', 'ics'];

/**
 * Edit an event. scope "series": every occurrence (the series keeps its first date).
 * scope "single": only the occurrence on occurrenceDate – it is taken out of the series and saved on its own.
 */
export async function updateEventFor(user: User, id: string, scope: 'single' | 'series', occurrenceDate: string | null, form: FormData): Promise<string> {
  const existing = await getEvent(user.id, id);
  if (!existing) throw new InputError('Termin nicht gefunden.');
  if (IMPORT_ONLY.includes(existing.source)) throw new InputError('Dieser Termin stammt aus WebUntis bzw. einer importierten Datei und bleibt dort maßgeblich.');
  const e = await readEventForm(user, form);
  if (EXTERNAL.includes(existing.source)) {
    // keep it in its external calendar; mark for upload on the next sync
    await updateEvent(user.id, id, { ...e, calendarId: existing.calendarId, recurrenceFreq: null, syncState: 'dirty' });
    return 'Gespeichert. Die Änderung wird an den verbundenen Kalender übertragen.';
  }
  if (existing.recurrenceFreq && scope === 'single' && occurrenceDate) {
    await updateEvent(user.id, id, { exdates: [...new Set([...existing.exdates, occurrenceDate])] });
    await createEvent(user.id, { ...e, recurrenceFreq: null, seriesId: existing.id, source: existing.source });
  } else if (existing.recurrenceFreq && scope === 'series') {
    const first = utcToZoned(existing.startAt, user.timezone).date;
    const newStart = utcToZoned(e.startAt, user.timezone).time;
    const duration = Date.parse(e.endAt) - Date.parse(e.startAt);
    const startAt = zonedToUtc(first, newStart, user.timezone).toISOString();
    await updateEvent(user.id, id, { ...e, startAt, endAt: new Date(Date.parse(startAt) + duration).toISOString() });
  } else {
    await updateEvent(user.id, id, e);
  }
  return e.allDay ? 'Gespeichert.' : await conflictWarning(user, e.startAt, e.endAt, id) ?? 'Gespeichert.';
}

/** Delete an event – the whole series, or with scope "single" only the occurrence on occurrenceDate. */
export async function deleteEventFor(user: User, id: string, scope: 'single' | 'series', occurrenceDate: string | null): Promise<string> {
  const existing = await getEvent(user.id, id);
  if (!existing) throw new InputError('Termin nicht gefunden.');
  if (IMPORT_ONLY.includes(existing.source)) throw new InputError('Dieser Termin wird in seiner Quelle (WebUntis bzw. Datei) verwaltet.');
  if (EXTERNAL.includes(existing.source) && existing.externalUid) {
    const cal = existing.calendarId ? await getCalendar(user.id, existing.calendarId) : null;
    if (!cal?.writable) throw new InputError('Für diesen Kalender fehlt die Schreibberechtigung.');
    const { calendarId, id: remoteId } = splitExternalUid(existing.externalUid);
    await deleteRemote(user, existing.source as OAuthProvider, calendarId, remoteId);
  }
  if (existing.recurrenceFreq && scope === 'single' && occurrenceDate) {
    await updateEvent(user.id, id, { exdates: [...new Set([...existing.exdates, occurrenceDate])] });
    return 'Dieser Termin wurde aus der Serie entfernt.';
  }
  await deleteEvent(user.id, id);
  return existing.recurrenceFreq ? 'Die ganze Serie wurde gelöscht.' : 'Termin gelöscht.';
}

export interface EventDetails {
  id: string; title: string; description: string | null; date: string; start: string; end: string; allDay: boolean;
  category: CalendarEvent['category']; calendarId: string | null; location: string | null; reminderMinutes: number | null;
  repeat: string; repeatInterval: number; repeatUnit: string; until: string | null; source: string; recurring: boolean;
  repeatDays: number[];
}

/** Event fields for an edit form (in the user's time zone). */
export async function eventDetailsFor(user: User, id: string, occurrenceDate: string | null): Promise<EventDetails | null> {
  const e = await getEvent(user.id, id);
  if (!e) return null;
  const s = utcToZoned(e.startAt, user.timezone);
  const en = utcToZoned(e.endAt, user.timezone);
  const preset = !e.recurrenceFreq ? 'none'
    : e.recurrenceFreq === 'weekly' && e.recurrenceInterval === 2 ? 'biweekly'
    : e.recurrenceInterval === 1 ? e.recurrenceFreq : 'custom';
  return {
    id: e.id, title: e.title, description: e.description, date: occurrenceDate ?? s.date, start: s.time, end: en.time, allDay: e.allDay,
    category: e.category, calendarId: e.calendarId, location: e.location, reminderMinutes: e.reminderMinutes,
    repeat: preset, repeatInterval: e.recurrenceInterval, repeatUnit: e.recurrenceFreq ?? 'weekly', until: e.recurrenceUntil,
    source: e.source, recurring: e.recurrenceFreq !== null, repeatDays: e.recurrenceDays ?? [],
  };
}
