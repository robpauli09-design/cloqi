import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, session, type AppUser } from './api';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: AppUser | null;
  signIn(mode: 'login' | 'register', email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  setUser(u: AppUser): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AppUser | null>(null);

  const signOutLocal = useCallback(async () => {
    await session.clear();
    setUser(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    session.onUnauthorized(() => { void signOutLocal(); });
    (async () => {
      if (!(await session.load())) return setStatus('signedOut');
      try {
        setUser(await api<AppUser>('/me'));
        setStatus('signedIn');
      } catch {
        // offline or expired: an expired token was already cleared by onUnauthorized
        setStatus(s => (s === 'loading' ? 'signedOut' : s));
      }
    })();
  }, [signOutLocal]);

  const value = useMemo<AuthValue>(() => ({
    status, user, setUser,
    async signIn(mode, email, password) {
      const r = await api<{ token: string; user: AppUser }>('/auth', { method: 'POST', body: { mode, email, password } });
      await session.save(r.token);
      setUser(r.user);
      setStatus('signedIn');
    },
    async signOut() {
      await api('/auth', { method: 'DELETE' }).catch(() => {});
      await signOutLocal();
    },
  }), [status, user, signOutLocal]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
