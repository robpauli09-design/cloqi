import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, nowIso } from './db';
import { randomToken, sha256 } from './crypto';
import { getUser } from './repo';
import type { User } from './types';

export const SESSION_COOKIE = 'cloqi_session';
const SESSION_DAYS = 30;

export async function createSession(userId: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  db().prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(sha256(token), userId, expires.toISOString(), nowIso());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  jar.delete(SESSION_COOKIE);
}

/** Current user for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db().prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token)) as { user_id: string; expires_at: string } | undefined;
  if (!row || row.expires_at < nowIso()) return null;
  return getUser(row.user_id);
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

// Simple in-memory rate limit (per process) for login and registration attempts.
const attempts = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.resetAt < now) { attempts.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  a.count++;
  return a.count <= max;
}

export function purgeExpiredSessions() {
  db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
}
