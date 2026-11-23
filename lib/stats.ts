import 'server-only';
import { listBlocks, listTasks } from './repo';
import { addDays, startOfWeek, todayIn, utcToZoned } from './time';
import type { User } from './types';

export interface Progress {
  todayMinutes: number;
  dailyGoal: number;
  weekDone: number;
  weekPlanned: number;
  weekMinutes: number;
  streak: number;
  openTasks: number;
  doneTasks: number;
  badges: { id: string; label: string; earned: boolean; hint: string }[];
  weekDays: { date: string; minutes: number }[];
}

export function getProgress(user: User, now = new Date()): Progress {
  const tz = user.timezone;
  const today = todayIn(tz, now);
  const weekStart = startOfWeek(today);
  const blocks = listBlocks(user.id);
  const tasks = listTasks(user.id);
  const minutes = (b: { startAt: string; endAt: string }) => Math.round((Date.parse(b.endAt) - Date.parse(b.startAt)) / 60000);

  const doneByDay = new Map<string, number>();
  for (const b of blocks.filter(x => x.status === 'done')) {
    const d = utcToZoned(b.startAt, tz).date;
    doneByDay.set(d, (doneByDay.get(d) ?? 0) + minutes(b));
  }
  const week = blocks.filter(b => { const d = utcToZoned(b.startAt, tz).date; return d >= weekStart && d < addDays(weekStart, 7); });

  // Streak: consecutive days with at least one finished block, counting back from today (or yesterday).
  let streak = 0;
  let d = doneByDay.has(today) ? today : addDays(today, -1);
  while (doneByDay.has(d)) { streak++; d = addDays(d, -1); }

  const totalDone = blocks.filter(b => b.status === 'done').length;
  const badges = [
    { id: 'first', label: 'Erster Lernblock', earned: totalDone >= 1, hint: 'Hake deinen ersten Lernblock ab.' },
    { id: 'streak3', label: '3 Tage in Folge', earned: streak >= 3, hint: 'Lerne an drei Tagen hintereinander.' },
    { id: 'streak7', label: 'Wochen-Serie', earned: streak >= 7, hint: 'Sieben Tage in Folge.' },
    { id: 'ten', label: '10 Lernblöcke', earned: totalDone >= 10, hint: 'Schließe zehn Lernblöcke ab.' },
    { id: 'planner', label: 'Vorausplaner', earned: tasks.length >= 3, hint: 'Trag drei Tests oder Aufgaben ein.' },
  ];

  return {
    todayMinutes: doneByDay.get(today) ?? 0,
    dailyGoal: user.prefs.dailyGoalMin,
    weekDone: week.filter(b => b.status === 'done').length,
    weekPlanned: week.length,
    weekMinutes: week.filter(b => b.status === 'done').reduce((s, b) => s + minutes(b), 0),
    streak,
    openTasks: tasks.filter(t => t.status === 'open').length,
    doneTasks: tasks.filter(t => t.status === 'done').length,
    badges,
    weekDays: Array.from({ length: 7 }, (_, i) => ({ date: addDays(weekStart, i), minutes: doneByDay.get(addDays(weekStart, i)) ?? 0 })),
  };
}
