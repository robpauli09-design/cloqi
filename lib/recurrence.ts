// Expands repeating events into concrete occurrences in the user's time zone.
// Wall-clock time stays stable across daylight-saving changes.

import { addDays, daysBetween, pad, utcToZoned, weekdayOf, zonedToUtc } from './time.ts';

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  freq: Freq;
  interval: number;          // every n days/weeks/months/years (biweekly = weekly + 2)
  until: string | null;      // last allowed date (YYYY-MM-DD, inclusive)
  exdates: string[];         // skipped occurrence dates (YYYY-MM-DD)
  weekdays?: number[] | null; // weekly only: on these days (1 = Mo … 7 = So), e.g. training Mo + Mi
}

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export interface Occurrence { date: string; startAt: string; endAt: string }

export const RECURRENCE_PRESETS: { value: string; label: string; rule: Pick<RecurrenceRule, 'freq' | 'interval'> | null }[] = [
  { value: 'none', label: 'Einmalig', rule: null },
  { value: 'daily', label: 'Täglich', rule: { freq: 'daily', interval: 1 } },
  { value: 'weekly', label: 'Wöchentlich', rule: { freq: 'weekly', interval: 1 } },
  { value: 'biweekly', label: 'Alle zwei Wochen', rule: { freq: 'weekly', interval: 2 } },
  { value: 'monthly', label: 'Monatlich', rule: { freq: 'monthly', interval: 1 } },
  { value: 'yearly', label: 'Jährlich', rule: { freq: 'yearly', interval: 1 } },
  { value: 'custom', label: 'Benutzerdefiniert', rule: null },
];

export function describeRule(rule: (Pick<RecurrenceRule, 'freq' | 'interval'> & { weekdays?: number[] | null }) | null): string {
  if (!rule) return 'Einmalig';
  const n = rule.interval;
  if (rule.freq === 'weekly' && rule.weekdays?.length) {
    const days = [...rule.weekdays].sort().map(d => WEEKDAY_SHORT[d - 1]).join(', ');
    return n === 1 ? `Jede Woche: ${days}` : n === 2 ? `Alle zwei Wochen: ${days}` : `Alle ${n} Wochen: ${days}`;
  }
  const unit: Record<Freq, [string, string]> = { daily: ['Tag', 'Tage'], weekly: ['Woche', 'Wochen'], monthly: ['Monat', 'Monate'], yearly: ['Jahr', 'Jahre'] };
  if (n === 1) return { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich', yearly: 'Jährlich' }[rule.freq];
  if (n === 2 && rule.freq === 'weekly') return 'Alle zwei Wochen';
  return `Alle ${n} ${unit[rule.freq][1]}`;
}

function daysInMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** n-th candidate date of the series, or null if that month/year has no such day (e.g. 31 Feb). */
function nthDate(first: string, rule: RecurrenceRule, n: number): string | null {
  if (rule.freq === 'daily') return addDays(first, n * rule.interval);
  if (rule.freq === 'weekly') return addDays(first, n * rule.interval * 7);
  const [y, m, d] = first.split('-').map(Number);
  const months = rule.freq === 'monthly' ? n * rule.interval : n * rule.interval * 12;
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm = (total % 12) + 1;
  if (d > daysInMonth(ny, nm)) return null;
  return `${ny}-${pad(nm)}-${pad(d)}`;
}

/** Occurrences overlapping [fromIso, toIso). */
export function expandOccurrences(startAt: string, endAt: string, rule: RecurrenceRule, fromIso: string, toIso: string, tz: string): Occurrence[] {
  const first = utcToZoned(startAt, tz);
  const duration = Date.parse(endAt) - Date.parse(startAt);
  const exdates = new Set(rule.exdates);
  const out: Occurrence[] = [];
  const fromDay = utcToZoned(new Date(Date.parse(fromIso) - duration), tz).date;

  // weekly on several weekdays: walk week by week from the Monday of the first week
  const days = rule.freq === 'weekly' && rule.weekdays?.length ? [...new Set(rule.weekdays)].filter(d => d >= 1 && d <= 7).sort((a, b) => a - b) : null;
  if (days) {
    const monday = addDays(first.date, 1 - weekdayOf(first.date));
    const step = rule.interval * 7;
    let k = Math.max(0, Math.floor(daysBetween(monday, fromDay) / step) - 1);
    for (let guard = 0; guard < 2000; guard++, k++) {
      let past = false;
      for (const d of days) {
        const date = addDays(monday, k * step + d - 1);
        if (date < first.date) continue;
        if (rule.until && date > rule.until) { past = true; break; }
        const s = zonedToUtc(date, first.time, tz);
        const startIso = s.toISOString();
        if (startIso >= toIso) { past = true; break; }
        const endIso = new Date(s.getTime() + duration).toISOString();
        if (endIso > fromIso && !exdates.has(date)) out.push({ date, startAt: startIso, endAt: endIso });
      }
      if (past) break;
    }
    return out;
  }

  // Jump close to the window instead of iterating from the very first occurrence.
  let n = 0;
  if (rule.freq === 'daily' || rule.freq === 'weekly') {
    const step = rule.freq === 'daily' ? rule.interval : rule.interval * 7;
    n = Math.max(0, Math.floor(daysBetween(first.date, fromDay) / step) - 1);
  }
  for (let guard = 0; guard < 2000; guard++, n++) {
    const date = nthDate(first.date, rule, n);
    if (date === null) continue;
    if (rule.until && date > rule.until) break;
    const s = zonedToUtc(date, first.time, tz);
    const startIso = s.toISOString();
    if (startIso >= toIso) break;
    const endIso = new Date(s.getTime() + duration).toISOString();
    if (endIso > fromIso && !exdates.has(date)) out.push({ date, startAt: startIso, endAt: endIso });
  }
  return out;
}
