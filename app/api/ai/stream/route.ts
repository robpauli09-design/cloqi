import { currentUser } from '@/lib/auth';
import { streamChat } from '@/lib/ai-stream';
import { body, json } from '@/lib/mobile-api';
import { InputError } from '@/lib/validate';

// the agent may call the model several times per message (and think before each step)
export const maxDuration = 120;

/** Website: one CLOQI AI message, answer streamed (session cookie; same-origin only, see middleware). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !user.onboarded) return json({ error: 'Bitte melde dich an.' }, 401);
  try {
    return streamChat(user, await body(req, 4_500_000));
  } catch (e) {
    return json({ error: e instanceof InputError ? e.message : 'Ungültige Anfrage.' }, 400);
  }
}
