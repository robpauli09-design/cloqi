import { issueAppToken, revokeAppToken } from '@/lib/auth';
import { clientIp, loginOrRegister } from '@/lib/login';
import { apiError, appUser, body, json } from '@/lib/mobile-api';

/** App login / registration → { token, user }. Same rules and throttling as the website. */
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const mode = b.mode === 'register' ? 'register' : 'login';
    const { user } = await loginOrRegister(mode, String(b.email ?? ''), String(b.password ?? ''), clientIp(req.headers));
    return json({ token: await issueAppToken(user.id), user: appUser(user) });
  } catch (e) { return apiError(e); }
}

/** App logout: invalidates this token on the server. */
export async function DELETE(req: Request) {
  try {
    await revokeAppToken(req);
    return json({ ok: true });
  } catch (e) { return apiError(e); }
}
