'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { getCalendarItems, mainCalendarId } from '@/lib/calendar';
import { findConflicts } from '@/lib/conflicts';
import { deleteRemote, splitExternalUid, type OAuthProvider } from '@/lib/integrations';
import {
  createCalendar, createEvent, deleteBlocks, deleteCalendar, deleteEvent, getBlock, getCalendar, getEvent,
  updateBlock, updateCalendar, updateEvent, type EventInput,
} from '@/lib/repo';
import { RECURRENCE_PRESETS } from '@/lib/recurrence';
import { isValidDate, isValidTime, utcToZoned, zonedToUtc } from '@/lib/time';
import type { CalendarEvent, CalendarItem, User } from '@/lib/types';
import { category, date, fail, int, InputError, optionalText, text, time, type ActionResult } from '@/lib/validate';

const EXTERNAL = ['google', 'outlook'];
const IMPORT_ONLY = ['webuntis', 'ics'];

function readEventForm(user: User, form: FormData): EventInput {
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

  const calendarId = String(form.get('calendarId') ?? '') || mainCalendarId(user.id);
  const cal = getCalendar(user.id, calendarId);
  if (!cal || !cal.writable || ['study', 'timetable', 'webuntis', 'ics'].includes(cal.kind)) throw new InputError('In diesen Kalender kann nicht geschrieben werden.');

  return {
    title, allDay, calendarId,
    startAt: zonedToUtc(day, start, user.timezone).toISOString(),
    endAt: zonedToUtc(day, end, user.timezone).toISOString(),
    category: category(form), description: optionalText(form, 'description', 2000), location: optionalText(form, 'location', 200),
    reminderMinutes, recurrenceFreq, recurrenceInterval, recurrenceUntil: recurrenceFreq && until ? until : null,
  };
}

function conflictWarning(user: User, startAt: string, endAt: string, ignoreId?: string): string | undefined {
  const items = getCalendarItems(user, startAt, endAt, { includeHidden: true }).filter(i => i.id !== ignoreId);
  const probe = { key: 'probe', kind: 'event', id: 'probe', title: '', startAt, endAt, allDay: false, status: 'active' } as CalendarItem;
  const hits = findConflicts([...items, probe]).filter(c => c.a.key === 'probe' || c.b.key === 'probe').map(c => (c.a.key === 'probe' ? c.b : c.a));
  if (!hits.length) return undefined;
  return `Achtung: überschneidet sich mit „${hits[0].title}“ (${utcToZoned(hits[0].startAt, user.timezone).time} Uhr)${hits.length > 1 ? ` und ${hits.length - 1} weiteren` : ''}.`;
}

function done(message: string): ActionResult {
  revalidatePath('/', 'layout');
  return { ok: true, message };
}

export async function createEventAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const e = readEventForm(user, form);
    const cal = getCalendar(user.id, e.calendarId!)!;
    // Events created in an imported Google/Outlook calendar are written there on the next sync.
    const external = cal.kind === 'google' || cal.kind === 'outlook';
    if (external && e.recurrenceFreq) throw new InputError('Wiederkehrende Termine bitte im CLOQI-Kalender anlegen – sie werden dann exportiert.');
    createEvent(user.id, external
      ? { ...e, source: cal.kind as 'google' | 'outlook', connectionId: cal.connectionId, syncState: 'dirty' }
      : { ...e, source: 'manual' });
    const base = external ? `Gespeichert – wird an ${cal.name} übertragen.` : 'Termin gespeichert.';
    return done(e.allDay ? base : conflictWarning(user, e.startAt, e.endAt) ?? base);
  } catch (e) { return fail(e); }
}

/**
 * scope "series": changes every occurrence (time and details; the series keeps its first date).
 * scope "single": only the clicked occurrence – it is removed from the series and saved on its own.
 */
export async function updateEventAction(id: string, scope: 'single' | 'series', occurrenceDate: string | null, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const existing = getEvent(user.id, id);
    if (!existing) throw new InputError('Termin nicht gefunden.');
    if (IMPORT_ONLY.includes(existing.source)) throw new InputError('Dieser Termin stammt aus WebUntis bzw. einer importierten Datei und bleibt dort maßgeblich.');
    const e = readEventForm(user, form);
    const external = EXTERNAL.includes(existing.source);
    if (external) {
      // keep it in its external calendar; mark for upload on the next sync
      updateEvent(user.id, id, { ...e, calendarId: existing.calendarId, recurrenceFreq: null, syncState: 'dirty' });
      return done('Gespeichert. Die Änderung wird an den verbundenen Kalender übertragen.');
    }
    if (existing.recurrenceFreq && scope === 'single' && occurrenceDate) {
      updateEvent(user.id, id, { exdates: [...new Set([...existing.exdates, occurrenceDate])] });
      createEvent(user.id, { ...e, recurrenceFreq: null, seriesId: existing.id, source: existing.source });
    } else if (existing.recurrenceFreq && scope === 'series') {
      const first = utcToZoned(existing.startAt, user.timezone).date;
      const newStart = utcToZoned(e.startAt, user.timezone).time;
      const duration = Date.parse(e.endAt) - Date.parse(e.startAt);
      const startAt = zonedToUtc(first, newStart, user.timezone).toISOString();
      updateEvent(user.id, id, { ...e, startAt, endAt: new Date(Date.parse(startAt) + duration).toISOString() });
    } else {
      updateEvent(user.id, id, e);
    }
    return done(e.allDay ? 'Gespeichert.' : conflictWarning(user, e.startAt, e.endAt, id) ?? 'Gespeichert.');
  } catch (e) { return fail(e); }
}

