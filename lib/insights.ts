import 'server-only';
import { busyIntervals, dayRange, getCalendarItems } from './calendar';
import { findConflicts, type Conflict } from './conflicts';
import { listOpenSuggestions, listTasks } from './repo';
import { freeSlots } from './scheduler';
import { addDays, daysBetween, todayIn, utcToZoned } from './time';
import { TASK_KIND_LABELS, type CalendarItem, type Suggestion, type Task, type User } from './types';

export interface Dashboard {
  today: string;
  items: CalendarItem[];
  nextLesson: CalendarItem | null;
  nextEvent: CalendarItem | null;
  studyToday: CalendarItem[];
  trainingToday: CalendarItem[];
  openTasks: Task[];
  freeToday: { start: string; end: string }[];
  conflicts: Conflict[];
  suggestions: Suggestion[];
  insight: string;
}

const hm = (iso: string, tz: string) => utcToZoned(iso, tz).time;

export function buildDashboard(user: User, now = new Date()): Dashboard {
  const tz = user.timezone;
  const today = todayIn(tz, now);
  const { from, to } = dayRange(today, tz);
  const nowIso = now.toISOString();
  const items = getCalendarItems(user, from, to).filter(i => i.status !== 'missed');
  const week = getCalendarItems(user, nowIso, dayRange(addDays(today, 7), tz).from, { includeHidden: true });
  const upcoming = (i: CalendarItem) => i.endAt > nowIso && (i.status === 'active' || i.status === 'planned');
  const allTasks = listTasks(user.id, { openOnly: true }).filter(t => t.dueAt > nowIso);

  const busy = busyIntervals(getCalendarItems(user, from, to, { includeHidden: true }));
  const freeToday = freeSlots(today, tz, busy, { ...user.prefs, studyStart: '14:00', studyEnd: '21:00', weekendStart: '10:00', weekendEnd: '20:00' }, now)
    .filter(s => s.end - s.start >= 60 * 60000)
    .map(s => ({ start: hm(new Date(s.start).toISOString(), tz), end: hm(new Date(s.end).toISOString(), tz) }));

  const suggestions = listOpenSuggestions(user.id);
  const conflicts = findConflicts(week);

  // A short, honest personal note from the mascot – derived only from real data.
  const tomorrow = getCalendarItems(user, ...Object.values(dayRange(addDays(today, 1), tz)) as [string, string]);
  const lessonsTomorrow = tomorrow.filter(i => i.kind === 'lesson' && i.status === 'active');
  const nextTask = allTasks[0];
  const daysToTask = nextTask ? daysBetween(today, utcToZoned(nextTask.dueAt, tz).date) : null;
  const studyToday = items.filter(i => i.kind === 'study');
  let insight = 'Heute ist es ruhig. Gönn dir auch mal Pause – Freizeit ist genauso wichtig wie Lernen.';
  if (suggestions.some(s => s.kind === 'cancellation')) insight = suggestions.find(s => s.kind === 'cancellation')!.message;
  else if (conflicts.length) insight = `Achtung: „${conflicts[0].a.title}“ und „${conflicts[0].b.title}“ überschneiden sich. Schau mal in deinen Kalender.`;
  else if (nextTask && daysToTask !== null && daysToTask <= 7) {
    const planned = week.filter(i => i.kind === 'study' && i.taskId === nextTask.id).length;
    insight = planned
      ? `Dein ${TASK_KIND_LABELS[nextTask.kind]} in ${nextTask.subject} ist ${daysToTask === 1 ? 'morgen' : `in ${daysToTask} Tagen`}. Ich habe dir ${planned} Lernblöcke eingeplant.`
      : `Dein ${TASK_KIND_LABELS[nextTask.kind]} in ${nextTask.subject} ist ${daysToTask === 1 ? 'morgen' : `in ${daysToTask} Tagen`} – soll ich dir Lernzeit einplanen? Schau in „Learn“.`;
  } else if (lessonsTomorrow.length >= 7) insight = `Morgen hast du einen langen Schultag (${lessonsTomorrow.length} Stunden). Erledige heute schon, was geht.`;
  else if (studyToday.length) insight = `Ich habe deinen Tag vorbereitet: ${studyToday.length} Lernblock${studyToday.length > 1 ? 'e' : ''} warten auf dich.`;
  else if (freeToday.length) insight = `Du hast heute zwischen ${freeToday[0].start} und ${freeToday[0].end} Uhr noch nichts geplant.`;

  return {
    today, items,
    nextLesson: week.find(i => i.kind === 'lesson' && upcoming(i)) ?? null,
    nextEvent: week.find(i => i.kind === 'event' && upcoming(i)) ?? null,
    studyToday,
    trainingToday: items.filter(i => i.category === 'training'),
    openTasks: allTasks.slice(0, 5),
    freeToday, conflicts, suggestions, insight,
  };
}
