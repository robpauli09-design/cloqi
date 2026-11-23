import 'server-only';
import { decrypt, encrypt, sha256 } from './crypto';
import { getCalendarItems } from './calendar';
import {
  addSuggestion, calendarsForConnection, createCalendar, createEvent, deleteCalendar, deleteEvent, eventsByConnection,
  getBlock, getConnection, getEvent, getSyncMap, markConnectionSync, removeSyncMap, setSyncMap, updateBlock, updateEvent,
  upsertConnection, type SyncEntry,
} from './repo';
import type { CalendarEvent, CalendarItem, Category, ConnectionConfig, User } from './types';

// Google Calendar API and Microsoft Graph via fetch (no SDKs). Tokens are stored encrypted
// (AES-256-GCM) and never reach the browser.

export type OAuthProvider = 'google' | 'outlook';
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google Kalender', outlook: 'Outlook' };

export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

interface ProviderConfig { clientId?: string; clientSecret?: string; authUrl: string; tokenUrl: string; scope: string; extra: Record<string, string> }

function config(p: OAuthProvider): ProviderConfig {
  if (p === 'google') {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    };
  }
  const tenant = process.env.MICROSOFT_TENANT || 'common';
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID, clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scope: 'offline_access Calendars.ReadWrite', extra: { response_mode: 'query' },
  };
}

export function isConfigured(p: OAuthProvider): boolean {
  const c = config(p);
  return Boolean(c.clientId && c.clientSecret);
}

const redirectUri = (p: OAuthProvider) => `${appUrl()}/api/integrations/${p}/callback`;

export function authorizationUrl(p: OAuthProvider, state: string): string {
  const c = config(p);
  const params = new URLSearchParams({ client_id: c.clientId!, redirect_uri: redirectUri(p), response_type: 'code', scope: c.scope, state, ...c.extra });
  return `${c.authUrl}?${params}`;
}

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number }

class ExpiredError extends Error {}

async function tokenRequest(p: OAuthProvider, body: Record<string, string>): Promise<TokenResponse> {
  const c = config(p);
  const res = await fetch(c.tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: c.clientId!, client_secret: c.clientSecret!, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    if (body.grant_type === 'refresh_token') throw new ExpiredError('Die Verbindung ist abgelaufen. Bitte neu verbinden.');
    throw new Error(`Anmeldung bei ${PROVIDER_LABEL[p]} fehlgeschlagen.`);
  }
  return data as TokenResponse;
}

export async function finishOAuth(user: User, p: OAuthProvider, code: string) {
  const t = await tokenRequest(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(p) });
  await upsertConnection(user.id, p, {
    status: 'connected', accessTokenEnc: encrypt(t.access_token), refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    tokenExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
  });
  const calendars = await listRemoteCalendars(user, p);
  const primary = calendars.find(c => c.primary) ?? calendars[0];
  await upsertConnection(user.id, p, {
    config: {
      availableCalendars: calendars,
      importCalendarIds: primary ? [primary.id] : [],
      exportCalendarId: primary?.writable ? primary.id : calendars.find(c => c.writable)?.id,
      exportCategories: ['lernen', 'pruefung', 'hausuebung', 'privat', 'freizeit', 'training', 'arbeit'],
    },
  });
}

async function accessToken(user: User, p: OAuthProvider): Promise<string> {
  const conn = await getConnection(user.id, p);
  if (!conn?.accessTokenEnc) throw new Error('Nicht verbunden.');
  if (conn.tokenExpiresAt && conn.tokenExpiresAt > new Date().toISOString()) return decrypt(conn.accessTokenEnc);
  if (!conn.refreshTokenEnc) throw new ExpiredError('Die Verbindung ist abgelaufen. Bitte neu verbinden.');
  const t = await tokenRequest(p, { grant_type: 'refresh_token', refresh_token: decrypt(conn.refreshTokenEnc), ...(p === 'outlook' ? { scope: config(p).scope } : {}) });
  await upsertConnection(user.id, p, {
    accessTokenEnc: encrypt(t.access_token), ...(t.refresh_token ? { refreshTokenEnc: encrypt(t.refresh_token) } : {}),
    tokenExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
  });
  return t.access_token;
}

