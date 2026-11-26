// Does the user's OWN chat message ask for removing something? Only then may CLOQI AI delete without a
// separate "Ja" – instructions hidden in imported titles or vault files never count (they are not the message).

// explicit delete verbs – enough for anything CLOQI may delete (incl. its notes in the vault)
const EXPLICIT = /l[öo]sch|entfern|absag|sag\S* .*\bab\b|streich|storn|\bweg\b|raus(nehm|werf)|cancel|delete|remove/i;

// everyday ways of cancelling ("Training fällt aus", "heute kein Sport", "bis Samstag nichts einplanen",
// "mach mir den Abend frei") – only for calendar entries and study blocks, never for the vault
const IMPLICIT = new RegExp([
  'f[äa]llt\\b.*\\baus\\b', 'ausfallen', '\\bkein(e|en)?\\s+(sport|training|lernen|lernbl\\S*|termin\\S*)',
  'nicht\\s+(lernen|trainieren)', 'nichts\\s+(mehr\\s+)?ein', 'frei(\\s+haben|\\s*machen|\\s*r[äa]umen)', '\\bmach\\S*\\s.*\\bfrei\\b',
].join('|'), 'i');

// "nicht löschen", "bitte nichts entfernen", "lösch das nicht", "don't delete"
const NEGATED = /\b(nicht|nichts|nie|niemals|keine?n?)\s+(\S+\s+){0,2}(l[öo]sch|entfern|absag|streich|storn)|(l[öo]sch|entfern|streich)\S*\s+(\S+\s+){0,3}(nicht|nie)\b|\b(don'?t|do not|never)\s+(delete|remove|cancel)/i;

// "räum auf", "plan um", "verschieb …", "mach Platz" – reorganising (Auto may then drop its own study blocks)
const REORGANIZE = /r[äa]um\S*\s+(\S+\s+){0,3}auf|aufr[äa]um|um(zu)?plan|plan\S*\s+(\S+\s+){0,3}um\b|neu\s+plan|verschieb|platz\s+(machen|schaffen)|mach\S*\s+(\S+\s+){0,2}platz|reorgani/i;

/** 'explicit' = clear delete verb · 'implicit' = everyday cancelling (calendar/study blocks only) · null = no */
export function deleteIntent(message: string): 'explicit' | 'implicit' | null {
  if (NEGATED.test(message)) return null;
  if (EXPLICIT.test(message)) return 'explicit';
  return IMPLICIT.test(message) ? 'implicit' : null;
}

export const wantsDelete = (message: string) => deleteIntent(message) !== null;

export function wantsReorganize(message: string): boolean {
  return REORGANIZE.test(message) && !NEGATED.test(message);
}
