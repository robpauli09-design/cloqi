export type Field =
  "caseId" | "activity" | "timestamp" | "actor" | "system" | "cost";
export const fields: { id: Field; label: string; required?: boolean }[] = [
  { id: "caseId", label: "Vorgangs-ID", required: true },
  { id: "activity", label: "Aktivität", required: true },
  { id: "timestamp", label: "Zeitpunkt", required: true },
  { id: "actor", label: "Person / Rolle" },
  { id: "system", label: "System" },
  { id: "cost", label: "Kosten (EUR)" },
];
export type Mapping = Record<Field, string>;
export interface TableSource {
  id: string;
  name: string;
  headers: string[];
  rows: string[][];
  mapping: Mapping;
  dateFormat: "dmy" | "mdy";
}
export interface KnowledgeSource {
  id: string;
  name: string;
  text: string;
}
export interface ProcessEvent {
  caseId: string;
  activity: string;
  timestamp: string;
  actor?: string;
  system?: string;
  cost?: number;
  source: string;
  row: number;
}
export interface ImportRule {
  question: string;
  answer: string;
}
export interface ImportedProcess {
  id: string;
  owner: string;
  name: string;
  area: string;
  createdAt: string;
  events: ProcessEvent[];
  knowledge: KnowledgeSource[];
  rules: ImportRule[];
  sources: string[];
  pseudonymized: boolean;
}
export const MAX_ROWS = 10000;
const aliases: Record<Field, string[]> = {
  caseId: [
    "caseid",
    "case",
    "vorgangsid",
    "vorgang",
    "auftrag",
    "auftragsnummer",
    "auftragsid",
    "bestellnummer",
    "ticketid",
    "rechnungsnummer",
  ],
  activity: [
    "activity",
    "activityname",
    "aktivitat",
    "aktivitaet",
    "prozessschritt",
    "schritt",
    "aktion",
    "status",
    "ereignis",
  ],
  timestamp: [
    "timestamp",
    "zeitpunkt",
    "zeitstempel",
    "datum",
    "datetime",
    "date",
    "starttime",
    "startzeit",
  ],
  actor: [
    "actor",
    "resource",
    "ressource",
    "mitarbeiter",
    "person",
    "rolle",
    "bearbeiter",
    "verantwortlich",
  ],
  system: ["system", "quelle", "anwendung", "sourcesystem"],
  cost: ["cost", "kosten", "betrag", "costeur", "kosteneur"],
};
const simplify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
export function detectMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    fields.map((f) => [
      f.id,
      headers.find((h) => aliases[f.id].includes(simplify(h))) || "",
    ]),
  ) as Mapping;
}
export function makeTable(name: string, rows: string[][]): TableSource {
  const nonempty = rows.filter((row) => row.some((v) => v.trim()));
  if (nonempty.length < 2)
    throw new Error(
      "Die Tabelle braucht eine Kopfzeile und mindestens eine Datenzeile.",
    );
  const headers = nonempty[0].map((h) => h.trim());
  if (
    headers.length > 80 ||
    headers.some((h) => !h) ||
    new Set(headers).size !== headers.length
  )
    throw new Error(
      "Bitte eindeutige, nicht leere Spaltennamen verwenden (maximal 80 Spalten).",
    );
  if (nonempty.length - 1 > MAX_ROWS)
    throw new Error(
      "Maximal 10.000 Zeilen pro Tabelle. Bitte den Export eingrenzen.",
    );
  if (nonempty.slice(1).some((r) => r.length > headers.length))
    throw new Error(
      "Eine Zeile enthält mehr Werte als die Kopfzeile. Bitte Trennzeichen und Export prüfen.",
    );
  return {
    id: crypto.randomUUID(),
    name,
    headers,
    rows: nonempty.slice(1).map((r) => headers.map((_, i) => r[i] || "")),
    mapping: detectMapping(headers),
    dateFormat: "dmy",
  };
}
export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  const delimiter = [";", ",", "\t"].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0];
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else cell += c;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length > MAX_ROWS + 1)
        throw new Error("Maximal 10.000 Zeilen pro Tabelle.");
    } else cell += c;
  }
  if (quoted)
    throw new Error("Nicht geschlossenes Anführungszeichen in der CSV-Datei.");
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}
export function parseTimestamp(
  value: string,
  format: "dmy" | "mdy",
): string | null {
  const v = value.trim();
  let iso = v;
  const match = v.match(
    /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (match) {
    const [, a, b, y, h = "00", m = "00", s = "00"] = match;
    const day = format === "dmy" ? a : b,
      month = format === "dmy" ? b : a;
    iso = `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${h.padStart(2, "0")}:${m}:${s}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) iso = v + "T00:00:00Z";
  else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(v))
    iso = v.replace(" ", "T") + "Z";
  else if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      v,
    )
  )
    return null;
  const parts = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  )!;
  const [, year, month, day, hour, minute, second = "0"] = parts;
  if (
    +month < 1 ||
    +month > 12 ||
    +day < 1 ||
    +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59
  )
    return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
export function normalize(tables: TableSource[], pseudonymize: boolean) {
  const events: ProcessEvent[] = [];
  const issues: { source: string; row: number; message: string }[] = [];
  const actors = new Map<string, string>();
  const seen = new Set<string>();
  let duplicates = 0;
  for (const table of tables) {
    const mapping = table.mapping;
    const selected = Object.values(mapping).filter(Boolean);
    if (
      fields.some((f) => f.required && !mapping[f.id]) ||
      new Set(selected).size !== selected.length
    ) {
      issues.push({
        source: table.name,
        row: 1,
        message:
          "Pflichtfelder zuordnen; jede Quellspalte darf nur einmal verwendet werden.",
      });
      continue;
    }
    table.rows.forEach((row, i) => {
      const get = (f: Field) =>
        (row[table.headers.indexOf(mapping[f])] || "").trim();
      const caseId = get("caseId"),
        activity = get("activity"),
        timestamp = parseTimestamp(get("timestamp"), table.dateFormat);
      if (!caseId || !activity || !timestamp) {
        issues.push({
          source: table.name,
          row: i + 2,
          message: !timestamp
            ? "Zeitpunkt fehlt oder ist ungültig."
            : "Vorgangs-ID oder Aktivität fehlt.",
        });
        return;
      }
      let actor = get("actor");
      if (pseudonymize && actor) {
        if (!actors.has(actor))
          actors.set(
            actor,
            `ROLLE_${String(actors.size + 1).padStart(3, "0")}`,
          );
        actor = actors.get(actor)!;
      }
      const rawCost = get("cost");
      const cost = rawCost
        ? Number(
            rawCost
              .replace(/€/g, "")
              .replace(/\s/g, "")
              .replace(/\.(?=\d{3}(?:\D|$))/g, "")
              .replace(",", "."),
          )
        : undefined;
      if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
        issues.push({
          source: table.name,
          row: i + 2,
          message: "Kosten sind keine gültige positive Zahl.",
        });
        return;
      }
      const event = {
        caseId,
        activity,
        timestamp,
        actor: actor || undefined,
        system: get("system") || undefined,
        cost,
        source: table.name,
        row: i + 2,
      };
      const fingerprint = JSON.stringify([
        caseId,
        activity,
        timestamp,
        actor,
        event.system,
        cost,
      ]);
      if (seen.has(fingerprint)) {
        duplicates++;
        return;
      }
      seen.add(fingerprint);
      events.push(event);
    });
  }
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { events, issues, duplicates };
}
export function summarizeEvents(events: ProcessEvent[]) {
  const cases = new Map<string, ProcessEvent[]>();
  for (const event of events) {
    const list = cases.get(event.caseId) || [];
    list.push(event);
    cases.set(event.caseId, list);
  }
  const variants = new Map<string, { steps: string[]; count: number }>();
  const edges = new Map<
    string,
    { from: string; to: string; count: number; totalMs: number }
  >();
  let totalDuration = 0;
  for (const sequence of cases.values()) {
    sequence.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const steps = sequence.map((e) => e.activity),
      key = JSON.stringify(steps);
    variants.set(key, { steps, count: (variants.get(key)?.count || 0) + 1 });
    totalDuration +=
      Date.parse(sequence.at(-1)!.timestamp) -
      Date.parse(sequence[0].timestamp);
    sequence.slice(1).forEach((e, i) => {
      const previous = sequence[i],
        key = JSON.stringify([previous.activity, e.activity]);
      const edge = edges.get(key) || {
        from: previous.activity,
        to: e.activity,
        count: 0,
        totalMs: 0,
      };
      edge.count++;
      edge.totalMs += Date.parse(e.timestamp) - Date.parse(previous.timestamp);
      edges.set(key, edge);
    });
  }
  return {
    cases: cases.size,
    activities: new Set(events.map((e) => e.activity)).size,
    actors: new Set(events.map((e) => e.actor).filter(Boolean)).size,
    variants: [...variants.values()].sort((a, b) => b.count - a.count),
    edges: [...edges.values()].sort(
      (a, b) => b.totalMs / b.count - a.totalMs / a.count,
    ),
    averageDurationMs: cases.size ? totalDuration / cases.size : 0,
  };
}
export function readiness(
  events: ProcessEvent[],
  knowledge: KnowledgeSource[],
  rules: ImportRule[],
) {
  const total = events.length;
  return [
    { label: "Vorgänge, Aktivitäten und Zeiten", value: total ? 1 : 0 },
    {
      label: "Personen / Rollen",
      value: total ? events.filter((e) => e.actor).length / total : 0,
    },
    {
      label: "Quellsysteme",
      value: total ? events.filter((e) => e.system).length / total : 0,
    },
    {
      label: "Kosten",
      value: total
        ? events.filter((e) => e.cost !== undefined).length / total
        : 0,
    },
    { label: "Begleitdokumente", value: knowledge.length ? 1 : 0 },
    {
      label: "Bestätigter Prozesskontext",
      value: rules.some((r) => r.answer.trim()) ? 1 : 0,
    },
  ];
}
