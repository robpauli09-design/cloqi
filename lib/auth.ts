import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { nowIso } from './db';
import { randomToken, sha256 } from './crypto';
import { deleteExpiredSessions, deleteSession, findSession, getUser, insertSession, touchLogin } from './repo';
import type { User } from './types';

export const SESSION_COOKIE = 'cloqi_session';
const SESSION_DAYS = 30;

export async function createSession(userId: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await insertSession(sha256(token), userId, expires.toISOString());
  await touchLogin(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires,
  });
}

/** App login: same session table, but the token is returned to the app instead of set as a cookie. */
export async function issueAppToken(userId: string): Promise<string> {
  const token = randomToken(32);
  await insertSession(sha256(token), userId, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());
  await touchLogin(userId);
  return token;
}

/** User for an app request (`Authorization: Bearer <token>`), or null. */
export async function userFromBearer(req: Request): Promise<User | null> {
  const m = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  if (!m) return null;
  const row = await findSession(sha256(m[1]));
  if (!row || row.expiresAt < nowIso()) return null;
  return await getUser(row.userId);
}

export async function revokeAppToken(req: Request) {
  const m = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  if (m) await deleteSession(sha256(m[1]));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(sha256(token));
  jar.delete(SESSION_COOKIE);
}

/** Current user for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await findSession(sha256(token));
  if (!row || row.expiresAt < nowIso()) return null;
  return await getUser(row.userId);
});

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

/** Signed in and finished onboarding. */
export async function requireReadyUser(): Promise<User> {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');
  return user;
}

// In-memory throttling of failed login attempts (per process).
// Only failures count, a successful login clears the counter, so third parties
// cannot lock a user out just by trying – the hard limit is per (account + IP).
const failures = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60000;

function sweep(now: number) {
  if (failures.size < 5000) return;
  for (const [k, v] of failures) if (v.resetAt < now) failures.delete(k);
}

/**
 * Checks all limits and, if none is exceeded, counts the attempt immediately – synchronously,
 * before any await – so parallel requests cannot slip through between check and count.
 * Call `refund` for keys that should not count after a successful attempt.
 */
export function tryConsume(limits: [key: string, max: number][]): boolean {
  const now = Date.now();
  const blocked = limits.some(([key, max]) => {
    const a = failures.get(key);
    return Boolean(a && a.resetAt > now && a.count >= max);
  });
  if (blocked) return false;
  recordFailure(...limits.map(([key]) => key));
  return true;
}

export function refund(...keys: string[]) {
  for (const key of keys) {
    const a = failures.get(key);
    if (a && a.count > 0) a.count--;
  }
}

export function recordFailure(...keys: string[]) {
  const now = Date.now();
  sweep(now);
  for (const key of keys) {
    const a = failures.get(key);
    if (!a || a.resetAt < now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    else a.count++;
  }
}

export function clearFailures(...keys: string[]) {
  for (const key of keys) failures.delete(key);
}

export async function purgeExpiredSessions() {
  await deleteExpiredSessions();
}
