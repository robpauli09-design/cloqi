'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clearFailures, createSession, destroySession, isThrottled, recordFailure } from '@/lib/auth';
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
    // per IP: 30 failures, per account+IP: 8, per account overall: 50 (slows distributed guessing
    // without letting a single attacker lock the owner out)
    if (isThrottled(keys[0], 30) || isThrottled(keys[1], 8) || isThrottled(keys[2], 50)) {
      throw new InputError('Zu viele Versuche. Bitte warte ein paar Minuten.');
    }
    if (mode === 'register') {
      if (password.length < 8) throw new InputError('Das Passwort braucht mindestens 8 Zeichen.');
      if (password.length > 200) throw new InputError('Das Passwort ist zu lang.');
      if (findUserByEmail(mail)) { recordFailure(keys[0]); throw new InputError('Für diese E-Mail gibt es schon einen Account. Melde dich an.'); }
      const user = createUser(mail, await hashPassword(password), process.env.DEFAULT_TIMEZONE || DEFAULT_TZ);
      recordFailure(keys[0]); // registrations also use up the per-IP budget (no mass sign-ups)
      await createSession(user.id);
      target = '/onboarding';
    } else {
      const user = findUserByEmail(mail);
      // Same message for unknown e-mail and wrong password.
      const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAA');
      if (!user || !ok) { recordFailure(...keys); throw new InputError('E-Mail oder Passwort stimmt nicht.'); }
      clearFailures(keys[1], keys[2]);
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
