import { NextRequest, NextResponse } from 'next/server';
import { currentUser, userFromBearer } from '@/lib/auth';
import { exportMaterial, formatsFor } from '@/lib/export';
import { FORMAT_LABEL, type Format } from '@/lib/lernmaterial-meta';
import { readVaultFile } from '@/lib/vault';
import { normalizePath } from '@/lib/vault';

export const maxDuration = 30;

/** Downloads a vault note – learning materials as PDF, Word, PowerPoint, Anki/Quizlet or Excel. Website (cookie) and app (Bearer). */
export async function GET(req: NextRequest) {
  const user = (await currentUser()) ?? (await userFromBearer(req).catch(() => null));
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  let path: string;
  try { path = normalizePath(q.get('path') ?? ''); } catch { return NextResponse.json({ error: 'Ungültige Datei.' }, { status: 400 }); }
  const format = (q.get('format') ?? 'pdf') as Format;
  if (!(format in FORMAT_LABEL)) return NextResponse.json({ error: 'Unbekanntes Format.' }, { status: 400 });
  const content = await readVaultFile(user, path);
  if (content === null) return NextResponse.json({ error: 'Datei nicht gefunden.' }, { status: 404 });
  if (format !== 'md' && !formatsFor(content).includes(format)) return NextResponse.json({ error: 'Dieses Format passt nicht zu der Datei.' }, { status: 400 });
  const title = path.split('/').pop()!.replace(/\.md$/, '');
  try {
    const file = await exportMaterial(content, title, format, { solutions: q.get('loesungen') !== '0' });
    const name = `${title}${q.get('loesungen') === '0' ? ' (ohne Lösungen)' : ''}.${file.ext}`;
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        'Content-Type': file.mime,
        'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[cloqi] export failed', e);
    return NextResponse.json({ error: 'Die Datei konnte nicht erstellt werden.' }, { status: 500 });
  }
}
