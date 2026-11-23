import 'server-only';
import { cookies } from 'next/headers';

// The website reopens the area you were in last (Kalender, CLOQI AI, Profil …) – like the app.
export const LAST_PATH_COOKIE = 'cloqi_last';
const ALLOWED = /^\/(dashboard|calendar|learn|life|ai|vault|profile|connect|cycle)$/;

/** Where to land after opening the site / logging in (default: Heute). */
export async function lastPath(): Promise<string> {
  const v = (await cookies()).get(LAST_PATH_COOKIE)?.value ?? '';
  return ALLOWED.test(v) ? v : '/dashboard';
}
