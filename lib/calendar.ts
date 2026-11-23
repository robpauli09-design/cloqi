import 'server-only';
import { calendarOfKind, listBlocks, listBreaks, listCalendars, listEvents, listTasks, listTimetable } from './repo';
import { expandOccurrences } from './recurrence';
import { addDays, utcToZoned, zonedToUtc } from './time';
import { TASK_KIND_LABELS, type CalendarEvent, type CalendarItem, type User, type UserCalendar } from './types';
import type { Interval } from './scheduler';

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'CLOQI', assistant: 'CLOQI AI', webuntis: 'WebUntis', ics: 'Importierte Kalenderdatei', google: 'Google Kalender',
  outlook: 'Outlook', timetable: 'Stundenplan', cloqi: 'CLOQI AI',
};

const READ_ONLY_SOURCES = new Set(['webuntis', 'ics']);

function eventToItems(e: CalendarEvent, cal: UserCalendar | undefined, from: string, to: string, tz: string): CalendarItem[] {
  const recurring = e.recurrenceFreq !== null;
  const base = (startAt: string, endAt: string, key: string, occurrenceDate: string | null): CalendarItem => ({
    key, kind: e.source === 'webuntis' ? 'lesson' : 'event', id: e.id, title: e.title, startAt, endAt, allDay: e.allDay,
    category: e.category, status: e.status, source: e.source, location: e.location, teacher: e.teacher,
    description: e.description, readOnly: READ_ONLY_SOURCES.has(e.source) || (cal ? !cal.writable : false),
    taskId: null, reminderMinutes: e.reminderMinutes,
    calendarLabel: cal ? (cal.kind === 'cloqi' ? SOURCE_LABEL[e.source] ?? 'CLOQI' : cal.name) : SOURCE_LABEL[e.source] ?? 'CLOQI',
    calendarId: e.calendarId, calendarColor: cal?.color ?? null, recurring, occurrenceDate,
  });
  if (!recurring) return [base(e.startAt, e.endAt, e.id, null)];
  return expandOccurrences(e.startAt, e.endAt, {
    freq: e.recurrenceFreq!, interval: e.recurrenceInterval, until: e.recurrenceUntil, exdates: e.exdates,
  }, from, to, tz).map(o => base(o.startAt, o.endAt, `${e.id}@${o.date}`, o.date));
}

/**
 * Everything that appears in the user's calendar between two instants.
 * `includeHidden` ignores the calendar visibility toggles (used for planning and conflicts).
 */
export async function getCalendarItems(user: User, fromIso: string, toIso: string, opts: { includeHidden?: boolean } = {}): Promise<CalendarItem[]> {
  const tz = user.timezone;
  const calendars = await listCalendars(user.id);
  const calById = new Map(calendars.map(c => [c.id, c]));
  const main = calendars.find(c => c.kind === 'cloqi');
  const visible = (id: string | null | undefined) => opts.includeHidden || !id || calById.get(id)?.visible !== false;
  const items: CalendarItem[] = [];

  for (const e of await listEvents(user.id, fromIso, toIso)) {
    const cal = calById.get(e.calendarId ?? '') ?? main;
    if (!visible(cal?.id)) continue;
    items.push(...eventToItems(e, cal, fromIso, toIso, tz));
  }

  const ttCal = calendars.find(c => c.kind === 'timetable');
  const timetable = await listTimetable(user.id);
  if (timetable.length && visible(ttCal?.id)) {
    const breaks = await listBreaks(user.id);
    const fromDay = utcToZoned(fromIso, tz).date;
    const toDay = utcToZoned(toIso, tz).date;
    for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
      if (breaks.some(b => d >= b.startDate && d <= b.endDate)) continue;
      const wd = utcToZoned(zonedToUtc(d, '12:00', tz), tz).weekday;
      for (const t of timetable.filter(x => x.weekday === wd && !x.exdates.includes(d))) {
        const s = zonedToUtc(d, t.startTime, tz).toISOString();
        const e = zonedToUtc(d, t.endTime, tz).toISOString();
        if (s >= toIso || e <= fromIso) continue;
        items.push({
          key: `tt:${t.id}@${d}`, kind: 'lesson', id: t.id, title: t.subject, startAt: s, endAt: e, allDay: false,
          category: 'schule', status: 'active', source: 'timetable', location: t.room, teacher: t.teacher,
          description: t.institution, readOnly: true, taskId: null, reminderMinutes: null, calendarLabel: 'Stundenplan',
          calendarId: ttCal?.id ?? null, calendarColor: ttCal?.color ?? null, recurring: true, occurrenceDate: d,
        });
      }
    }
  }

  const studyCal = calendars.find(c => c.kind === 'study');
  const tasks = await listTasks(user.id);
  const taskById = new Map(tasks.map(t => [t.id, t]));
  if (visible(studyCal?.id)) {
    for (const b of await listBlocks(user.id, fromIso, toIso)) {
      const task = taskById.get(b.taskId);
      items.push({
        key: `sb:${b.id}`, kind: 'study', id: b.id, title: task ? `${task.subject} lernen` : 'Lernblock',
        startAt: b.startAt, endAt: b.endAt, allDay: false, category: 'lernen', status: b.status, source: 'cloqi',
        location: null, teacher: null, description: [b.note, task ? `für ${task.title}` : null].filter(Boolean).join(' · ') || null,
        readOnly: false, taskId: b.taskId, reminderMinutes: user.prefs.reminderDefault, calendarLabel: 'CLOQI AI · Lernplan',
        calendarId: studyCal?.id ?? null, calendarColor: studyCal?.color ?? null, recurring: false, occurrenceDate: null,
      });
    }
    for (const t of tasks) {
      if (t.dueAt < fromIso || t.dueAt >= toIso) continue;
      items.push({
        key: `task:${t.id}`, kind: 'deadline', id: t.id, title: `${TASK_KIND_LABELS[t.kind]}: ${t.subject}`,
        startAt: t.dueAt, endAt: new Date(Date.parse(t.dueAt) + 50 * 60000).toISOString(), allDay: false,
        category: t.kind === 'hausuebung' ? 'hausuebung' : 'pruefung', status: t.status === 'done' ? 'done' : 'active',
        source: 'cloqi', location: null, teacher: null, description: t.title, readOnly: false, taskId: t.id,
        reminderMinutes: 24 * 60, calendarLabel: 'CLOQI Learn', calendarId: studyCal?.id ?? null, calendarColor: null,
        recurring: false, occurrenceDate: null,
      });
    }
  }

  return items.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt));
}

/** Time that is already taken (for planning). Cancelled lessons and deadlines count as free time. */
export function busyIntervals(items: CalendarItem[], opts: { excludeStudyIds?: Set<string> } = {}): Interval[] {
  return items
    .filter(i => !i.allDay && i.kind !== 'deadline' && i.status !== 'cancelled' && i.status !== 'missed')
    .filter(i => !(i.kind === 'study' && opts.excludeStudyIds?.has(i.id)))
    .map(i => ({ start: Date.parse(i.startAt), end: Date.parse(i.endAt) }));
}

export function dayRange(date: string, tz: string, days = 1): { from: string; to: string } {
  return { from: zonedToUtc(date, '00:00', tz).toISOString(), to: zonedToUtc(addDays(date, days), '00:00', tz).toISOString() };
}

export async function mainCalendarId(userId: string): Promise<string> { return (await calendarOfKind(userId, 'cloqi')).id; }
