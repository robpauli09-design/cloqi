'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSession, destroySession, refund, tryConsume } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { createUser, findUserByEmail } from '@/lib/repo';
import { DEFAULT_TZ } from '@/lib/time';
import { email as parseEmail, InputError } from '@/lib/validate';

export type AuthState = { error?: string; mode: 'login' | 'register' };

/**
 * Client IP for throttling. The proxy in front of the app appends the real client address as the
 * LAST X-Forwarded-For entry – earlier entries can be forged by the client, so they are ignored.
 * (Deploy behind exactly one reverse proxy; without a proxy this header is not trustworthy.)
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean);
  return forwarded?.length ? forwarded[forwarded.length - 1] : 'direct';
}

export async function authenticate(_prev: AuthState, form: FormData): Promise<AuthState> {
  const mode = form.get('mode') === 'register' ? 'register' : 'login';
  let target = '/dashboard';
  try {
    const mail = parseEmail(String(form.get('email') ?? ''));
    const password = String(form.get('password') ?? '');
    const ip = await clientKey();
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
      if (findUserByEmail(mail)) throw new InputError('Für diese E-Mail gibt es schon einen Account. Melde dich an.');
      const user = createUser(mail, await hashPassword(password), process.env.DEFAULT_TIMEZONE || DEFAULT_TZ);
      refund(keys[1], keys[2]); // the per-IP budget stays used up: no mass sign-ups
      await createSession(user.id);
      target = '/onboarding';
    } else {
      const user = findUserByEmail(mail);
      // Same message for unknown e-mail and wrong password.
      const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAA');
      if (!user || !ok) throw new InputError('E-Mail oder Passwort stimmt nicht.');
      refund(...keys);
      await createSession(user.id);
      target = user.onboarded ? '/dashboard' : '/onboarding';
    }
  } catch (e) {
    return { mode, error: e instanceof InputError ? e.message : 'Anmeldung gerade nicht möglich. Bitte später erneut versuchen.' };
  }
  redirect(target);
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
