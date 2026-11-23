import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { exportUserData } from '@/lib/repo';

// DSGVO Art. 20: all personal data as JSON. Tokens and secrets are never included.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  return new NextResponse(JSON.stringify(await exportUserData(user.id), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="cloqi-daten-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
