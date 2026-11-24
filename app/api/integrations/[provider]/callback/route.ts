import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { currentUser } from '@/lib/auth';
import { finishOAuth, PROVIDER_LABEL, syncProvider, type OAuthProvider } from '@/lib/integrations';
import { syncSchool } from '@/lib/school';

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (msg: string, ok = false) => {
    const res = NextResponse.redirect(new URL(`/connect?${ok ? 'ok' : 'error'}=${encodeURIComponent(msg)}`, req.url));
    res.cookies.delete(`oauth_state_${provider}`);
    return res;
  };
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  if (provider !== 'google' && provider !== 'outlook' && provider !== 'school') return back('Unbekannter Anbieter.');
  const p = provider as OAuthProvider;

  const url = req.nextUrl;
  if (url.searchParams.get('error')) {
    // the school's Microsoft settings may not allow students to connect apps – that's fine, nothing else changes
    const why = `${url.searchParams.get('error')} ${url.searchParams.get('error_description') ?? ''}`;
    if (p === 'school' && /AADSTS(65001|90094|90095|900941|50105)|admin|consent_required/i.test(why)) {
      return back('Deine Schule erlaubt das Verbinden von CLOQI mit Teams/OneNote (noch) nicht. Alles andere in CLOQI funktioniert ganz normal.');
    }
    return back(`Die Verbindung mit ${PROVIDER_LABEL[p]} wurde abgebrochen.`);
  }
  const state = url.searchParams.get('state') ?? '';
  const expected = req.cookies.get(`oauth_state_${provider}`)?.value ?? '';
  if (!state || !expected || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
    return back('Sicherheitsprüfung fehlgeschlagen. Bitte versuche es noch einmal.');
  }
  const code = url.searchParams.get('code');
  if (!code) return back('Es wurde kein Autorisierungscode übermittelt.');
  try {
    await finishOAuth(user, p, code);
    if (p === 'school') {
      const r = await syncSchool(user).catch(() => null);
      return back(`Microsoft Schule ist verbunden (nur lesen)${r ? ` – ${r.homework} Hausübungen, ${r.pages} OneNote-Seiten gefunden` : ''}.`, true);
    }
    const s = await syncProvider(user, p).catch(() => null);
    return back(`${PROVIDER_LABEL[p]} ist verbunden${s ? ` – ${s.pulled} Termine übernommen, ${s.pushed} übertragen` : ''}.`, true);
  } catch (e) {
    return back(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.');
  }
}
