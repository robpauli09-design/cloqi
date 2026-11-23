import 'server-only';
import type { IcsEvent } from './ics';
import { addDays, zonedToUtc } from './time';

// Reads the *public* WebUntis timetable – the one anyone can open with the normal link
// (…webuntis.com/WebUntis?school=X#/basic/timetablePublic/…) without logging in.
// Most schools publish class timetables this way; personal student timetables are usually
// not public, so the student picks their class and can hide courses they don't attend.

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT = 15000;

export interface PublicTarget { host: string; school: string; entityId: number | null }
export interface UntisClass { id: number; name: string; longName: string }
export interface UntisGroup { name: string; subject: string; parallel: boolean }

/** Recognises the normal WebUntis view link. Returns null for anything else (e.g. iCal links). */
export function parsePublicLink(raw: string): PublicTarget | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !(host === 'webuntis.com' || host.endsWith('.webuntis.com'))) return null;
  if (url.username || url.password || (url.port && url.port !== '443')) return null;
  if (/ical\.do/i.test(url.pathname + url.search)) return null;
  const school = url.searchParams.get('school') ?? new URLSearchParams(url.hash.split('?')[1] ?? '').get('school');
  if (!school || !/^[\w .+-]{1,80}$/.test(school)) return null;
  const entity = new URLSearchParams(url.hash.split('?')[1] ?? '').get('entityId');
  return { host, school, entityId: entity && /^\d{1,9}$/.test(entity) ? Number(entity) : null };
}

/** Untis sometimes sends UTF-8 text that was decoded as Latin-1 ("fÃ¼r" → "für"). */
const fixText = (s: unknown) => {
  const t = typeof s === 'string' ? s : '';
  return /Ã.|Â./.test(t) ? Buffer.from(t, 'latin1').toString('utf8') : t;
};

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Antwort von WebUntis ist zu groß.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Anonymous WebUntis session (cookies only – no account, no password). */
class Session {
  private cookies = '';
  private t: PublicTarget;
  constructor(t: PublicTarget) { this.t = t; }

  private base() { return `https://${this.t.host}/WebUntis`; }

