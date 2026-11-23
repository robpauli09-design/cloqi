import 'server-only';
import { refund, tryConsume } from './auth';
import { hashPassword, verifyPassword } from './crypto';
import { createUser, findUserByEmail } from './repo';
import { DEFAULT_TZ } from './time';
import type { User } from './types';
import { email as parseEmail, InputError } from './validate';

/**
 * Login / registration rules shared by the website (server action) and the app (/api/mobile/auth).
 * Throws InputError with a user-facing message. `ip` is the client address used for throttling.
 */
export async function loginOrRegister(mode: 'login' | 'register', rawEmail: string, password: string, ip: string): Promise<{ user: User; isNew: boolean }> {
  const mail = parseEmail(rawEmail);
  const keys = [`ip:${ip}`, `acct:${mail}:${ip}`, `acct:${mail}`];
  // Counted synchronously before any await (no check-then-act race). Limits per 15 min:
  // per IP 30, per account+IP 8, per account 50 – slows guessing without letting one
  // attacker lock the owner out. Successful logins are refunded below.
  if (!tryConsume([[keys[0], 30], [keys[1], 8], [keys[2], 50]])) {
    throw new InputError('Zu viele Versuche. Bitte warte ein paar Minuten.');
  }
  if (mode === 'register') {
    if (password.length < 8) throw new InputError('Das Passwort braucht mindestens 8 Zeichen.');
    if (password.length > 200) throw new InputError('Das Passwort ist zu lang.');
    if (await findUserByEmail(mail)) throw new InputError('Für diese E-Mail gibt es schon einen Account. Melde dich an.');
    const user = await createUser(mail, await hashPassword(password), process.env.DEFAULT_TIMEZONE || DEFAULT_TZ);
    refund(keys[1], keys[2]); // the per-IP budget stays used up: no mass sign-ups
    return { user, isNew: true };
  }
  const user = await findUserByEmail(mail);
  // Same message (and similar timing) for unknown e-mail and wrong password.
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAA');
  if (!user || !ok) throw new InputError('E-Mail oder Passwort stimmt nicht.');
  refund(...keys);
  return { user, isNew: false };
}

/**
 * Client IP for throttling. The proxy in front of the app appends the real client address as the
 * LAST X-Forwarded-For entry – earlier entries can be forged by the client, so they are ignored.
 */
export function clientIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean);
  return forwarded?.length ? forwarded[forwarded.length - 1] : 'direct';
}
