import type { CalendarItem } from './types.ts';

export interface Conflict { a: CalendarItem; b: CalendarItem }

/** Overlapping timed items. Lesson-vs-lesson overlaps (e.g. manual + imported timetable) are ignored. */
export function findConflicts(items: CalendarItem[]): Conflict[] {
  const timed = items
    .filter(i => !i.allDay && i.kind !== 'deadline' && (i.status === 'active' || i.status === 'planned'))
    .sort((x, y) => x.startAt.localeCompare(y.startAt));
  const out: Conflict[] = [];
  for (let i = 0; i < timed.length; i++) {
    const a = timed[i];
    const aEnd = Date.parse(a.endAt);
    for (let j = i + 1; j < timed.length; j++) {
      const b = timed[j];
      if (Date.parse(b.startAt) >= aEnd) break;
      if (a.kind === 'lesson' && b.kind === 'lesson') continue;
      out.push({ a, b });
    }
  }
  return out;
}
