import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { purgeExpiredSessions } from '@/lib/auth';
import { isConfigured, syncProvider } from '@/lib/integrations';
import { detectMissedBlocks } from '@/lib/planning';
import { getUser, listAllConnections, listUserIds } from '@/lib/repo';
import { syncWebUntis } from '@/lib/webuntis';

// Regular background sync (e.g. every 30 minutes from a scheduler):
// Authorization: Bearer <CRON_SECRET>
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await listAllConnections();
  const result = { ok: 0, failed: 0 };
  for (const r of rows) {
    const user = await getUser(r.userId);
    if (!user) continue;
    try {
      if (r.provider === 'webuntis') await syncWebUntis(user);
      else if ((r.provider === 'google' || r.provider === 'outlook') && isConfigured(r.provider)) await syncProvider(user, r.provider);
      result.ok++;
    } catch { result.failed++; }
  }
  for (const id of await listUserIds()) { const user = await getUser(id); if (user) await detectMissedBlocks(user); }
  await purgeExpiredSessions();
  return NextResponse.json(result);
}

// Vercel Cron calls the path with GET and "Authorization: Bearer <CRON_SECRET>".
export const GET = POST;
