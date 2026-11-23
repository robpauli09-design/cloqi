import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { purgeExpiredSessions } from '@/lib/auth';
import { db } from '@/lib/db';
import { isConfigured, syncProvider } from '@/lib/integrations';
import { detectMissedBlocks } from '@/lib/planning';
import { getUser } from '@/lib/repo';
import { syncWebUntis } from '@/lib/webuntis';

// Regular background sync (e.g. every 30 minutes from a scheduler):
// Authorization: Bearer <CRON_SECRET>
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = db().prepare("SELECT user_id, provider FROM calendar_connections WHERE status IN ('connected', 'error') AND provider != 'apple'").all() as { user_id: string; provider: string }[];
  const result = { ok: 0, failed: 0 };
  for (const r of rows) {
    const user = getUser(r.user_id);
    if (!user) continue;
    try {
      if (r.provider === 'webuntis') await syncWebUntis(user);
      else if ((r.provider === 'google' || r.provider === 'outlook') && isConfigured(r.provider)) await syncProvider(user, r.provider);
      result.ok++;
    } catch { result.failed++; }
  }
  const users = db().prepare('SELECT id FROM users').all() as { id: string }[];
  for (const u of users) { const user = getUser(u.id); if (user) detectMissedBlocks(user); }
  purgeExpiredSessions();
  return NextResponse.json(result);
}
