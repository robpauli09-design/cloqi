import { transcribe } from '@/lib/ai';
import { body, json, withUser } from '@/lib/mobile-api';
import { InputError } from '@/lib/validate';

export const maxDuration = 60;

const TYPES: Record<string, string> = { 'audio/m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' };

/** Voice input from the app: JSON { audio: base64, mime } (max ~3 min) → { text }. */
export const POST = withUser(async (user, req) => {
  const b = await body(req, 4_400_000);
  const data = String(b.audio ?? '');
  const ext = TYPES[String(b.mime ?? 'audio/m4a')];
  if (!data || !ext || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new InputError('Keine gültige Aufnahme erhalten.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > 3_200_000) throw new InputError('Die Aufnahme ist zu lang (max. ca. 3 Minuten).');
  try {
    return json({ text: await transcribe(new Blob([bytes], { type: String(b.mime) }), `aufnahme.${ext}`, user.id) });
  } catch (e) {
    throw new InputError(e instanceof Error ? e.message : 'Spracherkennung fehlgeschlagen.');
  }
});
