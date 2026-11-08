export type Page =
  | "home"
  | "import"
  | "station"
  | "processes"
  | "tasks"
  | "analytics"
  | "team"
  | "knowledge"
  | "ai"
  | "settings";
export type Priority = "Niedrig" | "Mittel" | "Hoch" | "Kritisch";
export interface Task {
  id: string;
  title: string;
  process: string;
  priority: Priority;
  due: string;
  person: string;
  done: boolean;
  description: string;
}
export interface Process {
  id: string;
  name: string;
  title: string;
  status: string;
  duration: number;
  error: string;
  waiting: number;
  people: number;
  steps: string[];
}
export const processes: Process[] = [
  {
    id: "raw",
    name: "Rohstoffe",
    title: "Rübenannahme & Aufbereitung",
    status: "Stabil",
    duration: 24,
    error: "0,8",
    waiting: 3,
    people: 4,
    steps: [
      "Anlieferung erfassen",
      "Rüben wiegen",
      "Probe entnehmen",
      "Rüben reinigen",
      "An Produktion übergeben",
    ],
  },
  {
    id: "production",
    name: "Produktion",
    title: "Zuckerherstellung · Linie 3",
    status: "Handlungsbedarf",
    duration: 46,
    error: "2,1",
    waiting: 12,
    people: 5,
    steps: [
      "Rohstoffe zuführen",
      "Saft gewinnen",
      "Saft reinigen",
      "Eindampfen",
      "Kristallisieren",
      "An Verpackung übergeben",
    ],
  },
  {
    id: "packaging",
    name: "Verpackung",
    title: "Verpackung · Linie 3",
    status: "Verbesserungspotenzial",
    duration: 32,
    error: "1,4",
    waiting: 8,
    people: 5,
    steps: [
      "Produkt kommt an",
      "Verpackung vorbereiten",
      "Maschine einstellen & prüfen",
      "Produkt verpacken",
      "Qualitätskontrolle",
      "Lagerung",
    ],
  },
  {
    id: "logistics",
    name: "Logistik",
    title: "Lagerung & Auslieferung",
    status: "1 Verbesserung",
    duration: 38,
    error: "0,6",
    waiting: 7,
    people: 3,
    steps: [
      "Ware übernehmen",
      "Lagerplatz zuweisen",
      "Auftrag kommissionieren",
      "Verladung prüfen",
      "Ausliefern",
    ],
  },
  {
    id: "quality",
    name: "Qualität",
    title: "Qualitätssicherung",
    status: "Stabil",
    duration: 18,
    error: "0,4",
    waiting: 2,
    people: 2,
    steps: [
      "Probe erfassen",
      "Laboranalyse",
      "Ergebnis dokumentieren",
      "Charge freigeben",
    ],
  },
];
export const initialTasks: Task[] = [
  {
    id: "clean",
    title: "Reinigungsschritt Linie 3 prüfen",
    process: "production",
    priority: "Hoch",
    due: "Heute",
    person: "Julia Sommer",
    done: false,
    description:
      "Prüfe die Reinigungsdokumentation an Linie 3 und besprich den zusätzlichen Prüfschritt mit der Schichtleitung. Dokumentiere die mögliche Vereinfachung.",
  },
  {
    id: "protocol",
    title: "Neues Verpackungsprotokoll einführen",
    process: "packaging",
    priority: "Mittel",
    due: "Morgen",
    person: "Markus Weber",
    done: false,
    description:
      "Gehe das neue Verpackungsprotokoll gemeinsam mit dem Team durch. Prüfe, ob alle Zuständigkeiten klar sind und ob die Dokumentation am Arbeitsplatz verfügbar ist.",
  },
  {
    id: "training",
    title: "Qualitätssicherung schulen",
    process: "quality",
    priority: "Niedrig",
    due: "25. Sep.",
    person: "Sarah Berger",
    done: false,
    description:
      "Organisiere eine gemeinsame Einführung in die Qualitätskontrolle. Besprecht die Dokumentation und offene Fragen anhand einer Beispielcharge.",
  },
  {
    id: "feedback",
    title: "Feedback aus Produktion auswerten",
    process: "production",
    priority: "Mittel",
    due: "26. Sep.",
    person: "Julia Sommer",
    done: false,
    description:
      "Fasse die anonymen Prozesshinweise der letzten Woche zusammen. Identifiziere wiederkehrende Wartezeiten und besprecht gemeinsam eine Verbesserung.",
  },
];
export const members = [
  {
    name: "Julia Sommer",
    initials: "JS",
    role: "Produktionsleitung",
    area: "Produktion",
    skills: ["Prozessoptimierung", "Qualität"],
    training: "Lean Management",
    color: "peach",
  },
  {
    name: "Markus Weber",
    initials: "MW",
    role: "Schichtleitung",
    area: "Verpackung",
    skills: ["Verpackung", "Maschinen"],
    training: "Neues Verpackungsprotokoll",
    color: "sage",
  },
  {
    name: "Sarah Berger",
    initials: "SB",
    role: "Qualitätsmanagement",
    area: "Qualität",
    skills: ["Qualitätskontrolle", "Schulung"],
    training: "Qualitätssicherung",
    color: "yellow",
  },
  {
    name: "Thomas Gruber",
    initials: "TG",
    role: "Logistikkoordination",
    area: "Logistik",
    skills: ["Lagerung", "Disposition"],
    training: "Sichere Verladung",
    color: "stone",
  },
];
export const articles = [
  {
    id: "machine",
    title: "Verpackungsmaschine richtig einstellen",
    category: "Verpackung",
    time: "4 Min.",
    intro: "Gut vorbereitet für einen reibungslosen Start an Linie 3.",
    body: [
      "Vorbereitung: Verwende das für Produkt und Maschine freigegebene Verpackungsprotokoll.",
      "Einstellungen: Gleiche die vorgesehenen Werte mit der dokumentierten Freigabe ab. Änderungen werden mit der zuständigen Schichtleitung abgestimmt.",
      "Probelauf: Führe die im freigegebenen Protokoll vorgesehene Prüfung durch und dokumentiere das Ergebnis.",
      "Übergabe: Halte Rückfragen und Abweichungen im Schichtprotokoll fest.",
    ],
    summary:
      "Protokoll bereitlegen, freigegebene Einstellungen abgleichen, Probelauf dokumentieren und die nächste Schicht informieren.",
  },
  {
    id: "quality",
    title: "Qualitätskontrolle auf einen Blick",
    category: "Qualität",
    time: "3 Min.",
    intro: "Ein gemeinsames Verständnis von Qualität – in jedem Schritt.",
    body: [
      "Der Prüfplan definiert Umfang und Zeitpunkt der Kontrolle.",
      "Ergebnisse werden chargenbezogen dokumentiert.",
      "Abweichungen werden an die Qualitätsverantwortlichen weitergegeben.",
      "Die Freigabe erfolgt durch die dafür verantwortliche Person.",
    ],
    summary:
      "Nach Prüfplan kontrollieren, Ergebnisse dokumentieren und Abweichungen mit dem Qualitätsteam klären.",
  },
  {
    id: "production",
    title: "Vom Rohstoff zum fertigen Zucker",
    category: "Produktion",
    time: "6 Min.",
    intro: "So hängen unsere Arbeitsschritte zusammen.",
    body: [
      "Rüben werden angeliefert, erfasst und aufbereitet.",
      "In der Produktion wird der Zuckersaft gewonnen, gereinigt und eingedampft.",
      "Nach der Kristallisation wird der Zucker für die Verpackung bereitgestellt.",
      "Qualität, Verpackung und Logistik arbeiten bei der Chargenübergabe zusammen.",
    ],
    summary:
      "Rohstoffe → Saftgewinnung → Kristallisation → Verpackung → Auslieferung. Klare Übergaben verbinden die Bereiche.",
  },
  {
    id: "safety",
    title: "Sicherheit beginnt im Team",
    category: "Allgemein",
    time: "5 Min.",
    intro: "Orientierung für den Arbeitsalltag.",
    body: [
      "Beachte stets die vor Ort gültigen Sicherheits- und Betriebsanweisungen.",
      "Fragen und unklare Situationen werden vor Arbeitsbeginn mit den Verantwortlichen geklärt.",
      "Diese Demo enthält keine verbindlichen Betriebs- oder Sicherheitsanweisungen.",
    ],
    summary:
      "Gültige Betriebsanweisungen beachten und Unklarheiten mit den Verantwortlichen klären. Dieser Artikel dient nur der Demonstration.",
  },
  {
    id: "software",
    title: "Deine ersten Schritte mit CLOQI",
    category: "Allgemein",
    time: "2 Min.",
    intro: "Weniger Suchen. Mehr gemeinsam bewegen.",
    body: [
      "Die Startseite zeigt dir deine Unternehmenswelt und aktuelle Aufgaben.",
      "Öffne eine Prozesskarte, um den Ablauf besser zu verstehen.",
      "Unter Aufgaben kannst du Verbesserungen verfolgen und abschließen.",
      "Frag CLOQI bietet in dieser Demo vorbereitete Antworten zu unseren Beispielprozessen.",
    ],
    summary:
      "Mit der Fabrikwelt starten, Prozesse entdecken und Verbesserungen als Aufgaben festhalten.",
  },
];
export const chartData = [
  { day: "Mo", before: 46, after: 38, waiting: 12 },
  { day: "Di", before: 43, after: 35, waiting: 10 },
  { day: "Mi", before: 45, after: 34, waiting: 9 },
  { day: "Do", before: 42, after: 30, waiting: 7 },
  { day: "Fr", before: 40, after: 29, waiting: 6 },
  { day: "Sa", before: 41, after: 28, waiting: 5 },
  { day: "So", before: 39, after: 27, waiting: 4 },
];
