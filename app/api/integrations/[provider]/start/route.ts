import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { randomToken } from '@/lib/crypto';
import { authorizationUrl, isConfigured, type OAuthProvider } from '@/lib/integrations';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  if (provider !== 'google' && provider !== 'outlook' && provider !== 'school') return NextResponse.json({ error: 'Unbekannter Anbieter' }, { status: 404 });
  if (!isConfigured(provider as OAuthProvider)) {
    return NextResponse.redirect(new URL(`/connect?error=${encodeURIComponent('Dieser Anbieter ist auf dem Server noch nicht eingerichtet (Client-ID fehlt).')}`, req.url));
  }
  // state protects the callback against CSRF; it is bound to this browser via an httpOnly cookie
  const state = randomToken(24);
  const res = NextResponse.redirect(authorizationUrl(provider as OAuthProvider, state));
  res.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/integrations', maxAge: 600,
  });
  return res;
}
