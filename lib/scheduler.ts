// CLOQI planning engine: distributes study time for open tasks into free slots.
// Pure and deterministic – no database access – so it can be unit tested.

import type { Prefs } from './types.ts';
import { addDays, daysBetween, timeToMinutes, todayIn, utcToZoned, weekdayOf, zonedToUtc } from './time.ts';

export interface Interval { start: number; end: number }

export interface PlanTask {
  id: string;
  title: string;
  dueAt: string;            // ISO instant of the test / deadline
  remainingMinutes: number; // study time still to be planned
  difficulty: 1 | 2 | 3;
  priority: 1 | 2 | 3;
  notBefore?: string | null; // YYYY-MM-DD – no study before this day
}

export interface PlannedBlock {
  taskId: string;
  startAt: string;
  endAt: string;
  minutes: number;
  label: string;
}

export interface PlanResult {
  blocks: PlannedBlock[];
  shortfalls: { taskId: string; missingMinutes: number }[];
}

export interface PlanInput {
  now: Date;
  tz: string;
  tasks: PlanTask[];
  busy: Interval[];
  prefs: Pick<Prefs, 'studyStart' | 'studyEnd' | 'weekendStart' | 'weekendEnd' | 'studyOnSunday' | 'maxStudyPerDay' | 'blockMax' | 'breakMin'>;
}

const STEP = 15;
const MIN_BLOCK = 30;

/** Default study effort per task type and difficulty (minutes). */
export function estimateMinutes(kind: string, difficulty: 1 | 2 | 3): number {
  const base: Record<string, number> = { test: 120, schularbeit: 180, pruefung: 240, hausuebung: 45, referat: 150, lernziel: 60 };
  const factor = difficulty === 1 ? 0.75 : difficulty === 3 ? 1.5 : 1;
  return Math.round(((base[kind] ?? 120) * factor) / STEP) * STEP;
}

function dayWindow(date: string, tz: string, prefs: PlanInput['prefs']): Interval | null {
  const wd = weekdayOf(date);
  if (wd === 7 && !prefs.studyOnSunday) return null;
  const [from, to] = wd >= 6 ? [prefs.weekendStart, prefs.weekendEnd] : [prefs.studyStart, prefs.studyEnd];
  if (timeToMinutes(to) <= timeToMinutes(from)) return null;
  return { start: zonedToUtc(date, from, tz).getTime(), end: zonedToUtc(date, to, tz).getTime() };
}

