import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  FolderUp,
  HelpCircle,
  Link2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Upload,
  X,
  Workflow,
} from "lucide-react";
import type { DemoUser } from "../auth/users";
import { fields, normalize, readiness, summarizeEvents } from "./model";
import type {
  ImportedProcess,
  ImportRule,
  KnowledgeSource,
  TableSource,
} from "./model";
import { listImports, saveImport } from "./store";
import { Modal } from "../App";
import "./imports.css";
const areas = [
  "Vertrieb",
  "Einkauf",
  "Buchhaltung",
  "Produktion",
  "Verpackung",
  "Kundenservice",
  "HR",
];
const steps = ["Bereich", "Datenquelle", "Zuordnung", "Kontext", "Übernehmen"];
const questions = [
  "Welche Freigaben oder Ausnahmen müssen wir berücksichtigen?",
  "Wo hakt es im Alltag – und warum?",
  "Welche Zielzeiten (SLA) oder Kostenregeln gelten?",
];
const sample =
  "Auftragsnummer;Aktivität;Zeitpunkt;Rolle;System;Kosten\nA-100;Auftrag erhalten;2026-09-21T08:00:00Z;Vertrieb;CRM;0\nA-100;Angebot erstellt;2026-09-21T09:00:00Z;Vertrieb;ERP;15\nA-100;Freigabe;2026-09-21T13:00:00Z;Leitung;ERP;8\nA-100;Versand;2026-09-22T08:00:00Z;Logistik;ERP;12\nA-101;Auftrag erhalten;2026-09-21T09:00:00Z;Vertrieb;CRM;0\nA-101;Angebot erstellt;2026-09-21T10:30:00Z;Vertrieb;ERP;15\nA-101;Freigabe;2026-09-21T12:00:00Z;Leitung;ERP;8\nA-101;Versand;2026-09-22T09:00:00Z;Logistik;ERP;12\nA-102;Auftrag erhalten;2026-09-21T10:00:00Z;Vertrieb;CRM;0\nA-102;Angebot erstellt;2026-09-21T11:00:00Z;Vertrieb;ERP;15\nA-102;Angebot erstellt;2026-09-21T12:00:00Z;Vertrieb;ERP;15\nA-102;Freigabe;2026-09-22T08:00:00Z;Leitung;ERP;8";
const duration = (ms: number) =>
  ms < 3600000
    ? `${Math.round(ms / 60000)} Min.`
    : `${(ms / 3600000).toLocaleString("de-AT", { maximumFractionDigits: 1 })} Std.`;