export async function deleteEventAction(id: string, scope: 'single' | 'series' = 'series', occurrenceDate: string | null = null): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const existing = getEvent(user.id, id);
    if (!existing) throw new InputError('Termin nicht gefunden.');
    if (IMPORT_ONLY.includes(existing.source)) throw new InputError('Dieser Termin wird in seiner Quelle (WebUntis bzw. Datei) verwaltet.');
    if (EXTERNAL.includes(existing.source) && existing.externalUid) {
      const cal = existing.calendarId ? getCalendar(user.id, existing.calendarId) : null;
      if (!cal?.writable) throw new InputError('Für diesen Kalender fehlt die Schreibberechtigung.');
      const { calendarId, id: remoteId } = splitExternalUid(existing.externalUid);
      await deleteRemote(user, existing.source as OAuthProvider, calendarId, remoteId);
    }
    if (existing.recurrenceFreq && scope === 'single' && occurrenceDate) {
      updateEvent(user.id, id, { exdates: [...new Set([...existing.exdates, occurrenceDate])] });
      return done('Dieser Termin wurde aus der Serie entfernt.');
    }
    deleteEvent(user.id, id);
    return done(existing.recurrenceFreq ? 'Die ganze Serie wurde gelöscht.' : 'Termin gelöscht.');
  } catch (e) { return fail(e); }
}

export async function duplicateEventAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const e = getEvent(user.id, id);
    if (!e) throw new InputError('Termin nicht gefunden.');
    const main = mainCalendarId(user.id);
    const target = e.calendarId && getCalendar(user.id, e.calendarId)?.kind === 'custom' ? e.calendarId : main;
    createEvent(user.id, {
      title: `${e.title} (Kopie)`, description: e.description, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay, category: e.category,
      location: e.location, reminderMinutes: e.reminderMinutes, calendarId: target, source: 'manual',
      recurrenceFreq: e.source === 'manual' || e.source === 'assistant' ? e.recurrenceFreq : null, recurrenceInterval: e.recurrenceInterval,
      recurrenceUntil: e.recurrenceUntil,
    });
    return done('Kopie erstellt.');
  } catch (e) { return fail(e); }
}

/** Drag & drop: move an event (or a single occurrence) or a study block to a new start time. */
export async function moveItemAction(kind: 'event' | 'study', id: string, occurrenceDate: string | null, day: string, start: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!isValidDate(day) || !isValidTime(start)) throw new InputError('Datum oder Uhrzeit ungültig.');
    const s = zonedToUtc(day, start, user.timezone);
    if (kind === 'study') {
      const b = getBlock(user.id, id);
      if (!b) throw new InputError('Lernblock nicht gefunden.');
      const endAt = new Date(s.getTime() + Date.parse(b.endAt) - Date.parse(b.startAt)).toISOString();
      const warn = conflictWarning(user, s.toISOString(), endAt, id);
      if (warn) throw new InputError(warn.replace('Achtung: überschneidet', 'Geht nicht – überschneidet'));
      updateBlock(user.id, id, { startAt: s.toISOString(), endAt, status: 'planned' });
      return done('Lernblock verschoben.');
    }
    const e = getEvent(user.id, id);
    if (!e) throw new InputError('Termin nicht gefunden.');
    if (IMPORT_ONLY.includes(e.source)) throw new InputError('Termine aus WebUntis können nicht verschoben werden.');
    const duration = Date.parse(e.endAt) - Date.parse(e.startAt);
    const startAt = s.toISOString();
    const endAt = new Date(s.getTime() + duration).toISOString();
    if (e.recurrenceFreq && occurrenceDate) {
      updateEvent(user.id, id, { exdates: [...new Set([...e.exdates, occurrenceDate])] });
      createEvent(user.id, {
        title: e.title, description: e.description, startAt, endAt, allDay: e.allDay, category: e.category, location: e.location,
        reminderMinutes: e.reminderMinutes, calendarId: e.calendarId, seriesId: e.id, source: e.source,
      });
    } else {
      updateEvent(user.id, id, { startAt, endAt, ...(EXTERNAL.includes(e.source) ? { syncState: 'dirty' as const } : {}) });
    }
    return done(conflictWarning(user, startAt, endAt, id) ?? 'Termin verschoben.');
  } catch (e) { return fail(e); }
}

