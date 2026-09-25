import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  makeTable,
  parseCSV,
  parseTimestamp,
  normalize,
  summarizeEvents,
  readiness,
} from "../src/imports/model.ts";
import { parseImportFile } from "../src/imports/parsers.ts";
import { allowedPages, resolvePage } from "../src/auth/users.ts";

test("real XLSX dates and DOCX text become normalized events and knowledge", async () => {
  const xlsx = await readFile(
    new URL("./fixtures/imports/auftraege.xlsx", import.meta.url),
  );
  const parsed = await parseImportFile(new File([xlsx], "auftraege.xlsx"));
  const { events } = normalize(parsed.tables, false);
  assert.equal(events.length, 2);
  assert.equal(events[0].timestamp, "2026-09-24T08:00:00.000Z");
  const docx = await readFile(
    new URL("./fixtures/imports/freigabe.docx", import.meta.url),
  );
  const knowledge = await parseImportFile(new File([docx], "freigabe.docx"));
  assert.match(knowledge.knowledge[0].text, /20000 EUR/);
});

test("CSV handles German exports, quoted delimiters, escaped quotes and multiline cells", () => {
  const rows = parseCSV(
    '\uFEFFAuftrag;Aktivität;Zeitpunkt\r\n1;"Prüfen; Rückfrage";24.09.2026 08:00\r\n2;"Text ""A""\nzweite Zeile";24.09.2026 09:00',
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], "Prüfen; Rückfrage");
  assert.equal(rows[2][1], 'Text "A"\nzweite Zeile');
  assert.throws(() => parseCSV('ID;Name\n1;"offen'), /Anführungszeichen/);
  assert.throws(
    () =>
      makeTable("bad.csv", [
        ["ID", "ID"],
        ["1", "2"],
      ]),
    /eindeutige/,
  );
});
test("date parser rejects invalid calendar dates and respects explicit offsets and selected date order", () => {
  assert.equal(parseTimestamp("31.02.2026 10:00", "dmy"), null);
  assert.equal(parseTimestamp("2026-13-10T10:00:00Z", "dmy"), null);
  assert.equal(
    parseTimestamp("09/24/2026 08:30", "mdy"),
    "2026-09-24T08:30:00.000Z",
  );
  assert.equal(
    parseTimestamp("2026-09-24T08:30:00+02:00", "dmy"),
    "2026-09-24T06:30:00.000Z",
  );
});
test("mapping normalization reports invalid rows, removes exact duplicates and pseudonymizes consistently", () => {
  const t = makeTable(
    "orders.csv",
    parseCSV(
      "Auftrag;Aktivität;Zeitpunkt;Mitarbeiter;Kosten\n1;Start;2026-09-24T08:00:00Z;Anna;12,50\n1;Ende;2026-09-24T09:00:00Z;Anna;0\n1;Ende;2026-09-24T09:00:00Z;Anna;0\n2;Start;kein Datum;Ben;4",
    ),
  );
  const result = normalize([t], true);
  assert.equal(result.events.length, 2);
  assert.equal(result.duplicates, 1);
  assert.equal(result.issues[0].row, 5);
  assert.equal(result.events[0].actor, result.events[1].actor);
  assert.equal(result.events[0].actor, "ROLLE_001");
  assert.equal(result.events[0].cost, 12.5);
  t.mapping.activity = t.mapping.caseId;
  assert.equal(normalize([t], false).events.length, 0);
});
test("observed process variants retain loops and calculate gaps using case-local ordering", () => {
  const table = makeTable(
    "events.csv",
    parseCSV(
      "case_id,activity,timestamp\nA,Ende,2026-09-24T10:00:00Z\nA,Start,2026-09-24T08:00:00Z\nB,Start,2026-09-24T08:00:00Z\nB,Start,2026-09-24T09:00:00Z\nB,Ende,2026-09-24T11:00:00Z",
    ),
  );
  const { events } = normalize([table], false);
  const stats = summarizeEvents(events);
  assert.equal(stats.cases, 2);
  assert.equal(stats.variants.length, 2);
  assert.equal(stats.averageDurationMs, 2.5 * 3600000);
  assert.ok(stats.edges.some((e) => e.from === "Start" && e.to === "Start"));
  assert.equal(
    readiness(events, [], []).find((c) => c.label === "Kosten")?.value,
    0,
  );
});
test("file parser accepts flat JSON and text, refuses nested JSON and unsupported formats", async () => {
  const parsed = await parseImportFile(
    new File(
      [
        JSON.stringify([
          { case_id: "1", activity: "Start", timestamp: "2026-09-24" },
        ]),
      ],
      "events.json",
    ),
  );
  assert.equal(normalize(parsed.tables, false).events.length, 1);
  const doc = await parseImportFile(
    new File(["Freigabe ab 20000 EUR"], "regel.txt"),
  );
  assert.equal(doc.knowledge[0].text, "Freigabe ab 20000 EUR");
  await assert.rejects(
    parseImportFile(new File(['[{"x":{"y":1}}]'], "nested.json")),
    /Verschachtelte/,
  );
  await assert.rejects(parseImportFile(new File(["x"], "legacy.xls")), /XLSX/);
  await assert.rejects(parseImportFile(new File([], "empty.csv")), /leer/);
});
test("data import is available to management and department leads, not employee routes", () => {
  assert.ok(allowedPages("management").includes("import"));
  assert.ok(allowedPages("department_lead").includes("import"));
  assert.equal(resolvePage("employee", "/app/import"), "home");
});