function Coverage({
  events,
  knowledge,
  rules,
}: Pick<ImportedProcess, "events" | "knowledge" | "rules">) {
  const checks = readiness(events, knowledge, rules);
  const score = Math.round(
    (checks.reduce((n, c) => n + c.value, 0) / checks.length) * 100,
  );
  return (
    <section className="import-coverage">
      <div>
        <span className="eyebrow">DATENBEREITSCHAFT</span>
        <strong>
          {score}
          <small>%</small>
        </strong>
        <p>
          Abdeckung der sechs Informationsbereiche. Keine Bewertung der
          Prozessqualität.
        </p>
      </div>
      <ul>
        {checks.map((c) => (
          <li key={c.label}>
            <span className={c.value === 1 ? "complete" : ""}>
              {c.value === 1 ? <Check size={14} /> : <Plus size={14} />}
            </span>
            {c.label}
            <b>{Math.round(c.value * 100)}%</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
export function ProcessPreview({ process }: { process: ImportedProcess }) {
  const stats = useMemo(
    () => summarizeEvents(process.events),
    [process.events],
  );
  return (
    <div className="import-preview">
      <div className="import-stat-grid">
        {[
          [stats.cases, "Vorgänge"],
          [process.events.length, "Ereignisse"],
          [stats.activities, "Aktivitäten"],
          [stats.variants.length, "Varianten"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {stats.variants.length > 0 ? (
        <>
          <h3>Häufigster beobachteter Ablauf</h3>
          <div className="import-process-chain">
            {stats.variants[0].steps.map((step, i) => (
              <div key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
                {i < stats.variants[0].steps.length - 1 && (
                  <ArrowRight size={15} />
                )}
              </div>
            ))}
          </div>
          <p className="form-hint">
            {stats.variants[0].count} von {stats.cases} Vorgängen · Ø
            beobachtete Spanne: {duration(stats.averageDurationMs)}. Der letzte
            Eintrag muss kein Prozessabschluss sein.
          </p>
          <details>
            <summary>Alle {stats.variants.length} Varianten ansehen</summary>
            {stats.variants.map((v, i) => (
              <p key={i}>
                <b>{v.count}×</b> {v.steps.join(" → ")}
              </p>
            ))}
          </details>
          {stats.edges[0] && (
            <div className="import-observation">
              <Workflow size={22} />
              <div>
                <strong>Hier lohnt sich ein genauerer Blick</strong>
                <p>
                  Zwischen „{stats.edges[0].from}“ und „{stats.edges[0].to}“
                  liegen im Mittel{" "}
                  {duration(stats.edges[0].totalMs / stats.edges[0].count)} (
                  {stats.edges[0].count} Übergänge). Das ist ein Zeitabstand,
                  keine nachgewiesene Wartezeit oder Ursache.
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="import-info">
          Dokumentenimport: Dein Wissen wird gespeichert. Für einen gemessenen
          Ist-Prozess fehlen Ereignisdaten mit Vorgangs-ID, Aktivität und
          Zeitpunkt.
        </p>
      )}
      <Coverage {...process} />
      {process.knowledge.length > 0 && (
        <section>
          <h3>Unternehmenswissen · {process.knowledge.length} Dokumente</h3>
          {process.knowledge.map((doc) => (
            <details key={doc.id}>
              <summary>
                {doc.name} · {doc.text.length.toLocaleString("de-AT")} Zeichen
              </summary>
              <p className="import-document-text">{doc.text}</p>
            </details>
          ))}
        </section>
      )}
      {process.rules.some((r) => r.answer) && (
        <section>
          <h3>Dein bestätigter Kontext</h3>
          {process.rules
            .filter((r) => r.answer)
            .map((r) => (
              <div key={r.question}>
                <strong>{r.question}</strong>
                <p>{r.answer}</p>
              </div>
            ))}
        </section>
      )}
      <p className="form-hint">
        Quellen: {process.sources.join(" · ")}.{" "}
        {process.id === "preview"
          ? "Vorgesehener lokaler Speicher für"
          : "Lokal gespeichert für"}{" "}
        {process.owner}; keine Cloud-Synchronisierung.
      </p>
    </div>
  );
}
export function ImportLibrary({
  user,
  onStart,
  knowledgeOnly = false,
}: {
  user: DemoUser;
  onStart: () => void;
  knowledgeOnly?: boolean;
}) {
  const [items, setItems] = useState<ImportedProcess[]>([]);
  const [selected, setSelected] = useState<ImportedProcess | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listImports(user.username)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.username]);
  return (
    <section className="import-library">
      <div className="import-library-heading">
        <div>
          <span className="eyebrow">DEINE UNTERNEHMENSDATEN</span>
          <h2>
            {knowledgeOnly
              ? "Importiertes Wissen"
              : "Eigene Prozesse & Importe"}
          </h2>
          <p>Aus vorhandenen Daten wird dein Prozessmodell.</p>
        </div>
        <button className="button primary" onClick={onStart}>
          <Plus size={17} />
          {knowledgeOnly ? "Dokumente importieren" : "Daten importieren"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {items.filter((p) => !knowledgeOnly || p.knowledge.length).length ===
      0 ? (
        <div className="import-library-empty">
          <FolderUp size={25} />
          <p>
            Deine Dateien haben schon viel zu erzählen.
            <br />
            <strong>
              Starte mit einem Export oder einer Arbeitsanweisung.
            </strong>
          </p>
        </div>
      ) : (
        <div className="import-library-grid">
          {items
            .filter((p) => !knowledgeOnly || p.knowledge.length)
            .map((p) => (
              <button
                className="panel"
                key={p.id}
                onClick={() => setSelected(p)}
              >
                <span className="eyebrow">{p.area} · LOKAL</span>
                <h3>{p.name}</h3>
                <p>
                  {p.events.length} Ereignisse · {p.knowledge.length} Dokumente
                </p>
                <span className="text-action">
                  Import ansehen
                  <ArrowUpRightIcon />
                </span>
              </button>
            ))}
        </div>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)} wide>
          <ProcessPreview process={selected} />
        </Modal>
      )}
    </section>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={16} />;
}
export function ImportFlow({
  user,
  onDone,
}: {
  user: DemoUser;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0),
    [area, setArea] = useState(user.department || "Vertrieb"),
    [name, setName] = useState("");
  const [source, setSource] = useState("files"),
    [tables, setTables] = useState<TableSource[]>([]),
    [knowledge, setKnowledge] = useState<KnowledgeSource[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false);
  const [pseudonymize, setPseudonymize] = useState(true),
    [skipInvalid, setSkipInvalid] = useState(false),
    [accepted, setAccepted] = useState(false),
    [rules, setRules] = useState<ImportRule[]>(
      questions.map((question) => ({ question, answer: "" })),
    ),
    [saved, setSaved] = useState<ImportedProcess | null>(null);
  const [systems, setSystems] = useState({ erp: "", crm: "", files: "" });
  const input = useRef<HTMLInputElement>(null);
  const reading = useRef(false);
  const generation = useRef(0);
  const saving = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const normalized = useMemo(
    () => normalize(tables, pseudonymize),
    [tables, pseudonymize],
  );
  const stats = useMemo(
    () => summarizeEvents(normalized.events),
    [normalized.events],
  );
  const mapped = tables.every(
    (t) =>
      fields.every((f) => !f.required || t.mapping[f.id]) &&
      new Set(Object.values(t.mapping).filter(Boolean)).size ===
        Object.values(t.mapping).filter(Boolean).length,
  );
  const usable =
    (normalized.events.length > 0 || knowledge.length > 0) &&
    mapped &&
    (!normalized.issues.length || skipInvalid);
  const preview: ImportedProcess = {
    id: "preview",
    owner: user.username,
    name: name.trim() || `${area} – Import`,
    area,
    createdAt: new Date().toISOString(),
    events: normalized.events,
    knowledge,
    rules,
    sources: [...tables.map((t) => t.name), ...knowledge.map((k) => k.name)],
    pseudonymized: pseudonymize,
  };
  async function readFiles(files: File[]) {
    if (reading.current) return;
    const version = generation.current;
    reading.current = true;
    setBusy(true);
    setErrors([]);
    const newTables: TableSource[] = [],
      newDocs: KnowledgeSource[] = [],
      failures: string[] = [];
    try {
      if (files.length + tables.length + knowledge.length > 10)
        throw new Error(
          "Bitte insgesamt maximal 10 Dateien bzw. Tabellenblätter wählen.",
        );
      const { parseImportFile } = await import("./parsers");
      for (const file of files) {
        try {
          const result = await parseImportFile(file);
          newTables.push(...result.tables);
          newDocs.push(...result.knowledge);
        } catch (e) {
          failures.push(
            `${file.name}: ${e instanceof Error ? e.message : "Datei konnte nicht gelesen werden."}`,
          );
        }
      }
      if (
        newTables.reduce((n, t) => n + t.rows.length, 0) +
          tables.reduce((n, t) => n + t.rows.length, 0) >
        10000
      )
        throw new Error(
          "Bitte insgesamt maximal 10.000 Ereigniszeilen importieren.",
        );
      if (
        newTables.length + newDocs.length + tables.length + knowledge.length >
        10
      )
        throw new Error(
          "Bitte insgesamt maximal 10 Dateien bzw. Tabellenblätter wählen.",
        );
      if (version === generation.current) {
        setTables((t) => [...t, ...newTables]);
        setKnowledge((k) => [...k, ...newDocs]);
        setErrors(failures);
        setAccepted(false);
      }
    } catch (e) {
      if (version === generation.current)
        setErrors([e instanceof Error ? e.message : "Import fehlgeschlagen."]);
    } finally {
      reading.current = false;
      if (version === generation.current) setBusy(false);
    }
  }
  function advance() {
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function commit() {
    if (saving.current || !accepted || !usable) return;
    saving.current = true;
    setBusy(true);
    setErrors([]);
    const record = { ...preview, id: crypto.randomUUID() };
    try {
      await saveImport(record);
      setSaved(record);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Speichern fehlgeschlagen."]);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const sourceLabel = (
    {
      files: "Dateien",
      microsoft: "Microsoft 365",
      database: "Datenbank",
      api: "REST / OData",
      unknown: "Noch gemeinsam zu klären",
    } as Record<string, string>
  )[source];
  const plan = `Importplan: ${area}\nQuelle: ${sourceLabel}\nERP: ${systems.erp || "Noch offen"}\nCRM: ${systems.crm || "Noch offen"}\nDokumentenablage: ${systems.files || "Noch offen"}\n\n1. Einen kleinen Export mit Vorgangs-ID, Aktivität und Zeitpunkt bereitstellen (CSV/XLSX/JSON).\n2. Rollen, Quellsystem und Kosten ergänzen, soweit vorhanden.\n3. Passende SOPs als PDF/DOCX/TXT ergänzen.\n4. Dateien in CLOQI prüfen und die Zuordnung bestätigen.\n\nEine direkte Verbindung und ein Local Data Gateway sind noch nicht eingerichtet. Für spätere Connectoren werden Datenumfang, Read-only-Berechtigungen und Betriebsort separat abgestimmt.`;
  if (saved)
    return (
      <div className="import-flow">
        <section className="panel import-success">
          <span className="import-success-icon">
            <CheckCircle2 size={36} />
          </span>
          <span className="eyebrow">DEIN WISSEN IST ANGEKOMMEN</span>
          <h1>{saved.name}</h1>
          <p>
            Der Import wurde in diesem Browser gespeichert. Du findest ihn unter
            Prozesse und seine Dokumente unter Wissen.
          </p>
          <button className="button primary" onClick={onDone}>
            Zu meinen Prozessen
            <ArrowRight size={17} />
          </button>
        </section>
        <ProcessPreview process={saved} />
      </div>
    );
  return (
    <div className="import-flow">
      <div className="import-heading">
        <div>
          <span className="eyebrow">DEINE DATEN. EIN KLARER ANFANG.</span>
          <h1>Aus Daten wird Überblick.</h1>
          <p>
            Bring mit, was du schon hast. Wir helfen dir beim nächsten Schritt.
          </p>
        </div>
        <span className="import-local">
          <LockKeyhole size={15} />
          Lokal in deinem Browser
        </span>
      </div>
      <ol className="import-stepper">
        {steps.map((label, i) => (
          <li
            key={label}
            className={i === step ? "current" : i < step ? "done" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={16} /> : i + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
      {step === 0 && (
        <section className="panel import-stage">
          <span className="eyebrow">01 · ZUERST DEIN ZIEL</span>
          <h2>Was möchtest du besser verstehen?</h2>
          <p>Wähle den Bereich, in dem du Prozesse sichtbar machen möchtest.</p>
          <div className="import-areas">
            {(user.department ? [user.department] : areas).map((a) => (
              <button
                key={a}
                className={area === a ? "selected" : ""}
                aria-pressed={area === a}
                onClick={() => setArea(a)}
              >
                <Workflow size={21} />
                {a}
                {area === a && <Check size={17} />}
              </button>
            ))}
          </div>
          <label className="import-label">
            Wie soll dein Prozess heißen?
            <input
              maxLength={100}
              value={name}
              placeholder={`Zum Beispiel: ${area === "Vertrieb" ? "Vom Auftrag zur Lieferung" : "Material prüfen und freigeben"}`}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="import-tip">
            <ShieldCheck size={22} />
            <p>
              <strong>Du behältst die Kontrolle.</strong> Erst nach deiner
              Prüfung wird gespeichert. Deine Dateien werden weder an OpenAI
              noch an einen Server gesendet.
            </p>
          </div>
        </section>
      )}
      {step === 1 && (
        <section className="panel import-stage">
          <span className="eyebrow">02 · MIT VORHANDENEM STARTEN</span>
          <h2>Wo liegen deine Daten?</h2>
          <div className="import-sources">
            {[
              {
                id: "files",
                label: "Dateien",
                sub: "Direkt einlesen",
                icon: FolderUp,
              },
              {
                id: "microsoft",
                label: "Microsoft 365",
                sub: "Import planen",
                icon: Cloud,
              },
              {
                id: "database",
                label: "Datenbank",
                sub: "Import planen",
                icon: Database,
              },
              {
                id: "api",
                label: "REST / OData",
                sub: "Import planen",
                icon: Link2,
              },
              {
                id: "unknown",
                label: "Ich weiß es nicht",
                sub: "Gemeinsam herausfinden",
                icon: HelpCircle,
              },
            ].map((s) => (
              <button
                key={s.id}
                className={source === s.id ? "selected" : ""}
                onClick={() => setSource(s.id)}
                aria-pressed={source === s.id}
              >
                <s.icon size={23} />
                <strong>{s.label}</strong>
                <small>{s.sub}</small>
              </button>
            ))}
          </div>
          {source === "files" ? (
            <>
              <div
                className={`import-dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void readFiles([...e.dataTransfer.files]);
                }}
              >
                <span>
                  <Upload size={30} />
                </span>
                <h3>Deine Dateien. Einfach hier hinein.</h3>
                <p>CSV, Excel (.xlsx), JSON, PDF, Word (.docx) und TXT</p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  {busy ? "Dateien werden gelesen …" : "Dateien auswählen"}
                  <Plus size={17} />
                </button>
                <input
                  ref={input}
                  type="file"
                  aria-label="Importdateien auswählen"
                  multiple
                  accept=".csv,.xlsx,.json,.pdf,.docx,.txt"
                  hidden
                  onChange={(e) => {
                    void readFiles([...(e.target.files || [])]);
                    e.target.value = "";
                  }}
                />
                <small>
                  Bis zu 10 Dateien / Tabellenblätter · 8 MB je Datei · 10.000
                  Ereigniszeilen insgesamt
                </small>
              </div>
              <button
                className="text-action import-sample"
                disabled={busy}
                onClick={() =>
                  void readFiles([
                    new File([sample], "Beispiel-Auftragsprozess.csv", {
                      type: "text/csv",
                    }),
                  ])
                }
              >
                Erst mit Beispieldaten ausprobieren
                <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <div className="import-connector">
              <h3>
                {source === "unknown"
                  ? "Finden wir den richtigen Einstieg."
                  : "Deine Verbindung vorbereiten."}
              </h3>
              <p>
                Direkte Systemverbindungen sind noch nicht verfügbar. Mit diesen
                Angaben erstellen wir einen konkreten Exportplan. Zugangsdaten
                brauchst du hier nicht.
              </p>
              <div className="import-form-grid">
                {[
                  ["erp", "Welches ERP oder Rechnungssystem nutzt ihr?"],
                  ["crm", "Wo bearbeitet ihr Kundenanfragen oder Aufträge?"],
                  ["files", "Wo liegen Arbeitsanweisungen und Dokumente?"],
                ].map(([id, label]) => (
                  <label className="import-label" key={id}>
                    {label}
                    <input
                      maxLength={120}
                      value={systems[id as keyof typeof systems]}
                      placeholder="Name oder „weiß ich noch nicht“"
                      onChange={(e) =>
                        setSystems({ ...systems, [id]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <details open>
                <summary>Dein Importplan</summary>
                <pre>{plan}</pre>
              </details>
              <button
                className="button secondary"
                onClick={() => setSource("files")}
              >
                Mit einem Dateiexport starten
                <ArrowRight size={17} />
              </button>
            </div>
          )}
          {(tables.length > 0 || knowledge.length > 0) && (
            <div className="import-files">
              {[
                ...tables.map((t) => ({
                  id: t.id,
                  name: t.name,
                  detail: `${t.rows.length} Zeilen · ${t.headers.length} Spalten`,
                  table: true,
                })),
                ...knowledge.map((k) => ({
                  id: k.id,
                  name: k.name,
                  detail: `Wissen · ${k.text.length.toLocaleString("de-AT")} Zeichen`,
                  table: false,
                })),
              ].map((f) => (
                <div key={f.id}>
                  <FileText size={20} />
                  <span>
                    <strong>{f.name}</strong>
                    <small>{f.detail}</small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`${f.name} entfernen`}
                    disabled={busy}
                    onClick={() => {
                      f.table
                        ? setTables((t) => t.filter((x) => x.id !== f.id))
                        : setKnowledge((k) => k.filter((x) => x.id !== f.id));
                      setAccepted(false);
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {step === 2 && (
        <section className="panel import-stage">
          <span className="eyebrow">03 · ERKENNEN UND BESTÄTIGEN</span>
          <h2>Passt diese Zuordnung?</h2>
          <p>
            Spaltennamen wurden lokal anhand typischer Bezeichnungen erkannt.
            Prüfe die Vorschläge – besonders IDs und Datumsformate.
          </p>
          {tables.map((t) => (
            <section className="import-mapping" key={t.id}>
              <h3>
                <FileText size={19} />
                {t.name}
              </h3>
              <div className="import-mapping-grid">
                {fields.map((f) => (
                  <label className="import-label" key={f.id}>
                    {f.label}
                    {f.required ? " *" : ""}
                    <select
                      value={t.mapping[f.id]}
                      onChange={(e) => {
                        setTables((list) =>
                          list.map((item) =>
                            item.id === t.id
                              ? {
                                  ...item,
                                  mapping: {
                                    ...item.mapping,
                                    [f.id]: e.target.value,
                                  },
                                }
                              : item,
                          ),
                        );
                        setSkipInvalid(false);
                        setAccepted(false);
                      }}
                    >
                      <option value="">
                        {f.required ? "Bitte zuordnen" : "Nicht vorhanden"}
                      </option>
                      {t.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="import-label import-date-format">
                Datumsformat für Zahlen mit Punkt / Schrägstrich
                <select
                  value={t.dateFormat}
                  onChange={(e) =>
                    setTables((list) =>
                      list.map((item) =>
                        item.id === t.id
                          ? {
                              ...item,
                              dateFormat: e.target.value as "dmy" | "mdy",
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="dmy">Tag · Monat · Jahr</option>
                  <option value="mdy">Monat · Tag · Jahr</option>
                </select>
              </label>
              <p className="form-hint">
                ISO-Zeitangaben mit Zeitzone bleiben erhalten. Zeiten ohne
                Zeitzone werden als UTC interpretiert. Bitte im Export eine
                Zeitzone ergänzen, falls relevant.
              </p>
              <div className="import-table-scroll">
                <table>
                  <caption>
                    Vorschau · erste {Math.min(4, t.rows.length)} Zeilen
                  </caption>
                  <thead>
                    <tr>
                      {t.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.slice(0, 4).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {knowledge.length > 0 && (
            <div className="import-info">
              {knowledge.length} Dokumente als Unternehmenswissen erkannt.
              Dokumente allein ergeben keine gemessenen Aktivitäten oder
              Zeitabstände.
            </div>
          )}
          <label className="import-check">
            <input
              type="checkbox"
              checked={pseudonymize}
              onChange={(e) => setPseudonymize(e.target.checked)}
            />
            <span>
              <strong>Personen / Rollen durch neutrale IDs ersetzen</strong>
              <small>
                Nur die zugeordnete Personenspalte. Freitext, IDs und Dokumente
                können weiterhin personenbezogene Angaben enthalten.
              </small>
            </span>
          </label>
          <p>
            {normalized.events.length} gültige Ereignisse ·{" "}
            {normalized.duplicates} identische Dubletten werden zusammengeführt.
          </p>
          {normalized.issues.length > 0 && (
            <div className="import-validation">
              <strong>
                {normalized.issues.length} Hinweise – bitte prüfen
              </strong>
              <ul>
                {normalized.issues.slice(0, 8).map((issue, i) => (
                  <li key={i}>
                    {issue.source}, Zeile {issue.row}: {issue.message}
                  </li>
                ))}
              </ul>
              {mapped && (
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={skipInvalid}
                    onChange={(e) => setSkipInvalid(e.target.checked)}
                  />
                  Fehlerhafte Zeilen bewusst auslassen (
                  {normalized.issues.length})
                </label>
              )}
            </div>
          )}
        </section>
      )}
      {step === 3 && (
        <section className="panel import-stage">
          <span className="eyebrow">04 · DAS WISSEN HINTER DEN ZAHLEN</span>
          <h2>Was deine Dateien nicht erzählen.</h2>
          <p>
            {stats.edges[0]
              ? `Zwischen „${stats.edges[0].from}“ und „${stats.edges[0].to}“ liegen im Mittel ${duration(stats.edges[0].totalMs / stats.edges[0].count)}. Dein Kontext hilft, diesen Abstand einzuordnen.`
              : "Ergänze die Regeln und Erfahrungen, die euren Prozess erklären."}{" "}
            Die Fragen entstehen aus deiner Vorschau, ohne KI-Aufruf.
          </p>
          <div className="import-interview">
            {rules.map((r, i) => (
              <label className="import-label" key={r.question}>
                <span>
                  <b>{String(i + 1).padStart(2, "0")}</b>
                  {r.question}
                </span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={r.answer}
                  placeholder="Optional – falls noch unbekannt, freilassen. Keine Passwörter oder Zugangsdaten."
                  onChange={(e) =>
                    setRules((values) =>
                      values.map((v, j) =>
                        i === j ? { ...v, answer: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <p className="form-hint">
            Deine Antworten bleiben als bestätigter Kontext erhalten. Daraus
            werden keine automatischen Freigaben oder Maschinenaktionen
            abgeleitet.
          </p>
        </section>
      )}
      {step === 4 && (
        <section className="panel import-stage">
          <span className="eyebrow">05 · BEREIT FÜR DEINEN ÜBERBLICK</span>
          <h2>{preview.name}</h2>
          <p>
            {area} · {preview.sources.length} Quellen ·{" "}
            {normalized.issues.length} ausgelassene Zeilen
          </p>
          <ProcessPreview process={preview} />
          <label className="import-check import-confirm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              Ich habe die Zuordnung, Zeitangaben und enthaltenen Daten geprüft
              und möchte diesen Import lokal speichern.
            </span>
          </label>
        </section>
      )}
      {errors.length > 0 && (
        <div className="import-errors" role="alert">
          {errors.map((error, i) => (
            <p key={i}>{error}</p>
          ))}
        </div>
      )}
      <footer className="import-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => (step ? setStep((s) => s - 1) : onDone())}
        >
          <ArrowLeft size={16} />
          {step ? "Zurück" : "Zu den Prozessen"}
        </button>
        <span>Schritt {step + 1} von 5</span>
        {step < 4 ? (
          <button
            className="button primary"
            disabled={
              busy ||
              (step === 1 && !tables.length && !knowledge.length) ||
              (step === 2 && !usable)
            }
            onClick={advance}
          >
            {step === 1
              ? "Daten prüfen"
              : step === 3
                ? "Vorschau ansehen"
                : "Weiter"}
            <ArrowRight size={17} />
          </button>
        ) : (
          <button
            className="button primary"
            disabled={busy || !accepted || !usable}
            onClick={() => void commit()}
          >
            {busy ? "Wird gespeichert …" : "Import übernehmen"}
            <Check size={17} />
          </button>
        )}
      </footer>
    </div>
  );
}
