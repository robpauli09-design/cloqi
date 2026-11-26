// Does the user's OWN chat message ask for removing something? Only then may CLOQI AI delete without a
// separate "Ja" – instructions hidden in imported titles or vault files never count (they are not the message).

const INTENT = new RegExp([
  'l[öo]sch', 'entfern', 'absag', 'sag\\S* .*\\bab\\b', 'streich', 'storn', '\\bweg\\b', 'raus(nehm|werf)',
  'cancel', 'delete', 'remove',
  // "Training fällt aus", "heute kein Sport", "bis Samstag nichts einplanen", "mach mir den Abend frei"
  'f[äa]llt\\b.*\\baus\\b', 'ausfallen', '\\bkein(e|en)?\\s+(sport|training|lernen|lernbl\\S*|termin\\S*)',
  'nicht\\s+(lernen|trainieren)', 'nichts\\s+(mehr\\s+)?ein', 'frei(\\s+haben|\\s*machen|\\s*r[äa]umen)', '\\bmach\\S*\\s.*\\bfrei\\b',
].join('|'), 'i');

// "nicht löschen", "bitte nichts entfernen", "lösch das nicht", "don't delete"
const NEGATED = /\b(nicht|nichts|nie|niemals|keine?n?)\s+(\S+\s+){0,2}(l[öo]sch|entfern|absag|streich|storn)|(l[öo]sch|entfern|streich)\S*\s+(\S+\s+){0,3}(nicht|nie)\b|\b(don'?t|do not|never)\s+(delete|remove|cancel)/i;

export function wantsDelete(message: string): boolean {
  return INTENT.test(message) && !NEGATED.test(message);
}