  async open() {
    const res = await fetch(`${this.base()}/?school=${encodeURIComponent(this.t.school)}`, {
      redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT),
    });
    await res.body?.cancel();
    const jar = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => /^[\w-]+=/.test(c));
    if (!jar.some(c => c.startsWith('schoolname='))) jar.push(`schoolname="_${Buffer.from(this.t.school).toString('base64')}"`);
    this.cookies = jar.join('; ');
    return this;
  }

  async json<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base()}${path}`, {
      redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT),
      headers: { Accept: 'application/json', Cookie: this.cookies },
    });
    if (res.status === 403 || res.status === 401) {
      await res.body?.cancel();
      throw new ForbiddenError('Dieser Stundenplan ist bei deiner Schule nicht öffentlich freigegeben.');
    }
    if (!res.ok) { await res.body?.cancel(); throw new Error(`WebUntis antwortet nicht (HTTP ${res.status}).`); }
    const text = await readLimited(res);
    try { return JSON.parse(text) as T; } catch { throw new Error('Unerwartete Antwort von WebUntis.'); }
  }
}

export class ForbiddenError extends Error {}

interface PageConfig { data?: { elements?: { id: number; name: string; longName?: string }[] } }

/** Classes whose timetable the school publishes. Throws ForbiddenError if none are public. */
export async function listPublicClasses(t: PublicTarget): Promise<UntisClass[]> {
  const s = await new Session(t).open();
  const pc = await s.json<PageConfig>('/api/public/timetable/weekly/pageconfig?type=1');
  return (pc.data?.elements ?? [])
    .map(e => ({ id: Number(e.id), name: fixText(e.name), longName: fixText(e.longName ?? '') }))
    .filter(e => Number.isFinite(e.id) && e.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
}

/** True if the personal student timetable from the link is publicly readable. */
export async function studentIsPublic(t: PublicTarget, today: string): Promise<boolean> {
  if (!t.entityId) return false;
  try {
    const s = await new Session(t).open();
    await s.json(`/api/public/timetable/weekly/data?elementType=5&elementId=${t.entityId}&date=${today}&formatId=1`);
    return true;
  } catch (e) {
    if (e instanceof ForbiddenError) return false;
    throw e;
  }
}

interface Period {
  id: number; lessonId: number; date: number; startTime: number; endTime: number;
  lessonText?: string; periodText?: string; substText?: string; studentGroup?: string; cellState?: string;
  is?: { cancelled?: boolean; event?: boolean; exam?: boolean };
  elements: { type: number; id: number; orgId?: number }[];
}
interface WeekData {
  data?: { result?: { data?: { elementPeriods?: Record<string, Period[]>; elements?: { type: number; id: number; name?: string; longName?: string }[] } } };
}

const hhmm = (n: number) => `${String(Math.floor(n / 100)).padStart(2, '0')}:${String(n % 100).padStart(2, '0')}`;
const ymd = (n: number) => { const s = String(n); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; };

export interface PublicTimetable { events: (IcsEvent & { group: string | null })[]; groups: UntisGroup[] }

/**
 * Loads `weeks` weeks of a public timetable (elementType 1 = class, 5 = student) and converts
 * every period into a calendar event. Parallel courses (e.g. religion/ethics, language groups)
 * are reported in `groups` so the user can pick the ones they attend.
 */
export async function fetchPublicTimetable(t: PublicTarget, elementType: 1 | 5, elementId: number, tz: string, today: string, weeks = 5): Promise<PublicTimetable> {
  const s = await new Session(t).open();
  const events: PublicTimetable['events'] = [];
  const groupSubject = new Map<string, string>();
  const parallel = new Set<string>();

  for (let w = 0; w < weeks; w++) {
    const date = addDays(today, w * 7);
    const res = await s.json<WeekData>(`/api/public/timetable/weekly/data?elementType=${elementType}&elementId=${elementId}&date=${date}&formatId=1`);
    const data = res.data?.result?.data;
    const periods = data?.elementPeriods?.[String(elementId)] ?? [];
    const els = new Map((data?.elements ?? []).map(e => [`${e.type}:${e.id}`, e]));
    const names = (p: Period, type: number) => p.elements.filter(e => e.type === type)
      .map(e => fixText(els.get(`${type}:${e.id}`)?.name ?? '')).filter(Boolean);

    const weekEvents: PublicTimetable['events'] = [];
    for (const p of periods) {
      const day = ymd(p.date);
      const subject = names(p, 3).join(', ');
      const teachers = names(p, 2).join(', ');
      const rooms = names(p, 4).join(', ');
      const group = p.studentGroup ? fixText(p.studentGroup).slice(0, 60) : null;
      const title = subject || fixText(p.lessonText) || fixText(p.substText) || (p.is?.event ? 'Schulveranstaltung' : 'Unterricht');
      const info = [fixText(p.lessonText), fixText(p.periodText), fixText(p.substText)].filter(Boolean).join(' · ');
      if (group) groupSubject.set(group, subject || title);
      weekEvents.push({
        uid: `untis-${p.id}`,
        summary: title.slice(0, 200),
        description: [teachers && `Lehrer: ${teachers}`, group && `Gruppe: ${group}`, info].filter(Boolean).join('\n') || null,
        location: rooms || null,
        start: zonedToUtc(day, hhmm(p.startTime), tz),
        end: zonedToUtc(day, hhmm(p.endTime), tz),
        allDay: false,
        status: p.is?.cancelled || p.cellState === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED',
        categories: p.is?.exam || p.cellState === 'EXAM' ? ['EXAM'] : [],
        group,
      });
    }
    // two different groups at the same time → the student only attends one of them
    for (const a of weekEvents) {
      if (!a.group) continue;
      for (const b of weekEvents) {
        if (b === a || !b.group || b.group === a.group) continue;
        if (a.start < b.end && b.start < a.end) { parallel.add(a.group); break; }
      }
    }
    events.push(...weekEvents);
  }
  // religion/ethics are always a choice, even when the alternatives are at different times
  const RELIGION = /^(RK|REV|RE|RISL|RGOR|ROR|RAK|RALT|RJ|RBUD|RNAK|RFK|ETH|ETHIK)(\d|_|$)/i;
  const groups = [...groupSubject].map(([name, subject]) => ({ name, subject, parallel: parallel.has(name) || RELIGION.test(subject) }))
    .sort((a, b) => a.subject.localeCompare(b.subject, 'de') || a.name.localeCompare(b.name, 'de'));
  return { events, groups };
}