function subtract(windows: Interval[], blockers: Interval[]): Interval[] {
  let out = windows;
  for (const b of blockers) {
    const next: Interval[] = [];
    for (const w of out) {
      if (b.end <= w.start || b.start >= w.end) { next.push(w); continue; }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    out = next;
  }
  return out;
}

const roundUp = (ms: number) => Math.ceil(ms / (STEP * 60000)) * STEP * 60000;

export function planStudy(input: PlanInput): PlanResult {
  const { now, tz, prefs } = input;
  const pad = prefs.breakMin * 60000;
  const remaining = new Map(input.tasks.map(t => [t.id, Math.max(0, t.remainingMinutes)]));
  const blockers: Interval[] = input.busy.map(b => ({ start: b.start - pad, end: b.end + pad }));
  const placed: (PlannedBlock & { s: number; e: number })[] = [];
  const today = todayIn(tz, now);
  const dueDay = new Map(input.tasks.map(t => [t.id, utcToZoned(t.dueAt, tz).date]));
  const lastDay = [...dueDay.values()].sort().pop();
  if (!lastDay) return { blocks: [], shortfalls: [] };

  // Count remaining study days per task so effort is spread evenly.
  const windowsByDay = new Map<string, Interval>();
  for (let d = today; d < lastDay; d = addDays(d, 1)) {
    const w = dayWindow(d, tz, prefs);
    if (w) windowsByDay.set(d, w);
  }
  const notBefore = new Map(input.tasks.map(t => [t.id, t.notBefore ?? '']));
  const studyDaysLeft = (taskId: string, from: string) => {
    let n = 0;
    for (const d of windowsByDay.keys()) if (d >= from && d >= notBefore.get(taskId)! && d < dueDay.get(taskId)!) n++;
    return n;
  };

  for (let d = today; d < lastDay; d = addDays(d, 1)) {
    const window = windowsByDay.get(d);
    if (!window) continue;
    const startMs = Math.max(window.start, roundUp(now.getTime()));
    if (startMs >= window.end) continue;
    let capacity = prefs.maxStudyPerDay;

    const candidates = input.tasks
      .filter(t => (remaining.get(t.id) ?? 0) > 0 && dueDay.get(t.id)! > d && d >= (t.notBefore ?? '') && new Date(t.dueAt).getTime() > startMs)
      .sort((a, b) =>
        daysBetween(d, dueDay.get(a.id)!) - daysBetween(d, dueDay.get(b.id)!) ||
        b.difficulty - a.difficulty || b.priority - a.priority || a.id.localeCompare(b.id));

    for (const task of candidates) {
      if (capacity < MIN_BLOCK) break;
      const rest = remaining.get(task.id)!;
      const daysLeft = Math.max(1, studyDaysLeft(task.id, d));
      const isLastDay = daysLeft === 1;
      let target = isLastDay ? rest : Math.ceil(rest / daysLeft / STEP) * STEP;
      target = Math.max(Math.min(rest, MIN_BLOCK), Math.min(target, capacity));

      // On the last day a big remainder may be split into several blocks.
      while (target >= Math.min(MIN_BLOCK, rest) && capacity >= Math.min(MIN_BLOCK, rest) && (remaining.get(task.id) ?? 0) > 0) {
        const want = Math.min(target, prefs.blockMax, remaining.get(task.id)!, capacity);
        const free = subtract([{ start: startMs, end: window.end }], [
          ...blockers,
          ...placed.map(p => ({ start: p.s - pad, end: p.e + pad })),
        ]).filter(f => f.end - f.start >= Math.min(MIN_BLOCK, want) * 60000);
        if (!free.length) break;
        const slot = free[0];
        const minutes = Math.min(want, Math.floor((slot.end - slot.start) / 60000 / STEP) * STEP);
        if (minutes < Math.min(MIN_BLOCK, want)) break;
        const s = slot.start;
        const e = s + minutes * 60000;
        placed.push({ taskId: task.id, startAt: new Date(s).toISOString(), endAt: new Date(e).toISOString(), minutes, label: '', s, e });
        remaining.set(task.id, remaining.get(task.id)! - minutes);
        capacity -= minutes;
        target -= minutes;
        if (!isLastDay) break;
      }
    }
  }

  // Name the blocks per task: first = basics, last = review, others = practice.
  for (const task of input.tasks) {
    const own = placed.filter(p => p.taskId === task.id).sort((a, b) => a.s - b.s);
    own.forEach((p, i) => {
      p.label = own.length === 1 ? 'Lernen'
        : i === 0 ? 'Grundlagen'
        : i === own.length - 1 ? 'Wiederholung'
        : 'Übungen';
    });
  }

  return {
    blocks: placed.sort((a, b) => a.s - b.s).map(({ s: _s, e: _e, ...b }) => b),
    shortfalls: input.tasks
      .filter(t => (remaining.get(t.id) ?? 0) > 0)
      .map(t => ({ taskId: t.id, missingMinutes: remaining.get(t.id)! })),
  };
}

/** Free slots inside a day's study window (used for "Wann habe ich Zeit?"). */
export function freeSlots(date: string, tz: string, busy: Interval[], prefs: PlanInput['prefs'], now: Date): Interval[] {
  const window = dayWindow(date, tz, prefs) ?? (() => {
    const s = zonedToUtc(date, prefs.weekendStart, tz).getTime();
    return { start: s, end: zonedToUtc(date, prefs.weekendEnd, tz).getTime() };
  })();
  const pad = prefs.breakMin * 60000;
  const start = Math.max(window.start, roundUp(now.getTime()));
  if (start >= window.end) return [];
  return subtract([{ start, end: window.end }], busy.map(b => ({ start: b.start - pad, end: b.end + pad })))
    .filter(s => s.end - s.start >= MIN_BLOCK * 60000);
}
