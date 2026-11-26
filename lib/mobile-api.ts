import 'server-only';
import { userFromBearer } from './auth';
import { utcToZoned } from './time';
import type { CalendarItem, User } from './types';
import { InputError } from './validate';

// Helpers for the app API (/api/mobile/*). The app authenticates with `Authorization: Bearer <token>`
// (a normal CLOQI session, created by POST /api/mobile/auth). No cookies → no CSRF surface.

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function apiError(e: unknown) {
  if (e instanceof InputError) return json({ error: e.message }, 400);
  console.error('[cloqi api]', e);
  return json({ error: 'Da ist etwas schiefgelaufen. Bitte versuch es gleich nochmal.' }, 500);
}

/** Wraps a handler: resolves the user from the bearer token, answers 401 without one. */
export function withUser(handler: (user: User, req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      const user = await userFromBearer(req);
      if (!user) return json({ error: 'Bitte melde dich an.' }, 401);
      return await handler(user, req);
    } catch (e) { return apiError(e); }
  };
}

export async function body(req: Request, maxChars = 20000): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxChars) throw new InputError('Anfrage ist zu groß.');
  try { const v = text ? JSON.parse(text) : {}; return v && typeof v === 'object' ? v : {}; } catch { throw new InputError('Ungültige Anfrage.'); }
}

/** What the app knows about the signed-in user. */
export function appUser(u: User) {
  return {
    id: u.id, email: u.email, name: u.name, userType: u.userType, gender: u.gender, timezone: u.timezone,
    onboarded: u.onboarded, mascot: u.prefs.mascot, cycleEnabled: u.prefs.cycleEnabled, dailyGoalMin: u.prefs.dailyGoalMin, aiMode: u.prefs.aiMode,
  };
}

/** Calendar item + local date/time in the user's time zone (the app doesn't need time-zone math). */
export function appItem(i: CalendarItem, tz: string) {
  const s = utcToZoned(i.startAt, tz), e = utcToZoned(i.endAt, tz);
  return { ...i, date: s.date, start: s.time, end: e.time, endDate: e.date };
}
