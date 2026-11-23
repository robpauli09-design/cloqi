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
import { category, fail, InputError, optionalText, text, time, type ActionResult } from '@/lib/validate';
import { conflictWarning, createEventFor, readEventForm } from '@/lib/event-input';

const EXTERNAL = ['google', 'outlook'];
const IMPORT_ONLY = ['webuntis', 'ics'];

async function done(message: string): Promise<ActionResult> {
  revalidatePath('/', 'layout');
  return { ok: true, message };
}

export async function createEventAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    return done(await createEventFor(user, form));
  } catch (e) { return fail(e); }
}

/**
 * scope "series": changes every occurrence (time and details; the series keeps its first date).
 * scope "single": only the clicked occurrence – it is removed from the series and saved on its own.
 */
export async function updateEventAction(id: string, scope: 'single' | 'series', occurrenceDate: string | null, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const existing = await getEvent(user.id, id);
    if (!existing) throw new InputError('Termin nicht gefunden.');
    if (IMPORT_ONLY.includes(existing.source)) throw new InputError('Dieser Termin stammt aus WebUntis bzw. einer importierten Datei und bleibt dort maßgeblich.');
    const e = await readEventForm(user, form);
    const external = EXTERNAL.includes(existing.source);
    if (external) {
      // keep it in its external calendar; mark for upload on the next sync
      await updateEvent(user.id, id, { ...e, calendarId: existing.calendarId, recurrenceFreq: null, syncState: 'dirty' });
      return done('Gespeichert. Die Änderung wird an den verbundenen Kalender übertragen.');
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
    return done(e.allDay ? 'Gespeichert.' : await conflictWarning(user, e.startAt, e.endAt, id) ?? 'Gespeichert.');
  } catch (e) { return fail(e); }
}

export async function deleteEventAction(id: string, scope: 'single' | 'series' = 'series', occurrenceDate: string | null = null): Promise<ActionResult> {
  try {
    const user = await requireUser();
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
      return done('Dieser Termin wurde aus der Serie entfernt.');
    }
    await deleteEvent(user.id, id);
    return done(existing.recurrenceFreq ? 'Die ganze Serie wurde gelöscht.' : 'Termin gelöscht.');
  } catch (e) { return fail(e); }
}

export async function duplicateEventAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const e = await getEvent(user.id, id);
    if (!e) throw new InputError('Termin nicht gefunden.');
    const main = await mainCalendarId(user.id);
    const target = e.calendarId && (await getCalendar(user.id, e.calendarId))?.kind === 'custom' ? e.calendarId : main;
    await createEvent(user.id, {
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
      const b = await getBlock(user.id, id);
      if (!b) throw new InputError('Lernblock nicht gefunden.');
      const endAt = new Date(s.getTime() + Date.parse(b.endAt) - Date.parse(b.startAt)).toISOString();
      const warn = await conflictWarning(user, s.toISOString(), endAt, id);
      if (warn) throw new InputError(warn.replace('Achtung: überschneidet', 'Geht nicht – überschneidet'));
      await updateBlock(user.id, id, { startAt: s.toISOString(), endAt, status: 'planned' });
      return done('Lernblock verschoben.');
    }
    const e = await getEvent(user.id, id);
    if (!e) throw new InputError('Termin nicht gefunden.');
    if (IMPORT_ONLY.includes(e.source)) throw new InputError('Termine aus WebUntis können nicht verschoben werden.');
    const duration = Date.parse(e.endAt) - Date.parse(e.startAt);
    const startAt = s.toISOString();
    const endAt = new Date(s.getTime() + duration).toISOString();
    if (e.recurrenceFreq && occurrenceDate) {
      await updateEvent(user.id, id, { exdates: [...new Set([...e.exdates, occurrenceDate])] });
      await createEvent(user.id, {
        title: e.title, description: e.description, startAt, endAt, allDay: e.allDay, category: e.category, location: e.location,
        reminderMinutes: e.reminderMinutes, calendarId: e.calendarId, seriesId: e.id, source: e.source,
      });
    } else {
      await updateEvent(user.id, id, { startAt, endAt, ...(EXTERNAL.includes(e.source) ? { syncState: 'dirty' as const } : {}) });
    }
    return done(await conflictWarning(user, startAt, endAt, id) ?? 'Termin verschoben.');
  } catch (e) { return fail(e); }
}

export async function setBlockDone(id: string, isDone: boolean): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!await getBlock(user.id, id)) throw new InputError('Lernblock nicht gefunden.');
    await updateBlock(user.id, id, isDone ? { status: 'done', completedAt: new Date().toISOString() } : { status: 'planned', completedAt: null });
    return done(isDone ? 'Stark! Lernblock erledigt.' : 'Wieder offen.');
  } catch (e) { return fail(e); }
}

export async function deleteBlockAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await deleteBlocks(user.id, [id]);
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
    const calendarId = await mainCalendarId(user.id);
    for (const wd of weekdays) {
      const diff = (wd - today.weekday + 7) % 7;
      const d = new Date(`${today.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + diff);
      const day = d.toISOString().slice(0, 10);
      await createEvent(user.id, {
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
    if (!await getCalendar(user.id, id)) throw new InputError('Kalender nicht gefunden.');
    await updateCalendar(user.id, id, { visible });
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
      if (!await getCalendar(user.id, id)) throw new InputError('Kalender nicht gefunden.');
      await updateCalendar(user.id, id, { name, color });
      return done('Kalender gespeichert.');
    }
    await createCalendar(user.id, { name, color, kind: 'custom' });
    return done(`Kalender „${name}“ erstellt.`);
  } catch (e) { return fail(e); }
}

export async function deleteCalendarAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const cal = await getCalendar(user.id, id);
    if (!cal) throw new InputError('Kalender nicht gefunden.');
    if (cal.kind !== 'custom') throw new InputError('Eingebaute und verbundene Kalender trennst du unter „Kalender verbinden“.');
    await deleteCalendar(user.id, id);
    return done('Kalender und seine Termine wurden gelöscht.');
  } catch (e) { return fail(e); }
}

// ---------- reminders ----------

export interface ReminderItem { key: string; title: string; startAt: string; remindAt: string; kind: CalendarItem['kind'] }

/** Upcoming items with their reminder time (for in-app and browser notifications). */
export async function upcomingReminders(): Promise<ReminderItem[]> {
  const user = await requireUser();
  const now = Date.now();
  const items = await getCalendarItems(user, new Date(now - 3600000).toISOString(), new Date(now + 26 * 3600000).toISOString());
  return items
    .filter(i => (i.status === 'active' || i.status === 'planned') && !i.allDay)
    .map(i => {
      const minutes = i.kind === 'lesson' ? null : i.reminderMinutes;
      return minutes === null ? null : { key: i.key, title: i.title, startAt: i.startAt, remindAt: new Date(Date.parse(i.startAt) - minutes * 60000).toISOString(), kind: i.kind };
    })
    .filter((x): x is ReminderItem => x !== null && Date.parse(x.startAt) > now);
}
