import { NextRequest, NextResponse } from 'next/server';

// Cheap edge check: pages of the app need a session cookie (the real check happens on the server).
// API routes that change data must come from our own origin (CSRF protection).
const PUBLIC = ['/login', '/api/feed', '/api/cron', '/datenschutz', '/impressum'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (req.method !== 'GET' && req.method !== 'HEAD' && pathname.startsWith('/api/') && !pathname.startsWith('/api/cron')) {
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith('/api/')) return NextResponse.next();
  if (!req.cookies.has('cloqi_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|mascot/|icons/).*)'] };
