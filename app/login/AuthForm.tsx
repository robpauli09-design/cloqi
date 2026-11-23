'use client';

import { useActionState, useState } from 'react';
import { authenticate, type AuthState } from '@/app/actions/auth';
import { SubmitButton } from '@/components/ui';

export function AuthForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''); // controlled: survives the form reset after a failed attempt
  const [state, action] = useActionState<AuthState, FormData>(authenticate, { mode: 'login' });
  return (
    <div className="mt-8">
      <div className="mb-6 grid grid-cols-2 rounded-xl bg-leaf-soft p-1 text-sm font-semibold">
        {(['login', 'register'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`rounded-lg py-2 transition ${mode === m ? 'bg-white text-leaf-dark shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
            {m === 'login' ? 'Anmelden' : 'Account erstellen'}
          </button>
        ))}
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />
        <div>
          <label htmlFor="email" className="label">E-Mail-Adresse</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="du@beispiel.at" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="label">Passwort</label>
          <input id="password" name="password" type="password" required minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'} className="input"
            placeholder={mode === 'register' ? 'Mindestens 8 Zeichen' : '••••••••'} />
        </div>
        {state.error && state.mode === mode && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{state.error}</p>}
        <SubmitButton className="btn-primary w-full py-3" pendingText="Einen Moment …">
          {mode === 'login' ? 'Anmelden' : 'Account erstellen'}
        </SubmitButton>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-ink-faint"><span className="h-px flex-1 bg-line" />oder<span className="h-px flex-1 bg-line" /></div>
      <div className="grid gap-2">
        <button type="button" disabled className="btn-outline w-full" title="Bald verfügbar">
          <GoogleIcon /> Mit Google anmelden <span className="chip bg-sand-soft text-ink-soft">bald</span>
        </button>
        <button type="button" disabled className="btn-outline w-full" title="Bald verfügbar">
          <AppleIcon /> Mit Apple anmelden <span className="chip bg-sand-soft text-ink-soft">bald</span>
        </button>
      </div>
      <p className="mt-6 text-center text-xs text-ink-faint">
        Mit dem Erstellen eines Accounts stimmst du der Verarbeitung deiner Daten zur Bereitstellung von CLOQI zu.
        Deine Daten werden in der EU gespeichert und nie verkauft.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>;
}
function AppleIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.2-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1-3.2-1 .1-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" /></svg>;
}
