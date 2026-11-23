'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSession, destroySession, rateLimit } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { createUser, findUserByEmail } from '@/lib/repo';
import { DEFAULT_TZ } from '@/lib/time';
import { email as parseEmail, InputError } from '@/lib/validate';

export type AuthState = { error?: string; mode: 'login' | 'register' };

async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'local').trim();
}

export async function authenticate(_prev: AuthState, form: FormData): Promise<AuthState> {
  const mode = form.get('mode') === 'register' ? 'register' : 'login';
  let target = '/dashboard';
  try {
    const mail = parseEmail(String(form.get('email') ?? ''));
    const password = String(form.get('password') ?? '');
    const ip = await clientKey();
    if (!rateLimit(`auth:${ip}`, 20, 15 * 60000) || !rateLimit(`auth:${mail}`, 8, 15 * 60000)) {
      throw new InputError('Zu viele Versuche. Bitte warte ein paar Minuten.');
    }
    if (mode === 'register') {
      if (password.length < 8) throw new InputError('Das Passwort braucht mindestens 8 Zeichen.');
      if (password.length > 200) throw new InputError('Das Passwort ist zu lang.');
      if (findUserByEmail(mail)) throw new InputError('Für diese E-Mail gibt es schon einen Account. Melde dich an.');
      const user = createUser(mail, await hashPassword(password), process.env.DEFAULT_TIMEZONE || DEFAULT_TZ);
      await createSession(user.id);
      target = '/onboarding';
    } else {
      const user = findUserByEmail(mail);
      // Same message for unknown e-mail and wrong password.
      const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAA');
      if (!user || !ok) throw new InputError('E-Mail oder Passwort stimmt nicht.');
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
