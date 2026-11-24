// Learning materials created by CLOQI (shared by server and browser – no server-only imports).
// Every material is one Markdown file in wiki/<Fach>/<Titel>.md whose first line names its kind:
//   > **Lernzettel** · Mathematik · 24.11.2026
// From that Markdown the download route builds PDF, Word, PowerPoint, Anki/Quizlet and Excel files.

export type Format = 'pdf' | 'docx' | 'pptx' | 'md' | 'anki' | 'csv';

export const FORMAT_LABEL: Record<Format, string> = {
  pdf: 'PDF', docx: 'Word (.docx)', pptx: 'PowerPoint (.pptx)', md: 'Markdown (.md)', anki: 'Anki / Quizlet (.txt)', csv: 'Excel (.csv)',
};

const TEXT: Format[] = ['pdf', 'docx', 'md'];
const CARDS: Format[] = ['anki', 'csv', 'pdf', 'docx', 'md'];
const SLIDES: Format[] = ['pptx', 'pdf', 'docx', 'md'];

/** The kinds students use most – with the Markdown shape CLOQI writes for each. */
export const ARTEN = {
  lernzettel:      { label: 'Lernzettel',          formats: [...TEXT, 'pptx'], shape: 'Kurze Abschnitte mit ## Überschriften, Stichpunkte, **wichtige Begriffe** fett, am Ende „## Merke“.' },
  zusammenfassung: { label: 'Zusammenfassung',     formats: [...TEXT, 'pptx'], shape: '## Abschnitte pro Thema, kurze Absätze und Stichpunkte.' },
  uebungstest:     { label: 'Übungstest',          formats: TEXT, shape: '## Aufgaben mit nummerierten Aufgaben (1. 2. …, mit Punkten in Klammern), danach ## Lösungen mit denselben Nummern.' },
  uebungsblatt:    { label: 'Übungsblatt',         formats: TEXT, shape: '## Aufgaben (nummeriert, steigende Schwierigkeit), optional ## Lösungen.' },
  karteikarten:    { label: 'Karteikarten',        formats: CARDS, shape: 'Eine Tabelle | Vorderseite | Rückseite | – eine Zeile pro Karte, kurz und prüfbar.' },
  vokabelliste:    { label: 'Vokabelliste',        formats: CARDS, shape: 'Eine Tabelle | Wort | Übersetzung | Beispielsatz |.' },
  glossar:         { label: 'Begriffe & Definitionen', formats: CARDS, shape: 'Eine Tabelle | Begriff | Erklärung |, alphabetisch.' },
  formelsammlung:  { label: 'Formelsammlung',      formats: [...CARDS], shape: 'Tabelle | Formel / Regel | Bedeutung & wann verwenden |, gruppiert mit ## Überschriften.' },
  zeitleiste:      { label: 'Zeitleiste',          formats: CARDS, shape: 'Tabelle | Jahr/Datum | Ereignis | Bedeutung |, chronologisch.' },
  mindmap:         { label: 'Mindmap',             formats: SLIDES, shape: '# Thema, dann verschachtelte Stichpunkt-Liste (- Ast, darunter eingerückt - Unterpunkt), max. 3 Ebenen.' },
  referat:         { label: 'Referat / Präsentation', formats: SLIDES, shape: 'Jede ## Überschrift ist eine Folie mit 3–5 kurzen Stichpunkten; erste Folie Einleitung, letzte Fazit + Quellen.' },
  lernplan:        { label: 'Lernplan',            formats: TEXT, shape: 'Tabelle | Tag | Was | Dauer | oder ## pro Tag mit Stichpunkten.' },
  checkliste:      { label: 'Stoff-Checkliste',    formats: TEXT, shape: '## pro Kapitel, darunter „- [ ] Teilthema“ – zum Abhaken vor dem Test.' },
  eselsbruecken:   { label: 'Eselsbrücken & Merkhilfen', formats: TEXT, shape: 'Stichpunkte: **Was man sich merken muss** – Merkhilfe.' },
} as const satisfies Record<string, { label: string; formats: Format[]; shape: string }>;

export type Art = keyof typeof ARTEN;
export const ART_KEYS = Object.keys(ARTEN) as Art[];

/** Reads the kind from the first line ("> **Lernzettel** · Fach · Datum"). null = not a CLOQI learning material. */
export function materialInfo(markdown: string): { art: Art; fach: string } | null {
  const m = markdown.match(/^> \*\*(.+?)\*\* · (.+?) · /);
  if (!m) return null;
  const art = ART_KEYS.find(k => ARTEN[k].label === m[1]);
  return art ? { art, fach: m[2] } : null;
}

/** File-name safe text (vault allows letters, digits, space, - _ . /). */
export function safeName(s: string, max = 70): string {
  return s.replace(/[:–—|]/g, ' - ').replace(/[^A-Za-z0-9ÄÖÜäöüß _.\-]/g, '').replace(/\s+/g, ' ').replace(/^[\s.\-]+|[\s.\-]+$/g, '').slice(0, max).trim() || 'Unterlage';
}
