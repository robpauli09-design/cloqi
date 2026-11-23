import 'server-only';
import { db } from './db';

/**
 * Soft abuse protection for the test phase. The numbers are far above what a real person does,
 * so normal users never notice them – they only stop scripts that would run up the AI bill.
 * Counted in the database (works across all serverless instances on Vercel).
 */
export const LIMITS = {
  aiPer10Min: 40,   // messages to CLOQI AI in 10 minutes
  aiPerDay: 400,    // messages to CLOQI AI in 24 hours
  voicePer10Min: 30,
};

/** Returns a friendly message when this user sends unusually many AI messages, otherwise null. */
export async function aiLimitReached(userId: string): Promise<string | null> {
  const r = await (await db()).get(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes')::int AS m10,
            count(*)::int AS d1
       FROM chat_messages WHERE user_id = ? AND role = 'user' AND created_at > now() - interval '24 hours'`,
    [userId],
  );
  if (Number(r?.m10 ?? 0) >= LIMITS.aiPer10Min) return 'Puh, das waren sehr viele Nachrichten auf einmal. Gönn mir ein paar Minuten Pause 🙂';
  if (Number(r?.d1 ?? 0) >= LIMITS.aiPerDay) return 'Für heute hast du das Nachrichten-Limit der Testphase erreicht. Morgen geht’s weiter!';
  return null;
}

// Voice input has no table of its own – a per-instance counter is enough as a soft brake.
const voice = new Map<string, number[]>();
export function voiceLimitReached(userId: string): boolean {
  const now = Date.now();
  const recent = (voice.get(userId) ?? []).filter(t => now - t < 10 * 60000);
  if (recent.length >= LIMITS.voicePer10Min) { voice.set(userId, recent); return true; }
  recent.push(now);
  voice.set(userId, recent);
  if (voice.size > 5000) voice.clear();
  return false;
}
