import 'server-only';
import { db } from './db';

/**
 * Soft abuse protection for the test phase. The numbers are far above what a real person does,
 * so normal users never notice them – they only stop scripts that would run up the AI bill.
 *
 * Usage lives in its own table (ai_usage): deleting chats does not reset it. Each request is
 * recorded FIRST and counted afterwards, so parallel requests cannot slip through together.
 */
export const LIMITS = {
  ai: { per10Min: 40, perDay: 400 },    // messages to CLOQI AI
  voice: { per10Min: 30, perDay: 300 }, // voice inputs
};

type Kind = keyof typeof LIMITS;

/** Records one use and returns a friendly message if the user is over the limit, otherwise null. */
export async function useQuota(userId: string, kind: Kind): Promise<string | null> {
  const q = await db();
  await q.run('INSERT INTO ai_usage (user_id, kind) VALUES (?, ?)', [userId, kind]);
  const r = await q.get(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes')::int AS m10, count(*)::int AS d1
       FROM ai_usage WHERE user_id = ? AND kind = ? AND created_at > now() - interval '24 hours'`,
    [userId, kind],
  );
  // occasional cleanup of old rows (keeps the table small)
  if (Math.random() < 0.02) await q.run("DELETE FROM ai_usage WHERE created_at < now() - interval '2 days'");
  const l = LIMITS[kind];
  if (Number(r?.m10 ?? 0) > l.per10Min) {
    return kind === 'ai' ? 'Puh, das waren sehr viele Nachrichten auf einmal. Gönn mir ein paar Minuten Pause 🙂' : 'Sehr viele Sprachaufnahmen auf einmal – bitte kurz warten.';
  }
  if (Number(r?.d1 ?? 0) > l.perDay) {
    return kind === 'ai' ? 'Für heute hast du das Nachrichten-Limit der Testphase erreicht. Morgen geht’s weiter!' : 'Für heute ist das Limit für Spracheingaben erreicht.';
  }
  return null;
}
