// Cycle estimates for the optional CYCLE module. These are statistical estimates,
// not medical advice and not suitable for contraception.

import { addDays, daysBetween } from './time.ts';
import type { CycleEntry } from './types.ts';

export type Phase = 'menstruation' | 'follikel' | 'eisprung' | 'luteal';

export const PHASE_LABEL: Record<Phase, string> = {
  menstruation: 'Periode', follikel: 'Follikelphase', eisprung: 'Fruchtbares Fenster (geschätzt)', luteal: 'Lutealphase',
};

export interface CycleSummary {
  cycleLength: number;       // average, days
  periodLength: number;      // average, days
  lastStart: string | null;
  nextStart: string | null;
  daysUntilNext: number | null;
  dayOfCycle: number | null;
  phase: Phase | null;
  basedOnCycles: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function summarize(entries: Pick<CycleEntry, 'date' | 'type'>[], today: string): CycleSummary {
  const starts = [...new Set(entries.filter(e => e.type === 'period_start').map(e => e.date))].sort();
  const ends = entries.filter(e => e.type === 'period_end').map(e => e.date).sort();

  const lengths: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = daysBetween(starts[i - 1], starts[i]);
    if (len >= 15 && len <= 60) lengths.push(len); // ignore implausible gaps (missed logging)
  }
  const recent = lengths.slice(-6);
  const cycleLength = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;

  const periods: number[] = [];
  for (const s of starts) {
    const end = ends.find(e => e >= s && daysBetween(s, e) <= 10);
    if (end) periods.push(daysBetween(s, end) + 1);
  }
  const periodLength = periods.length ? clamp(Math.round(periods.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, periods.length)), 2, 10) : 5;

  const lastStart = [...starts].reverse().find(s => s <= today) ?? null;
  if (!lastStart) {
    return { cycleLength, periodLength, lastStart: null, nextStart: null, daysUntilNext: null, dayOfCycle: null, phase: null, basedOnCycles: recent.length };
  }
  let nextStart = addDays(lastStart, cycleLength);
  while (nextStart < today) nextStart = addDays(nextStart, cycleLength); // overdue: keep projecting
  const dayOfCycle = daysBetween(lastStart, today) % cycleLength + 1;
  const ovulationDay = cycleLength - 14;
  const phase: Phase = dayOfCycle <= periodLength ? 'menstruation'
    : Math.abs(dayOfCycle - ovulationDay) <= 2 ? 'eisprung'
    : dayOfCycle < ovulationDay ? 'follikel' : 'luteal';
  return { cycleLength, periodLength, lastStart, nextStart, daysUntilNext: daysBetween(today, nextStart), dayOfCycle, phase, basedOnCycles: recent.length };
}
