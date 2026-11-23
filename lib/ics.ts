// Minimal iCalendar (RFC 5545) reader/writer – enough for WebUntis feeds,
// exported calendars and CLOQI's own subscription feed.

import { zonedToUtc } from './time.ts';

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  categories: string[];
}

interface Prop { name: string; params: Record<string, string>; value: string }

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n').filter(Boolean);
}

function parseLine(line: string): Prop | null {
  // NAME;PARAM=VAL;PARAM="V:AL":value  – colon inside quotes must not split
  let inQuotes = false;
  let idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) { idx = i; break; }
  }
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...rawParams] = head.split(';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value };
}

export function unescapeText(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseDate(prop: Prop, defaultTz: string): { date: Date; allDay: boolean } {
  const v = prop.value.trim();
  if (prop.params.VALUE === 'DATE' || /^\d{8}$/.test(v)) {
    const d = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    return { date: zonedToUtc(d, '00:00', prop.params.TZID || defaultTz), allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) throw new Error(`Ungültiges Datum: ${v}`);
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))), allDay: false };
  const tz = prop.params.TZID || defaultTz;
  return { date: zonedToUtc(`${y}-${mo}-${d}`, `${h}:${mi}`, tz), allDay: false };
}

function parseDuration(v: string): number {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+(w || 0) * 7 + +(d || 0)) * 86400 + +(h || 0) * 3600 + +(mi || 0) * 60 + +(s || 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

/** Parses VEVENTs. Recurring events (RRULE) are expanded weekly/daily within `expandUntil`. */
export function parseIcs(text: string, defaultTz: string, expandUntil?: Date): IcsEvent[] {
  const lines = unfold(text);
  if (!lines.some(l => l.toUpperCase().startsWith('BEGIN:VCALENDAR'))) throw new Error('Keine gültige Kalenderdatei (VCALENDAR fehlt).');
  const calTz = lines.find(l => l.toUpperCase().startsWith('X-WR-TIMEZONE:'))?.split(':')[1]?.trim() || defaultTz;
  const out: IcsEvent[] = [];
  let cur: Prop[] | null = null;
  let depth = 0;
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') { cur = []; depth = 0; continue; }
    if (!cur) continue;
    if (upper.startsWith('BEGIN:')) { depth++; continue; }
    if (upper.startsWith('END:') && depth > 0) { depth--; continue; }
    if (upper === 'END:VEVENT') {
      out.push(...toEvents(cur, calTz, expandUntil));
      cur = null;
      continue;
    }
    if (depth === 0) {
      const p = parseLine(line);
      if (p) cur.push(p);
    }
  }
  return out;
}

function toEvents(props: Prop[], tz: string, expandUntil?: Date): IcsEvent[] {
  const get = (n: string) => props.find(p => p.name === n);
  const dtstart = get('DTSTART');
  if (!dtstart) return [];
  const start = parseDate(dtstart, tz);
  const dtend = get('DTEND');
  const duration = get('DURATION');
  let end: Date;
  if (dtend) end = parseDate(dtend, tz).date;
  else if (duration) end = new Date(start.date.getTime() + parseDuration(duration.value));
  else end = new Date(start.date.getTime() + (start.allDay ? 86400000 : 0));
  const statusRaw = (get('STATUS')?.value || 'CONFIRMED').toUpperCase();
  const base: IcsEvent = {
    uid: get('UID')?.value || `${start.date.toISOString()}-${get('SUMMARY')?.value || ''}`,
    summary: unescapeText(get('SUMMARY')?.value || 'Termin'),
    description: get('DESCRIPTION') ? unescapeText(get('DESCRIPTION')!.value) : null,
    location: get('LOCATION') ? unescapeText(get('LOCATION')!.value) : null,
    start: start.date,
    end,
    allDay: start.allDay,
    status: statusRaw === 'CANCELLED' ? 'CANCELLED' : statusRaw === 'TENTATIVE' ? 'TENTATIVE' : 'CONFIRMED',
    categories: (get('CATEGORIES')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
  };
  const rrule = get('RRULE')?.value;
  if (!rrule || !expandUntil) return [base];

  const rule = Object.fromEntries(rrule.split(';').map(kv => kv.split('=')));
  const step = rule.FREQ === 'DAILY' ? 1 : rule.FREQ === 'WEEKLY' ? 7 * Number(rule.INTERVAL || 1) : 0;
  if (!step) return [base];
  const until = rule.UNTIL ? parseDate({ name: 'UNTIL', params: {}, value: rule.UNTIL }, tz).date : expandUntil;
  const limit = Math.min(until.getTime(), expandUntil.getTime());
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const exdates = new Set(props.filter(p => p.name === 'EXDATE').flatMap(p =>
    p.value.split(',').map(v => parseDate({ ...p, value: v }, tz).date.getTime())));
  const durMs = end.getTime() - start.date.getTime();
  const res: IcsEvent[] = [];
  for (let i = 0, t = start.date.getTime(); t <= limit && i < count && res.length < 1000; i++, t += step * 86400000) {
    // keep wall-clock time stable across DST by re-anchoring in the zone
    const occ = i === 0 ? start.date : shiftDays(start.date, i * step, tz);
    if (occ.getTime() > limit) break;
    if (exdates.has(occ.getTime())) continue;
    res.push({ ...base, uid: i === 0 ? base.uid : `${base.uid}#${occ.toISOString()}`, start: occ, end: new Date(occ.getTime() + durMs) });
  }
  return res;
}

function shiftDays(d: Date, days: number, tz: string): Date {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).reduce<Record<string, string>>((a, p) => (a[p.type] = p.value, a), {});
  const date = new Date(Date.UTC(+local.year, +local.month - 1, +local.day + days)).toISOString().slice(0, 10);
  return zonedToUtc(date, `${local.hour}:${local.minute}`, tz);
}

// ---------- writer ----------

export function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; }
    cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export interface FeedEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  category?: string;
  status?: 'CONFIRMED' | 'CANCELLED';
  updatedAt?: Date;
}

export function buildIcs(name: string, events: FeedEvent[]): string {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CLOQI//Kalender//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`, 'X-PUBLISHED-TTL:PT30M', 'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(e.updatedAt ?? now)}`);
    if (e.allDay) {
      const d = (x: Date) => x.toISOString().slice(0, 10).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${d(e.end)}`);
    } else {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.category) lines.push(`CATEGORIES:${escapeText(e.category)}`);
    if (e.status) lines.push(`STATUS:${e.status}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
