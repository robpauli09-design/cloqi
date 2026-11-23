import 'server-only';
import { decrypt, encrypt, randomToken, sha256 } from './crypto';
import { getCalendarItems } from './calendar';
import { buildIcs } from './ics';
import { getConnection, upsertConnection } from './repo';
import { appUrl } from './integrations';
import { CATEGORY_META, type User } from './types';

// Apple Calendar (iPhone, iPad, Mac): a personal, unguessable iCalendar subscription.
// This is a one-way sync CLOQI → Apple. Two-way sync would need CalDAV (not implemented).

export function createOrRotateFeed(user: User): string {
  const token = randomToken(32);
  upsertConnection(user.id, 'apple', {
    status: 'connected', secretEnc: encrypt(token), lookupHash: sha256(token),
    config: { exportCategories: ['schule', 'lernen', 'pruefung', 'hausuebung', 'training', 'arbeit', 'freizeit', 'privat'] },
  });
  return token;
}

export function feedUrls(user: User): { https: string; webcal: string } | null {
  const conn = getConnection(user.id, 'apple');
  if (!conn?.secretEnc || conn.status !== 'connected') return null;
  const https = `${appUrl()}/api/feed/${decrypt(conn.secretEnc)}.ics`;
  return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') };
}

export function buildFeed(user: User, now = new Date()): string {
  const conn = getConnection(user.id, 'apple');
  const cats = new Set(conn?.config.exportCategories ?? []);
  const from = new Date(now.getTime() - 14 * 86400000).toISOString();
  const to = new Date(now.getTime() + 90 * 86400000).toISOString();
  const items = getCalendarItems(user, from, to, { includeHidden: true }).filter(i => cats.has(i.category) && i.status !== 'missed');
  return buildIcs('CLOQI', items.map(i => ({
    uid: `${i.key}@cloqi`,
    title: i.kind === 'study' && i.status === 'done' ? `✓ ${i.title}` : i.title,
    start: new Date(i.startAt),
    end: new Date(i.endAt),
    allDay: i.allDay,
    description: [i.description, i.teacher ? `Lehrer/in: ${i.teacher}` : null].filter(Boolean).join('\n') || null,
    location: i.location,
    category: CATEGORY_META[i.category].label,
    status: i.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
  })));
}
