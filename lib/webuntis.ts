import 'server-only';
import { decrypt } from './crypto';
import { parseIcs, type IcsEvent } from './ics';
import {
  addSuggestion, calendarOfKind, createCalendar, createEvent, eventsBySource, getConnection, listCalendars, markConnectionSync, updateEvent,
} from './repo';
import { formatDateDe, utcToZoned } from './time';
import type { Category, User } from './types';

// WebUntis is connected through the personal iCal subscription that every user can
// activate in WebUntis (Profil → Datenzugriff → "Kalender veröffentlichen").
// It needs no WebUntis password, is offered by Untis itself and only gives read access.

const MAX_BYTES = 5 * 1024 * 1024;

export function isWebUntisHost(host: string): boolean {
  return host === 'webuntis.com' || host.endsWith('.webuntis.com');
}

/** Accepts https:// or webcal:// links to *.webuntis.com and rejects everything else. */
export function normalizeWebUntisUrl(raw: string): URL {
  const trimmed = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('Das ist kein gültiger Link.'); }
  if (url.protocol !== 'https:') throw new Error('Der Link muss mit https:// oder webcal:// beginnen.');
  if (!isWebUntisHost(url.hostname)) throw new Error('Bitte füge den Kalender-Link aus WebUntis ein (Adresse endet auf webuntis.com).');
  if (url.username || url.password || (url.port && url.port !== '443')) throw new Error('Dieser Link wird aus Sicherheitsgründen nicht akzeptiert.');
  if (/#\/basic\/timetable/i.test(raw)) {
    throw new Error('Das ist der Link zur Stundenplan-Ansicht, nicht der Kalender-Link. Öffne in WebUntis „iCal-Abo verwalten“ bzw. Profil → Datenzugriff.');
  }
  return url;
}

/** Fetches a calendar file with redirect, size and timeout limits (SSRF protection). */
export async function fetchCalendar(start: URL, allowHost: (host: string) => boolean): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'text/calendar, text/plain' } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Weiterleitung ohne Ziel.');
      const next = new URL(loc, url);
      if (next.protocol !== 'https:' || !allowHost(next.hostname)) throw new Error('Unerwartete Weiterleitung – Abruf abgebrochen.');
      url = next;
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error('WebUntis verweigert den Zugriff. Ist der Kalender-Link noch aktiv?');
    if (res.status === 404) throw new Error('Kalender nicht gefunden. Erzeuge in WebUntis bitte einen neuen Link.');
    if (!res.ok || !res.body) throw new Error(`Abruf fehlgeschlagen (HTTP ${res.status}).`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Die Kalenderdatei ist zu groß.'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new Error('Zu viele Weiterleitungen.');
}

function teacherFrom(e: IcsEvent): string | null {
  const m = e.description?.match(/(?:Lehrer|Lehrkraft|Teacher)[:\s]+([^\n,]+)/i);
  return m ? m[1].trim() : null;
}

export interface ImportStats { imported: number; updated: number; cancelled: number; removed: number }

/**
 * Upserts events from a calendar feed for one source. Future lessons that are newly cancelled,
 * moved or get a new room create suggestions (only for WebUntis).
 */
export function upsertFeedEvents(
  user: User, source: 'webuntis' | 'ics', connectionId: string | null, events: IcsEvent[], category: Category, now = new Date(),
): ImportStats {
  const tz = user.timezone;
  const nowIso = now.toISOString();
  const keepFrom = new Date(now.getTime() - 14 * 86400000).toISOString();
  const calendarId = source === 'webuntis'
    ? (listCalendars(user.id).find(c => c.kind === 'webuntis')?.id ?? createCalendar(user.id, { name: 'WebUntis', color: '#286B24', kind: 'webuntis', connectionId, writable: false }))
    : calendarOfKind(user.id, 'ics').id;
  const existing = new Map(eventsBySource(user.id, source).filter(e => e.connectionId === connectionId).map(e => [e.externalUid!, e]));
  const seen = new Set<string>();
  const stats: ImportStats = { imported: 0, updated: 0, cancelled: 0, removed: 0 };
  let maxEnd = nowIso;

  for (const ev of events) {
    const startAt = ev.start.toISOString();
    const endAt = (ev.end > ev.start ? ev.end : new Date(ev.start.getTime() + 50 * 60000)).toISOString();
    if (endAt < keepFrom) continue;
    if (endAt > maxEnd) maxEnd = endAt;
    seen.add(ev.uid);
    const status = ev.status === 'CANCELLED' ? 'cancelled' : 'active';
    const fields = {
      title: ev.summary.slice(0, 200), description: ev.description?.slice(0, 2000) ?? null, startAt, endAt, allDay: ev.allDay,
      location: ev.location?.slice(0, 200) ?? null, teacher: teacherFrom(ev), status: status as 'active' | 'cancelled',
    };
    const old = existing.get(ev.uid);
    const when = utcToZoned(startAt, tz);
    const whenText = `${formatDateDe(when.date, { weekday: true })}, ${when.time} Uhr`;

    if (!old) {
      createEvent(user.id, { ...fields, category, source, externalUid: ev.uid, connectionId, calendarId });
      stats.imported++;
      if (status === 'cancelled') stats.cancelled++;
      continue;
    }
    const changed = old.startAt !== startAt || old.endAt !== endAt || old.location !== fields.location || old.status !== status || old.title !== fields.title;
    if (!changed) continue;
    updateEvent(user.id, old.id, fields);
    stats.updated++;
    if (source !== 'webuntis' || startAt < nowIso) continue;
    if (status === 'cancelled' && old.status !== 'cancelled') {
      stats.cancelled++;
      addSuggestion(user.id, 'cancellation',
        `${fields.title} fällt ${whenText} aus. Möchtest du die freie Zeit zum Lernen nutzen?`,
        { action: 'use_free_slot', startAt, endAt, title: fields.title }, `cancel:${ev.uid}:${startAt}`);
    } else if (old.startAt !== startAt || old.endAt !== endAt) {
      addSuggestion(user.id, 'change', `${fields.title} wurde verschoben: jetzt ${whenText}. Ich habe deinen Kalender aktualisiert.`,
        { action: 'info' }, `move:${ev.uid}:${startAt}`);
    } else if (old.location !== fields.location && fields.location) {
      addSuggestion(user.id, 'change', `Raumänderung: ${fields.title} am ${whenText} findet in ${fields.location} statt.`,
        { action: 'info' }, `room:${ev.uid}:${fields.location}`);
    }
  }

  // Lessons that vanished from the feed inside the period it covers count as removed.
  for (const [uid, old] of existing) {
    if (seen.has(uid) || old.startAt < nowIso || old.startAt > maxEnd || old.status === 'cancelled') continue;
    updateEvent(user.id, old.id, { status: 'cancelled' });
    stats.removed++;
  }
  return stats;
}

export async function syncWebUntis(user: User, now = new Date()): Promise<ImportStats> {
  const conn = getConnection(user.id, 'webuntis');
  if (!conn || !conn.secretEnc) throw new Error('WebUntis ist nicht verbunden.');
  try {
    const url = normalizeWebUntisUrl(decrypt(conn.secretEnc));
    const text = await fetchCalendar(url, isWebUntisHost);
    const events = parseIcs(text, user.timezone, new Date(now.getTime() + 120 * 86400000));
    const stats = upsertFeedEvents(user, 'webuntis', conn.id, events, 'schule', now);
    markConnectionSync(conn.id, null);
    return stats;
  } catch (e) {
    markConnectionSync(conn.id, e instanceof Error ? e.message : 'Unbekannter Fehler');
    throw e;
  }
}
