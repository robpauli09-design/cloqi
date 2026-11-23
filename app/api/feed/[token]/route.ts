import { NextRequest } from 'next/server';
import { sha256 } from '@/lib/crypto';
import { buildFeed } from '@/lib/feed';
import { findConnectionByLookup, getUser } from '@/lib/repo';

// Personal subscription feed for Apple Calendar & co. The token is unguessable (256 bit)
// and only its hash is used for the lookup.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = token.replace(/\.ics$/i, '');
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(raw)) return new Response('Not found', { status: 404 });
  const conn = findConnectionByLookup(sha256(raw));
  const user = conn && conn.provider === 'apple' ? getUser(conn.userId) : null;
  if (!user) return new Response('Not found', { status: 404 });
  return new Response(buildFeed(user), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="cloqi.ics"',
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
