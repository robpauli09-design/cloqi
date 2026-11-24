// Time-zone aware helpers without external libraries.
// Convention: instants are stored as UTC ISO strings; calendar days as "YYYY-MM-DD"
// and wall-clock times as "HH:MM" in the user's time zone.

export const DEFAULT_TZ = 'Europe/Vienna';

export const WEEKDAYS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_SHORT_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS_DE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

interface Parts { y: number; m: number; d: number; h: number; mi: number; s: number }
function partsIn(date: Date, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year, m: out.month, d: out.day, h: out.hour === 24 ? 0 : out.hour, mi: out.minute, s: out.second };
}

/** Offset of `tz` from UTC at the given instant, in minutes (Vienna winter: +60). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Wall-clock time in `tz` → UTC instant. */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi || 0);
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(result), tz);
  if (off2 !== off1) result = guess - off2 * 60000;
  return new Date(result);
}

export interface ZonedParts { date: string; time: string; minutes: number; weekday: number }

/** UTC instant → wall-clock parts in `tz`. weekday: 1 = Monday … 7 = Sunday. */
export function utcToZoned(input: Date | string, tz: string): ZonedParts {
  const date = typeof input === 'string' ? new Date(input) : input;
  const p = partsIn(date, tz);
  const dateStr = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  return { date: dateStr, time: `${pad(p.h)}:${pad(p.mi)}`, minutes: p.h * 60 + p.mi, weekday: weekdayOf(dateStr) };
}

export function pad(n: number): string { return String(n).padStart(2, '0'); }

export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday */
export function weekdayOf(dateStr: string): number {
  const js = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return js === 0 ? 7 : js;
}

export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, 1 - weekdayOf(dateStr));
}

export function startOfMonth(dateStr: string): string { return `${dateStr.slice(0, 7)}-01`; }

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function todayIn(tz: string, now: Date = new Date()): string { return utcToZoned(now, tz).date; }

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function formatDateDe(dateStr: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = opts.weekday ? `${WEEKDAYS_DE[weekdayOf(dateStr) - 1]}, ` : '';
  return `${wd}${d}. ${MONTHS_DE[m - 1]}${opts.year ? ` ${y}` : ''}`;
}

export function relativeDayDe(dateStr: string, today: string): string {
  const diff = daysBetween(today, dateStr);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === 2) return 'Übermorgen';
  if (diff === -1) return 'Gestern';
  if (diff > 2 && diff < 7) return WEEKDAYS_DE[weekdayOf(dateStr) - 1];
  return formatDateDe(dateStr);
}

/** ISO calendar week ("KW") of a YYYY-MM-DD day. */
export function isoWeek(day: string): number {
  const d = new Date(`${day}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;            // Mo = 0
  d.setUTCDate(d.getUTCDate() - wd + 3);         // Thursday of this week decides the year
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
