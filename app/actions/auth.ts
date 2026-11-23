'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSession, destroySession } from '@/lib/auth';
import { clientIp, loginOrRegister } from '@/lib/login';
import { InputError } from '@/lib/validate';

export type AuthState = { error?: string; mode: 'login' | 'register' };

export async function authenticate(_prev: AuthState, form: FormData): Promise<AuthState> {
  const mode = form.get('mode') === 'register' ? 'register' : 'login';
  let target = '/dashboard';
  try {
    const { user, isNew } = await loginOrRegister(mode, String(form.get('email') ?? ''), String(form.get('password') ?? ''), clientIp(await headers()));
    await createSession(user.id);
    target = isNew ? '/onboarding' : user.onboarded ? '/dashboard' : '/onboarding';
  } catch (e) {
    return { mode, error: e instanceof InputError ? e.message : 'Anmeldung gerade nicht möglich. Bitte später erneut versuchen.' };
  }
  redirect(target);
}

export async function logout() {
  await destroySession();
  redirect('/login');
}