export async function setBlockDone(id: string, isDone: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!getBlock(user.id, id)) throw new InputError('Lernblock nicht gefunden.');
    updateBlock(user.id, id, isDone ? { status: 'done', completedAt: new Date().toISOString() } : { status: 'planned', completedAt: null });
    return done(isDone ? 'Stark! Lernblock erledigt.' : 'Wieder offen.');
  } catch (e) { return fail(e); }
}

export async function deleteBlockAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    deleteBlocks(user.id, [id]);
    return done('Lernblock entfernt.');
  } catch (e) { return fail(e); }
}

export interface EventDetails {
  id: string; title: string; description: string | null; date: string; start: string; end: string; allDay: boolean;
  category: CalendarEvent['category']; calendarId: string | null; location: string | null; reminderMinutes: number | null;
  repeat: string; repeatInterval: number; repeatUnit: string; until: string | null; source: string; recurring: boolean;
}

/** Event fields for the edit form (in the user's time zone). */
export async function getEventDetails(id: string, occurrenceDate: string | null): Promise<EventDetails | null> {
  const user = await requireUser();
  const e = getEvent(user.id, id);
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
    source: e.source, recurring: e.recurrenceFreq !== null,
  };
}

/** Life routines: one weekly series per selected weekday (e.g. training Tue + Thu). */
export async function addRoutineAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const title = text(form, 'title', { required: true, max: 80, label: 'Titel' });
    const cat = category(form);
    const startTime = time(form, 'start', 'Beginn');
    const endTime = time(form, 'end', 'Ende');
    if (endTime <= startTime) throw new InputError('Das Ende muss nach dem Beginn liegen.');
    const weekdays = form.getAll('weekday').map(Number).filter(n => n >= 1 && n <= 7);
    if (!weekdays.length) throw new InputError('Bitte wähle mindestens einen Wochentag.');
    const until = String(form.get('until') ?? '');
    if (until && !isValidDate(until)) throw new InputError('Ungültiges Enddatum.');
    const today = utcToZoned(new Date(), user.timezone);
    const calendarId = mainCalendarId(user.id);
    for (const wd of weekdays) {
      const diff = (wd - today.weekday + 7) % 7;
      const d = new Date(`${today.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + diff);
      const day = d.toISOString().slice(0, 10);
      createEvent(user.id, {
        title, category: cat, calendarId, source: 'manual', location: optionalText(form, 'location', 200),
        startAt: zonedToUtc(day, startTime, user.timezone).toISOString(), endAt: zonedToUtc(day, endTime, user.timezone).toISOString(),
        recurrenceFreq: 'weekly', recurrenceInterval: 1, recurrenceUntil: until || null, reminderMinutes: user.prefs.reminderDefault,
      });
    }
    return done(`${title} ist eingetragen – CLOQI plant ab jetzt drumherum.`);
  } catch (e) { return fail(e); }
}

// ---------- calendar groups ----------

export async function toggleCalendarVisibility(id: string, visible: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!getCalendar(user.id, id)) throw new InputError('Kalender nicht gefunden.');
    updateCalendar(user.id, id, { visible });
    return done(visible ? 'Eingeblendet.' : 'Ausgeblendet.');
  } catch (e) { return fail(e); }
}

export async function saveCalendarAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const name = text(form, 'name', { required: true, max: 40, label: 'Name' });
    const color = String(form.get('color') ?? '#7CC51B');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new InputError('Ungültige Farbe.');
    const id = String(form.get('id') ?? '');
    if (id) {
      if (!getCalendar(user.id, id)) throw new InputError('Kalender nicht gefunden.');
      updateCalendar(user.id, id, { name, color });
      return done('Kalender gespeichert.');
    }
    createCalendar(user.id, { name, color, kind: 'custom' });
    return done(`Kalender „${name}“ erstellt.`);
  } catch (e) { return fail(e); }
}

export async function deleteCalendarAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const cal = getCalendar(user.id, id);
    if (!cal) throw new InputError('Kalender nicht gefunden.');
    if (cal.kind !== 'custom') throw new InputError('Eingebaute und verbundene Kalender trennst du unter „Kalender verbinden“.');
    deleteCalendar(user.id, id);
    return done('Kalender und seine Termine wurden gelöscht.');
  } catch (e) { return fail(e); }
}

// ---------- reminders ----------

export interface ReminderItem { key: string; title: string; startAt: string; remindAt: string; kind: CalendarItem['kind'] }

/** Upcoming items with their reminder time (for in-app and browser notifications). */
export async function upcomingReminders(): Promise<ReminderItem[]> {
  const user = await requireUser();
  const now = Date.now();
  const items = getCalendarItems(user, new Date(now - 3600000).toISOString(), new Date(now + 26 * 3600000).toISOString());
  return items
    .filter(i => (i.status === 'active' || i.status === 'planned') && !i.allDay)
    .map(i => {
      const minutes = i.kind === 'lesson' ? null : i.reminderMinutes;
      return minutes === null ? null : { key: i.key, title: i.title, startAt: i.startAt, remindAt: new Date(Date.parse(i.startAt) - minutes * 60000).toISOString(), kind: i.kind };
    })
    .filter((x): x is ReminderItem => x !== null && Date.parse(x.startAt) > now);
}