/** Best effort: ask Google to revoke our token when the user disconnects. */
export async function revokeAccess(user: User, p: OAuthProvider) {
  const conn = await getConnection(user.id, p);
  if (p !== 'google' || !conn?.refreshTokenEnc) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(conn.refreshTokenEnc))}`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => undefined);
}

// ---------- provider API ----------

async function api(user: User, p: OAuthProvider, method: string, url: string, body?: unknown): Promise<unknown> {
  const token = await accessToken(user, p);
  const res = await fetch(url, {
    method, signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(p === 'outlook' ? { Prefer: 'outlook.timezone="UTC"' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 || res.status === 410) return null;
  if (res.status === 401) throw new ExpiredError('Die Verbindung ist abgelaufen. Bitte neu verbinden.');
  if (!res.ok) throw new Error(`${PROVIDER_LABEL[p]} antwortet mit Fehler ${res.status}.`);
  return res.status === 204 ? null : res.json();
}

const G = 'https://www.googleapis.com/calendar/v3';
const M = 'https://graph.microsoft.com/v1.0/me';
const enc = encodeURIComponent;

interface RemoteCalendar { id: string; name: string; writable: boolean; primary?: boolean; color?: string }
interface RemoteEvent { id: string; calendarId: string; title: string; start: string; end: string; allDay: boolean; location: string | null; description: string | null; version: string; cancelled: boolean }

export async function listRemoteCalendars(user: User, p: OAuthProvider): Promise<RemoteCalendar[]> {
  if (p === 'google') {
    const data = await api(user, p, 'GET', `${G}/users/me/calendarList?minAccessRole=reader`) as { items?: Record<string, any>[] };
    return (data?.items ?? []).map(c => ({
      id: c.id, name: c.summaryOverride || c.summary, primary: Boolean(c.primary), color: c.backgroundColor,
      writable: c.accessRole === 'owner' || c.accessRole === 'writer',
    }));
  }
  const data = await api(user, p, 'GET', `${M}/calendars?$top=50`) as { value?: Record<string, any>[] };
  return (data?.value ?? []).map(c => ({ id: c.id, name: c.name, primary: Boolean(c.isDefaultCalendar), writable: Boolean(c.canEdit), color: c.hexColor || undefined }));
}

async function listRemoteEvents(user: User, p: OAuthProvider, calendarId: string, from: string, to: string): Promise<RemoteEvent[]> {
  const out: RemoteEvent[] = [];
  if (p === 'google') {
    let pageToken = '';
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', maxResults: '250', showDeleted: 'false', ...(pageToken ? { pageToken } : {}) });
      const data = await api(user, p, 'GET', `${G}/calendars/${enc(calendarId)}/events?${q}`) as { items?: Record<string, any>[]; nextPageToken?: string };
      for (const e of data?.items ?? []) {
        const allDay = Boolean(e.start?.date);
        out.push({
          id: e.id, calendarId, title: e.summary || 'Termin', allDay, location: e.location ?? null, description: e.description ?? null,
          version: e.etag || e.updated, cancelled: e.status === 'cancelled',
          start: allDay ? new Date(`${e.start.date}T00:00:00Z`).toISOString() : new Date(e.start.dateTime).toISOString(),
          end: allDay ? new Date(`${e.end.date}T00:00:00Z`).toISOString() : new Date(e.end.dateTime).toISOString(),
        });
      }
      if (!data?.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    return out;
  }
  let next: string | null = `${M}/calendars/${enc(calendarId)}/calendarView?${new URLSearchParams({ startDateTime: from, endDateTime: to, $top: '200' })}`;
  for (let i = 0; next && i < 20; i++) {
    const data = await api(user, p, 'GET', next) as { value?: Record<string, any>[]; '@odata.nextLink'?: string };
    for (const e of data?.value ?? []) {
      out.push({
        id: e.id, calendarId, title: e.subject || 'Termin', allDay: Boolean(e.isAllDay), location: e.location?.displayName || null,
        description: e.bodyPreview || null, version: e.changeKey || e.lastModifiedDateTime, cancelled: Boolean(e.isCancelled),
        start: new Date(`${String(e.start.dateTime).replace(/Z?$/, 'Z')}`).toISOString(), end: new Date(`${String(e.end.dateTime).replace(/Z?$/, 'Z')}`).toISOString(),
      });
    }
    next = data?.['@odata.nextLink'] ?? null;
  }
  return out;
}

interface Writable { title: string; startAt: string; endAt: string; allDay: boolean; location: string | null; description: string | null }

function body(p: OAuthProvider, w: Writable, markCloqi: boolean) {
  const text = [w.description, markCloqi ? 'Erstellt von CLOQI' : null].filter(Boolean).join('\n\n');
  if (p === 'google') {
    const day = (iso: string) => iso.slice(0, 10);
    return {
      summary: w.title, description: text || undefined, location: w.location ?? undefined,
      start: w.allDay ? { date: day(w.startAt) } : { dateTime: w.startAt },
      end: w.allDay ? { date: day(new Date(Date.parse(w.endAt) + 60000).toISOString()) } : { dateTime: w.endAt },
    };
  }
  const t = (iso: string) => ({ dateTime: iso.replace(/Z$/, ''), timeZone: 'UTC' });
  return { subject: w.title, body: { contentType: 'text', content: text }, location: w.location ? { displayName: w.location } : undefined, isAllDay: w.allDay, start: t(w.startAt), end: t(w.endAt) };
}

async function createRemote(user: User, p: OAuthProvider, calendarId: string, w: Writable, markCloqi = true): Promise<string> {
  const url = p === 'google' ? `${G}/calendars/${enc(calendarId)}/events` : `${M}/calendars/${enc(calendarId)}/events`;
  const res = await api(user, p, 'POST', url, body(p, w, markCloqi)) as { id: string };
  return res.id;
}
async function updateRemote(user: User, p: OAuthProvider, calendarId: string, id: string, w: Writable, markCloqi = true): Promise<boolean> {
  const url = p === 'google' ? `${G}/calendars/${enc(calendarId)}/events/${enc(id)}` : `${M}/events/${enc(id)}`;
  return (await api(user, p, p === 'google' ? 'PUT' : 'PATCH', url, body(p, w, markCloqi))) !== null;
}
export async function deleteRemote(user: User, p: OAuthProvider, calendarId: string, id: string) {
  const url = p === 'google' ? `${G}/calendars/${enc(calendarId)}/events/${enc(id)}` : `${M}/events/${enc(id)}`;
  await api(user, p, 'DELETE', url);
}

// ---------- sync engine ----------

/** Hash over the fields both sides can represent – used to see which side changed. */
const fieldHash = (w: { title: string; startAt: string; endAt: string; location: string | null }) =>
  sha256([w.title, w.startAt, w.endAt, w.location ?? ''].join('|'));
const remoteHash = (r: RemoteEvent) => fieldHash({ title: r.title, startAt: r.start, endAt: r.end, location: r.location });
const externalUid = (calendarId: string, id: string) => `${calendarId}::${id}`;
export const splitExternalUid = (uid: string) => { const i = uid.lastIndexOf('::'); return { calendarId: uid.slice(0, i), id: uid.slice(i + 2) }; };

export interface SyncStats { pushed: number; pulled: number; deleted: number; conflicts: number }

/** Keeps the CLOQI calendars for the selected remote calendars in line with the connection config. */
async function syncCalendarList(user: User, connId: string, p: OAuthProvider, cfg: ConnectionConfig) {
  const wanted = new Set(cfg.importCalendarIds ?? []);
  const existing = await calendarsForConnection(user.id, connId);
  for (const c of existing) if (!wanted.has(c.externalId ?? '')) await deleteCalendar(user.id, c.id);
  for (const rc of cfg.availableCalendars ?? []) {
    if (!wanted.has(rc.id) || existing.some(c => c.externalId === rc.id)) continue;
    await createCalendar(user.id, { name: `${rc.name}`, color: p === 'google' ? '#3B82F6' : '#2F6FDB', kind: p, connectionId: connId, externalId: rc.id, writable: rc.writable });
  }
  return await calendarsForConnection(user.id, connId);
}

/**
 * Two-way synchronisation with Google or Outlook.
 * 1. Pull: imported remote calendars → CLOQI events (with external ids). Remote edits update CLOQI unless the
 *    event was edited in CLOQI too – then it is flagged as conflict and the user decides.
 * 2. Push local edits of imported events back to the provider.
 * 3. Export CLOQI's own items (chosen categories) into the export calendar; remote edits of those come back.
 * No silent overwrites, no duplicates (stable external ids + sync_map).
 */
export async function syncProvider(user: User, p: OAuthProvider, now = new Date()): Promise<SyncStats> {
  const conn = await getConnection(user.id, p);
  if (!conn) throw new Error('Nicht verbunden.');
  const stats: SyncStats = { pushed: 0, pulled: 0, deleted: 0, conflicts: 0 };
  const from = new Date(now.getTime() - 7 * 86400000).toISOString();
  const to = new Date(now.getTime() + 90 * 86400000).toISOString();
  try {
    const cfg = conn.config;
    const calendars = await syncCalendarList(user, conn.id, p, cfg);
    const map = await getSyncMap(conn.id);
    const ourExternalIds = new Map<string, [string, SyncEntry]>([...map].map(([k, v]) => [v.externalId, [k, v]]));
    const remoteById = new Map<string, RemoteEvent>();

    // ---- 1 + 2: imported calendars
    const connEvents = await eventsByConnection(user.id, conn.id);
    // events created in CLOQI inside a connected calendar → create them remotely first
    for (const e of connEvents.filter(x => !x.externalUid && x.syncState === 'dirty')) {
      const cal = calendars.find(c => c.id === e.calendarId);
      if (!cal?.writable || !cal.externalId) continue;
      const remoteId = await createRemote(user, p, cal.externalId, e, false);
      await updateEvent(user.id, e.id, { externalUid: externalUid(cal.externalId, remoteId), syncState: 'clean', remoteVersion: null });
      e.externalUid = externalUid(cal.externalId, remoteId);
      e.syncState = 'clean';
      stats.pushed++;
    }
    const localImported = new Map(connEvents.filter(e => e.externalUid).map(e => [e.externalUid!, e]));
    for (const cal of calendars) {
      const remote = await listRemoteEvents(user, p, cal.externalId!, from, to);
      const seen = new Set<string>();
      for (const r of remote) {
        remoteById.set(r.id, r);
        if (ourExternalIds.has(r.id) || r.cancelled) continue; // exported by CLOQI – handled in step 3
        const uid = externalUid(cal.externalId!, r.id);
        seen.add(uid);
        const local = localImported.get(uid);
        const fields = { title: r.title.slice(0, 200), startAt: r.start, endAt: r.end, allDay: r.allDay, location: r.location, description: r.description?.slice(0, 2000) ?? null };
        if (!local) {
          await createEvent(user.id, { ...fields, category: 'privat', source: p, externalUid: uid, connectionId: conn.id, calendarId: cal.id, remoteVersion: r.version });
          stats.pulled++;
          continue;
        }
        const remoteChanged = local.remoteVersion !== r.version;
        if (local.syncState === 'dirty' && remoteChanged) {
          await updateEvent(user.id, local.id, { syncState: 'conflict' });
          await addSuggestion(user.id, 'sync_conflict',
            `„${local.title}“ wurde in CLOQI und in ${PROVIDER_LABEL[p]} geändert. Welche Version soll gelten?`,
            { action: 'resolve_conflict', eventId: local.id, provider: p, remote: fields, remoteVersion: r.version }, `conflict:${local.id}:${r.version}`);
          stats.conflicts++;
        } else if (local.syncState === 'dirty' && cal.writable) {
          await updateRemote(user, p, cal.externalId!, r.id, local, false);
          const fresh = (await listRemoteEvents(user, p, cal.externalId!, local.startAt, local.endAt)).find(x => x.id === r.id);
          await updateEvent(user.id, local.id, { syncState: 'clean', remoteVersion: fresh?.version ?? r.version });
          stats.pushed++;
        } else if (remoteChanged && local.syncState === 'clean') {
          await updateEvent(user.id, local.id, { ...fields, remoteVersion: r.version });
          stats.pulled++;
        }
      }
      // deleted remotely (inside the window) → delete locally unless the user changed it meanwhile
      for (const [uid, local] of localImported) {
        if (!uid.startsWith(`${cal.externalId}::`) || seen.has(uid) || local.startAt < from || local.startAt >= to) continue;
        if (local.syncState === 'clean') { await deleteEvent(user.id, local.id); stats.deleted++; }
      }
    }

    // ---- 3: export CLOQI items
    const exportCal = cfg.exportCalendarId;
    if (exportCal) {
      if (!remoteById.size || !calendars.some(c => c.externalId === exportCal)) {
        for (const r of await listRemoteEvents(user, p, exportCal, from, to)) remoteById.set(r.id, r);
      }
      const categories = new Set<Category>(cfg.exportCategories ?? []);
      const items = (await getCalendarItems(user, from, to, { includeHidden: true })).filter(i =>
        categories.has(i.category) && i.source !== p && !['webuntis', 'ics', 'google', 'outlook'].includes(i.source) && i.kind !== 'lesson'
        && i.status !== 'cancelled' && i.status !== 'missed');
      const current = new Set<string>();
      for (const item of items) {
        current.add(item.key);
        const w: Writable = { title: item.title, startAt: item.startAt, endAt: item.endAt, allDay: item.allDay, location: item.location, description: item.description };
        const localHash = fieldHash(w);
        const known = map.get(item.key);
        if (!known) {
          const id = await createRemote(user, p, exportCal, w);
          await setSyncMap(conn.id, item.key, id, localHash, item.startAt, exportCal);
          stats.pushed++;
          continue;
        }
        const remote = remoteById.get(known.externalId);
        const remoteMoved = remote && remoteHash(remote) !== known.hash;
        const localMoved = localHash !== known.hash;
        if (remoteMoved && !localMoved) {
          if (await applyRemoteToItem(user, item, remote!)) { await setSyncMap(conn.id, item.key, known.externalId, remoteHash(remote!), remote!.start, exportCal); stats.pulled++; }
          else {
            await addSuggestion(user.id, 'sync_conflict', `„${item.title}“ wurde in ${PROVIDER_LABEL[p]} geändert. Wiederkehrende CLOQI-Termine bitte direkt in CLOQI bearbeiten – ich habe die CLOQI-Version behalten.`,
              { action: 'info' }, `remote-edit:${item.key}:${remote!.version}`);
            await updateRemote(user, p, exportCal, known.externalId, w);
            await setSyncMap(conn.id, item.key, known.externalId, localHash, item.startAt, exportCal);
          }
        } else if (remoteMoved && localMoved) {
          await addSuggestion(user.id, 'sync_conflict', `„${item.title}“ wurde in CLOQI und in ${PROVIDER_LABEL[p]} unterschiedlich geändert. Die CLOQI-Version wurde nicht übertragen – bitte prüfen.`,
            { action: 'info' }, `both-edit:${item.key}:${remote!.version}`);
          stats.conflicts++;
        } else if (localMoved) {
          const ok = remote === undefined && !(await remoteExists(user, p, exportCal, known.externalId))
            ? null : await updateRemote(user, p, exportCal, known.externalId, w);
          if (!ok) await setSyncMap(conn.id, item.key, await createRemote(user, p, exportCal, w), localHash, item.startAt, exportCal);
          else await setSyncMap(conn.id, item.key, known.externalId, localHash, item.startAt, exportCal);
          stats.pushed++;
        }
      }
      for (const [key, known] of map) {
        if (current.has(key) || known.startAt < from) continue;
        await deleteRemote(user, p, known.externalCalendarId || exportCal, known.externalId);
        await removeSyncMap(conn.id, key);
        stats.deleted++;
      }
    }

    await markConnectionSync(conn.id, null);
    return stats;
  } catch (e) {
    await markConnectionSync(conn.id, e instanceof Error ? e.message : 'Unbekannter Fehler');
    if (e instanceof ExpiredError) await upsertConnection(user.id, p, { status: 'expired' });
    throw e;
  }
}

async function remoteExists(user: User, p: OAuthProvider, calendarId: string, id: string): Promise<boolean> {
  const url = p === 'google' ? `${G}/calendars/${enc(calendarId)}/events/${enc(id)}` : `${M}/events/${enc(id)}`;
  return (await api(user, p, 'GET', url)) !== null;
}

/** A CLOQI item was moved/renamed in the external calendar → apply where it is safe. */
async function applyRemoteToItem(user: User, item: CalendarItem, r: RemoteEvent): Promise<boolean> {
  if (item.kind === 'study') {
    if (!await getBlock(user.id, item.id)) return false;
    await updateBlock(user.id, item.id, { startAt: r.start, endAt: r.end });
    return true;
  }
  if (item.kind === 'event' && !item.recurring) {
    const e = await getEvent(user.id, item.id);
    if (!e) return false;
    await updateEvent(user.id, e.id, { title: r.title, startAt: r.start, endAt: r.end, location: r.location });
    return true;
  }
  return false;
}

/** Resolve a two-sided conflict on an imported event. */
export async function resolveConflict(user: User, event: CalendarEvent, keep: 'cloqi' | 'remote', remote: Writable & { version?: string }) {
  if (!event.connectionId || !event.externalUid) return;
  const p = event.source as OAuthProvider;
  const { calendarId, id } = splitExternalUid(event.externalUid);
  if (keep === 'remote') {
    await updateEvent(user.id, event.id, { ...remote, syncState: 'clean', remoteVersion: remote.version ?? null });
    return;
  }
  await updateRemote(user, p, calendarId, id, event, false);
  await updateEvent(user.id, event.id, { syncState: 'clean', remoteVersion: null });
}
