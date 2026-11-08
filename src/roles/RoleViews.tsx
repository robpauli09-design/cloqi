import { useEffect, useRef, useState } from "react";
import {useBackend} from '../backend/BackendProvider';
import {requestAI} from '../services/api';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  Package,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { Page, Task } from "../data";
import type { DemoUser } from "../auth/users";
import { IconBox, Modal } from "../App";

export const stations = [
  {
    id: "infeed",
    name: "Zuführung",
    short: "Zuführung",
    metric: "320 Stk./h",
    status: "Stabil",
    tone: "green",
    x: 15,
    y: 22,
  },
  {
    id: "machine",
    name: "Verpackungsmaschine",
    short: "Verpackung",
    metric: "95% OEE",
    status: "Stabil",
    tone: "green",
    x: 46,
    y: 17,
  },
  {
    id: "quality",
    name: "Qualitätskontrolle",
    short: "Kontrolle",
    metric: "98,2% i.O.",
    status: "Stabil",
    tone: "green",
    x: 78,
    y: 27,
  },
  {
    id: "label",
    name: "Etikettierung",
    short: "Etikettierung",
    metric: "310 Stk./h",
    status: "Stabil",
    tone: "green",
    x: 84,
    y: 66,
  },
  {
    id: "pallet",
    name: "Palettierung",
    short: "Palettierung",
    metric: "85% OEE",
    status: "Verbesserungspotenzial",
    tone: "orange",
    x: 51,
    y: 75,
  },
  {
    id: "shipping",
    name: "Versand",
    short: "Versand",
    metric: "3 Paletten/h",
    status: "Stabil",
    tone: "green",
    x: 16,
    y: 64,
  },
] as const;
type Station = (typeof stations)[number];
const documents = [
  {
    id: "start",
    title: "Schnellstart Linie 3",
    category: "Verpackung",
    updated: "Heute aktualisiert",
    body: "Vor dem Start das freigegebene Verpackungsprotokoll bereitlegen, Material und Kennzeichnung abgleichen und den dokumentierten Probelauf durchführen. Rückfragen mit der Schichtleitung klären.",
    pages: 4,
  },
  {
    id: "clean",
    title: "Reinigungsanleitung",
    category: "Reinigung",
    updated: "Version 2.1",
    body: "Nutze die für Linie 3 freigegebene Reinigungs- und Sicherheitsanweisung. Die Maschine vor Eingriffen nach den betrieblichen Vorgaben sichern. Durchführung und Freigabe in der Checkliste dokumentieren.",
    pages: 6,
  },
  {
    id: "quality",
    title: "Qualitätscheckliste",
    category: "Qualität",
    updated: "Version 3.0",
    body: "Prüfzeitpunkt, Charge, freigegebene Prüfkriterien und Ergebnis dokumentieren. Abweichungen an die Qualitätsverantwortlichen melden; Produktfreigaben erfolgen nur durch berechtigte Personen.",
    pages: 2,
  },
];
const questions = [
  "Wie stelle ich die Verpackungsmaschine ein?",
  "Was tun bei einer Störung?",
  "Zeige mir die Reinigungsanleitung.",
];
export function roleAnswer(question: string) {
  const q = question.toLowerCase();
  if (/reinig|säuber/.test(q))
    return "Die Reinigungsanleitung findest du unter Wissen. Verwende die freigegebene Anweisung für Linie 3 und sichere die Maschine vor Eingriffen gemäß den betrieblichen Vorgaben. Dokumentiere die Reinigung anschließend in deiner Checkliste.";
  if (/störung|problem|palett/.test(q))
    return "Stelle gemäß der gültigen Betriebsanweisung einen sicheren Zustand her und informiere Sarah Berger. Dokumentiere die angezeigte Meldung und den Zeitpunkt. Greife nicht in laufende Anlagen ein und überbrücke keine Schutzeinrichtungen. Die weitere Prüfung übernimmt die zuständige Fachperson.";
  if (/einstell|maschine/.test(q))
    return "Für Linie 3 gilt das freigegebene Verpackungsprotokoll. Gleiche Produkt, Folientyp und die dokumentierten Einstellungen ab. Stimme Änderungen mit der Schichtleitung ab und dokumentiere den vorgesehenen Probelauf. Die Demo enthält keine verbindlichen Maschinenparameter.";
  return "Für deinen Bereich Verpackung findest du Aufgaben, Stationsstatus und die passenden Dokumente in CLOQI. Beschreibe deine Beobachtung mit Linie, Zeitpunkt und angezeigter Meldung. So kann die Abteilungsleitung den nächsten Schritt gezielt mit dir abstimmen.";
}
function Chain({
  active,
  onSelect,
  employee = false,
}: {
  active: string;
  onSelect: (station: Station) => void;
  employee?: boolean;
}) {
  return (
    <div className="role-chain" aria-label="Prozesskette">
      {stations.map((station, index) => (
        <button
          key={station.id}
          className={`${active === station.id ? "selected" : ""} ${!employee && station.id === "pallet" ? "attention" : ""}`}
          onClick={() => onSelect(station)}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>
            {employee
              ? station.short
              : station.name === "Verpackungsmaschine"
                ? "Verpackung"
                : station.name}
          </strong>
          {index < 5 && <ChevronRight size={14} />}
        </button>
      ))}
    </div>
  );
}
function TaskList({
  tasks,
  toggle,
}: {
  tasks: Task[];
  toggle: (id: string) => void;
}) {
  return (
    <div className="role-task-list">
      {tasks.map((task) => (
        <label key={task.id} className={task.done ? "is-done" : ""}>
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => toggle(task.id)}
          />
          <span className="task-check" aria-hidden="true">
            {task.done && <Check size={14} />}
          </span>
          <span className="role-task-copy">
            <strong>{task.title}</strong>
            <small>
              {task.priority} · {task.due}
            </small>
          </span>
          <span
            className={`task-priority ${task.priority === "Hoch" ? "high" : ""}`}
          >
            {task.priority}
          </span>
        </label>
      ))}
    </div>
  );
}
function Progress({ tasks }: { tasks: Task[] }) {
  const done = tasks.filter((task) => task.done).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  return (
    <section className="panel daily-progress">
      <div className="role-panel-heading">
        <h2>Tagesfortschritt</h2>
        <Target size={19} />
      </div>
      <div className="daily-progress-numbers">
        <span>
          {done} von {tasks.length} Aufgaben
        </span>
        <strong>{percent}%</strong>
      </div>
      <div
        className="role-progress"
        role="progressbar"
        aria-label="Tagesfortschritt"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      <p>
        {percent === 100
          ? "Alles erledigt. Danke für deinen Einsatz!"
          : "Jeder erledigte Schritt bringt dein Team weiter."}
      </p>
    </section>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="role-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
interface Props {
  user: DemoUser;
  page: Page;
  tasks: Task[];
  toggleTask: (id: string) => void;
  go: (page: Page) => void;
}
export function RoleViews({ user, page, tasks, toggleTask, go }: Props) {
  const {aiMode}=useBackend();
  const [busy,setBusy]=useState(false);
  const [chatError,setChatError]=useState('');
  const pending=useRef(false);
  const chatEnd=useRef<HTMLDivElement>(null);
  const employee = user.role === "employee";
  const [station, setStation] = useState<Station | null>(null);
  const [analysis, setAnalysis] = useState(false);
  const [document, setDocument] = useState<(typeof documents)[number] | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string; live?:boolean }>
  >([]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({block:'nearest'});},[messages,busy]);
  const [event, setEvent] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState("all");
  const select = (next: Station) => {
    setStation(next);
    setAnalysis(false);
  };
  async function ask(question: string) {
    if (!question.trim()||pending.current) return;
    const next=[...messages,{role:'user' as const,text:question.trim()}];
    setMessages(next);setChatError('');
    setInput("");
    go("ai");
    if(aiMode!=='live'){setMessages([...next,{role:'assistant',text:roleAnswer(question)}]);return;}
    pending.current=true;setBusy(true);
    try {const result=await requestAI({action:'chat',messages:next.slice(-12).map(m=>({role:m.role,content:m.text.slice(0,4000)})),context:{tasks,mission:0}});setMessages([...next,{role:'assistant',text:result.text,live:true}]);}
    catch(error){setChatError(error instanceof Error?error.message:'Die Anfrage ist fehlgeschlagen.');setInput(question);}
    finally{pending.current=false;setBusy(false);}
  }
  const docs = (
    <div className="role-documents">
      {documents
        .filter((doc) =>
          (doc.title + doc.category)
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map((doc) => (
          <button key={doc.id} onClick={() => setDocument(doc)}>
            <span className="document-icon">
              <FileText size={21} />
            </span>
            <span>
              <strong>{doc.title}</strong>
              <small>
                PDF · {doc.pages} Seiten · {doc.updated}
              </small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
    </div>
  );
  const departmentWorld = (
    <section className="world-card department-world">
      <div className="world-heading">
        <div>
          <span className="eyebrow">DEINE ABTEILUNGSWELT</span>
          <h2>Verpackung im Überblick.</h2>
        </div>
        <span className="role-status orange">
          <span />1 Potenzial
        </span>
      </div>
      <div className="department-stage">
        <img
          src="/assets/packaging-department.png"
          alt="Isometrischer Einblick in die Verpackungsabteilung mit sechs verbundenen Stationen"
        />
        {stations.map((s, i) => (
          <button
            key={s.id}
            onClick={() => select(s)}
            className={`station-hotspot ${s.tone}`}
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
            aria-label={`${s.name}: ${s.status}, ${s.metric}`}
          >
            <b>{String(i + 1).padStart(2, "0")}</b>
            <span>
              <strong>{s.name}</strong>
              <small>
                <i />
                {s.metric}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="station-legend">
        <span>
          <i className="green" />
          Stabil
        </span>
        <span>
          <i className="yellow" />
          Abweichung
        </span>
        <span>
          <i className="orange" />
          Potenzial
        </span>
        <span>
          <i className="red" />
          Störung
        </span>
        <span>
          <i className="blue" />
          Information
        </span>
      </div>
      <Chain active="pallet" onSelect={select} />
    </section>
  );
  const employeeStation = (
    <section className="world-card employee-station">
      <div className="world-heading">
        <div>
          <span className="eyebrow">DEINE STATION HEUTE</span>
          <h2>
            Verpackung <span>Linie 3</span>
          </h2>
        </div>
        <span className="role-status green">
          <span />
          In Betrieb
        </span>
      </div>
      <div className="shift-strip">
        <span>
          <Clock3 size={15} />
          Schicht A <strong>06:00–14:00</strong>
        </span>
        <span>
          <Users size={15} />
          Sarah Berger · Abteilungsleitung
        </span>
      </div>
      <div className="employee-line">
        <img
          src="/assets/packaging-line.png"
          alt="Vereinfachte isometrische Ansicht der Verpackungslinie 3"
        />
        <button className="current-step" onClick={() => select(stations[2])}>
          <ShieldCheck size={17} />
          <span>
            DEIN AKTUELLER SCHRITT<strong>03 · Qualitätskontrolle</strong>
          </span>
          <ArrowUpRight size={16} />
        </button>
      </div>
      <Chain active="quality" onSelect={select} employee />
    </section>
  );
  return (
    <>
      {page === "home" && (
        <>
          <div className="greeting role-greeting">
            <div>
              <span className="eyebrow">
                {employee
                  ? "DEIN ARBEITSTAG. KLAR IM BLICK."
                  : "WIENER ZUCKER · VERPACKUNG"}
              </span>
              <h1>
                Guten Morgen, {employee ? "Lukas" : "Sarah"}
                <span className="green-text">!</span>
              </h1>
              <p>
                {employee ? (
                  <>
                    Schön, dass du da bist.
                    <br />
                    Hier findest du alles für deinen heutigen Einsatz.
                  </>
                ) : (
                  "Deine Abteilung. Dein Team. Alles auf einen Blick."
                )}
              </p>
            </div>
            <span className="shift-badge">
              <Clock3 size={16} />
              Schicht A · 06:00–14:00
            </span>
          </div>
          <div className={`role-home-grid ${employee ? "employee-grid" : ""}`}>
            <div className="role-main-stack">
              {employee ? employeeStation : departmentWorld}
              <section className="panel">
                <div className="role-panel-heading">
                  <div>
                    <span className="eyebrow">
                      {employee ? "SCHRITT FÜR SCHRITT" : "DAS STEHT AN"}
                    </span>
                    <h2>
                      {employee ? "Deine Aufgaben heute" : "Offene Aufgaben"}
                    </h2>
                  </div>
                  <button className="text-action" onClick={() => go("tasks")}>
                    Alle ansehen
                    <ArrowRight size={16} />
                  </button>
                </div>
                <TaskList tasks={tasks} toggle={toggleTask} />
              </section>
              {employee && (
                <section className="panel">
                  <div className="role-panel-heading">
                    <h2>Deine Dokumente</h2>
                    <button
                      className="text-action"
                      onClick={() => go("knowledge")}
                    >
                      Wissen öffnen
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  {docs}
                </section>
              )}
            </div>
            <aside className="role-side-stack">
              {employee ? (
                <>
                  <Progress tasks={tasks} />
                  <section className="film-notice">
                    <span className="notice-symbol">
                      <Info size={21} />
                    </span>
                    <span className="eyebrow">WICHTIG FÜR DEINE SCHICHT</span>
                    <h2>Neue Verpackungsfolie</h2>
                    <p>
                      Seit heute verwenden wir Rolle <strong>VZ-2026.</strong>
                    </p>
                    <p>Bitte auf die richtige Kennzeichnung achten.</p>
                    <button
                      className="text-action"
                      onClick={() => setDocument(documents[0])}
                    >
                      Hinweis ansehen
                      <ArrowRight size={16} />
                    </button>
                  </section>
                </>
              ) : (
                <>
                  <section className="panel department-performance">
                    <div className="role-panel-heading">
                      <h2>
                        Leistung deiner
                        <br />
                        Abteilung
                      </h2>
                      <TrendingUp size={19} />
                    </div>
                    <div className="oee-ring">
                      <div>
                        <strong>
                          84<span>%</span>
                        </strong>
                        <small>OEE · Aktuelle Schicht</small>
                      </div>
                    </div>
                    <div className="output-goal">
                      <span>
                        Aktueller Output<strong>12.480</strong>
                      </span>
                      <span>
                        Ziel<strong>15.000</strong>
                      </span>
                    </div>
                    <div className="role-progress">
                      <i style={{ width: "83.2%" }} />
                    </div>
                    <div className="role-kpi-pair">
                      <Metric label="Stillstand" value="42 min" />
                      <Metric label="Qualitätsquote" value="98,2%" />
                    </div>
                    <button
                      className="text-action"
                      onClick={() => go("analytics")}
                    >
                      Analysen ansehen
                      <ArrowRight size={16} />
                    </button>
                  </section>
                  <section className="panel">
                    <div className="role-panel-heading">
                      <h2>Aktuelle Ereignisse</h2>
                      <Clock3 size={18} />
                    </div>
                    <div className="role-events">
                      {[
                        ["10:24", "Palettierer Störung", "red"],
                        ["09:18", "Qualitätsprüfung abgeschlossen", "green"],
                        ["08:45", "Materialwechsel Linie 2", "blue"],
                        ["07:12", "Neue Charge gestartet", "green"],
                      ].map(([time, title, tone]) => (
                        <button
                          key={time}
                          onClick={() =>
                            title.includes("Palettierer")
                              ? select(stations[4])
                              : setEvent(`${time} · ${title}`)
                          }
                        >
                          <time>{time}</time>
                          <i className={tone} />
                          <span>{title}</span>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}
              <section className="role-ai-card">
                <img src="/assets/cloqi-green.png" alt="CLOQI hilft dir" />
                <span className="eyebrow">DEIN PROZESSBEGLEITER</span>
                <h2>Frag CLOQI.</h2>
                <p>Ich bin hier, wenn du Fragen hast.</p>
                <button className="button primary" onClick={() => go("ai")}>
                  CLOQI fragen
                  <Sparkles size={17} />
                </button>
              </section>
              {employee && (
                <div className="role-quick-questions">
                  {questions.map((question) => (
                    <button key={question} onClick={() => ask(question)}>
                      {question}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
      {page === "processes" && (
        <>
          <RoleHeading
            eyebrow="DEINE PROZESSE"
            title="Ein klarer Weg. Sechs Stationen."
            description="Alle Schritte deiner Verpackungsabteilung – vom Material bis zum Versand."
          />
          {departmentWorld}
          <div className="station-cards">
            {stations.map((s, i) => (
              <button
                className="panel station-card"
                key={s.id}
                onClick={() => select(s)}
              >
                <span className="eyebrow">
                  STATION {String(i + 1).padStart(2, "0")}
                </span>
                <IconBox tone={s.id === "pallet" ? "yellow" : "green"}>
                  <Package size={23} />
                </IconBox>
                <h2>{s.name}</h2>
                <span className={`role-status ${s.tone}`}>
                  <span />
                  {s.status}
                </span>
                <strong>{s.metric}</strong>
                <span className="text-action">
                  Details ansehen
                  <ArrowRight size={16} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {page === "station" && (
        <>
          <RoleHeading
            eyebrow="VERPACKUNG · LINIE 3"
            title="Deine Station. Dein Überblick."
            description="Arbeitsablauf, aktueller Schritt und Dokumente für deine heutige Schicht."
          />
          {employeeStation}
          <section className="panel role-station-info">
            <h2>Gut vorbereitet für die nächste Kontrolle.</h2>
            <p>
              Prüfe nach dem gültigen Prüfplan und dokumentiere Charge,
              Zeitpunkt und Ergebnis. Bei Abweichungen ist Sarah Berger deine
              Ansprechpartnerin.
            </p>
            <div className="connection-actions">
              <button
                className="button primary"
                onClick={() => setDocument(documents[2])}
              >
                Qualitätscheckliste öffnen
                <FileText size={17} />
              </button>
              <button
                className="button secondary"
                onClick={() => ask(questions[1])}
              >
                Hilfe bei einer Störung
                <Sparkles size={17} />
              </button>
            </div>
          </section>
        </>
      )}
      {page === "tasks" && (
        <>
          <RoleHeading
            eyebrow={employee ? "DEIN ARBEITSTAG" : "VERPACKUNG · AUFGABEN"}
            title={
              employee
                ? "Deine Aufgaben heute."
                : "Gemeinsam den nächsten Schritt machen."
            }
            description={
              employee
                ? "Deine Checkliste für Linie 3. Erledigte Schritte werden automatisch gespeichert."
                : "Alle offenen Schritte deiner Verpackungsabteilung."
            }
          />
          <div className="role-task-layout">
            <section className="panel">
              <div className="role-filter-tabs" aria-label="Aufgabenfilter">
                {[
                  ["all", "Alle"],
                  ["open", "Offen"],
                  ["done", "Erledigt"],
                ].map(([id, title]) => (
                  <button
                    key={id}
                    aria-pressed={taskFilter === id}
                    className={taskFilter === id ? "active" : ""}
                    onClick={() => setTaskFilter(id)}
                  >
                    {title}{" "}
                    <span>
                      {
                        tasks.filter(
                          (t) =>
                            id === "all" || (id === "done" ? t.done : !t.done),
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <TaskList
                tasks={tasks.filter(
                  (t) =>
                    taskFilter === "all" ||
                    (taskFilter === "done" ? t.done : !t.done),
                )}
                toggle={toggleTask}
              />
              {!tasks.some(
                (t) =>
                  taskFilter === "all" ||
                  (taskFilter === "done" ? t.done : !t.done),
              ) && (
                <p className="role-empty">
                  <CheckCheck size={28} />
                  Hier gibt es gerade keine Aufgaben.
                </p>
              )}
            </section>
            <Progress tasks={tasks} />
          </div>
        </>
      )}
      {page === "analytics" && (
        <>
          <RoleHeading
            eyebrow="VERPACKUNG · ANALYSEN"
            title="Verstehen, was deine Abteilung bewegt."
            description="Demo-Auswertung der aktuellen Schicht. Alle Kennzahlen beziehen sich auf Verpackung."
          />
          <div className="role-metric-grid">
            <Metric label="OEE" value="84%" detail="Ziel: 90%" />
            <Metric
              label="Aktueller Output"
              value="12.480"
              detail="Ziel: 15.000"
            />
            <Metric
              label="Stillstand"
              value="42 min"
              detail="Aktuelle Schicht"
            />
            <Metric
              label="Qualitätsquote"
              value="98,2%"
              detail="Freigegebene Prüfungen"
            />
          </div>
          <div className="role-analytics-grid">
            <section className="panel">
              <div className="role-panel-heading">
                <h2>Output im Schichtverlauf</h2>
                <span className="demo-badge">Beispieldaten</span>
              </div>
              <div
                className="role-chart"
                aria-label="Stündlicher Output: 06 Uhr 1420, 07 Uhr 1660, 08 Uhr 1840, 09 Uhr 1690, 10 Uhr 1570, 11 Uhr 2100, 12 Uhr 2200"
              >
                {[1420, 1660, 1840, 1690, 1570, 2100, 2200].map((value, i) => (
                  <div key={i}>
                    <span>{value.toLocaleString("de-AT")}</span>
                    <i style={{ height: `${value / 12}px` }} />
                    <small>{String(i + 6).padStart(2, "0")}:00</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel role-insight">
              <IconBox tone="yellow">
                <Sparkles size={24} />
              </IconBox>
              <span className="eyebrow">CLOQI INSIGHT · DEMO</span>
              <h2>Ein genauer Blick auf die Palettierung lohnt sich.</h2>
              <p>
                Die Palettierung läuft seit drei Schichten langsamer als üblich.
                Prüfe die dokumentierten Stillstände gemeinsam mit dem Team.
              </p>
              <button
                className="button primary"
                onClick={() => select(stations[4])}
              >
                Palettierung ansehen
                <ArrowRight size={17} />
              </button>
            </section>
          </div>
        </>
      )}
      {page === "team" && (
        <>
          <RoleHeading
            eyebrow="VERPACKUNG · TEAM"
            title="Menschen, die gemeinsam etwas bewegen."
            description="Deine Ansprechpartnerinnen und Ansprechpartner in der Verpackungsabteilung."
          />
          <div className="role-team-grid">
            {[
              [
                "SB",
                "Sarah Berger",
                "Abteilungsleiterin Verpackung",
                "Abteilung",
              ],
              ["LH", "Lukas Huber", "Mitarbeiter Produktion", "Linie 3"],
              ["MK", "Mia Keller", "Qualitätssicherung", "Linie 3"],
              ["DW", "David Wagner", "Schichtkoordination", "Linie 2"],
            ].map(([initials, name, position, area]) => (
              <section className="panel role-member" key={name}>
                <span className="avatar peach">{initials}</span>
                <span className="role-status green">
                  <span />
                  Schicht A
                </span>
                <h2>{name}</h2>
                <p>{position}</p>
                <small>Verpackung · {area}</small>
                <button
                  className="text-action"
                  onClick={() =>
                    setEvent(
                      `${name} · ${position} · Verpackung · ${area}. Kontakt über den vor Ort vereinbarten Schichtkanal. Diese Demo versendet keine Nachrichten.`,
                    )
                  }
                >
                  Profil ansehen
                  <ArrowRight size={16} />
                </button>
              </section>
            ))}
          </div>
        </>
      )}
      {page === "knowledge" && (
        <>
          <RoleHeading
            eyebrow="VERPACKUNG · WISSEN"
            title="Die richtige Antwort. Zur richtigen Zeit."
            description="Dokumente und Checklisten für deinen Bereich. Die Vorschauen sind Beispieldokumente."
          />
          <section className="panel">
            <div className="role-document-search">
              <Search size={18} />
              <input
                aria-label="Dokumente durchsuchen"
                placeholder="Dokumente durchsuchen …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  aria-label="Dokumentsuche leeren"
                  onClick={() => setSearch("")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {docs}
            {!documents.some((doc) =>
              (doc.title + doc.category)
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p className="role-empty">Keine Dokumente gefunden.</p>}
          </section>
          <section className="role-knowledge-note">
            <ShieldCheck size={23} />
            <p>
              Für die Arbeit an der Anlage gelten immer die freigegebenen
              Betriebs- und Sicherheitsanweisungen vor Ort.
            </p>
          </section>
        </>
      )}
      {page === "ai" && (
        <>
          <RoleHeading
            eyebrow={
              employee
                ? "DEIN PERSÖNLICHER PROZESSBEGLEITER"
                : "VERPACKUNG · CLOQI AI"
            }
            title="Frag CLOQI."
            description="Ich bin hier, wenn du Fragen hast. Gemeinsam finden wir den nächsten Schritt."
          />
          <div className="role-chat-layout">
            <section className="panel role-chat">
              <div className="role-chat-header">
                <span className="avatar green">
                  <Sparkles size={22} />
                </span>
                <div>
                  <strong>CLOQI</strong>
                  <small>
                    Verpackung{employee ? " · Linie 3" : ""} ·{" "}
                    {aiMode === "live" ? "Echte KI" : "Demo-Assistent"}
                  </small>
                </div>
                <span className="demo-badge">{aiMode==='live'?'OpenAI · Live':'Mock-Antworten'}</span>
              </div>
              <div className="role-chat-messages" role="log" aria-live="polite">
                {messages.length === 0 ? (
                  <div className="role-chat-welcome">
                    <img
                      src="/assets/cloqi-green.png"
                      alt="CLOQI, dein Prozessbegleiter"
                    />
                    <h2>Hallo, {user.name.split(" ")[0]}!</h2>
                    <p>Was kann ich für dich tun?</p>
                    {questions.map((question) => (
                      <button key={question} onClick={() => ask(question)}>
                        {question}
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div
                      className={`role-chat-message ${message.role}`}
                      key={index}
                    >
                      <strong>
                        {message.role === "user" ? user.name : "CLOQI"}
                      </strong>
                      <p>{message.text}</p>
                      {message.role === "assistant" && (
                        <small>
                          {message.live?'OpenAI-Antwort · Beispieldaten':'Vorbereitete Demo-Antwort · Keine Maschinensteuerung'}
                        </small>
                      )}
                    </div>
                  ))
                )}
                {busy&&<p role="status">CLOQI denkt nach …</p>}<div ref={chatEnd}/>
              </div>
              {chatError&&<p className="ai-error-message" role="alert">{chatError}</p>}
              <form
                className="role-chat-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
              >
                <input
                  aria-label="Frage an CLOQI"
                  placeholder="Stelle CLOQI eine Frage …"
                  maxLength={4000}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button
                  className="button primary"
                  disabled={!input.trim()||busy}
                  aria-label="Frage senden"
                >
                  <Send size={18} />
                </button>
              </form>
            </section>
            <aside className="panel role-chat-context">
              <span className="eyebrow">DEIN KONTEXT</span>
              <h2>
                Genau dort,
                <br />
                wo du arbeitest.
              </h2>
              <p>
                Wiener Zucker
                <br />
                <strong>Verpackung{employee ? " · Linie 3" : ""}</strong>
              </p>
              <span>
                <Workflow size={17} />6 Prozessschritte
              </span>
              <span>
                <CheckCheck size={17} />
                {tasks.filter((t) => !t.done).length} offene Aufgaben
              </span>
              <button className="text-action" onClick={() => go("knowledge")}>
                Wissen öffnen
                <ArrowRight size={16} />
              </button>
            </aside>
          </div>
        </>
      )}
      <div className="role-footer">
        <span>Kleine Schritte. Große Wirkung.</span>
        <span>
          Beispieldaten · Wiener Zucker · Verpackung
          {employee ? " · Linie 3" : ""}
        </span>
      </div>
      {station && (
        <Modal title={station.name} onClose={() => setStation(null)} wide>
          <nav className="role-breadcrumbs" aria-label="Stationspfad"><button onClick={()=>{setStation(null);go('home');}}>Wiener Zucker</button><ChevronRight size={13}/><button onClick={()=>{setStation(null);go('home');}}>Verpackung</button><ChevronRight size={13}/><span>Linie 3</span><ChevronRight size={13}/><span>{station.name}</span></nav>
          <div className="station-detail-heading">
            <span className={`role-status ${station.tone}`}>
              <span />
              {station.status}
            </span>
            <span>Verpackung · Linie 3</span>
          </div>
          <div className="station-detail-metrics">
            <Metric
              label="OEE"
              value={station.id === "pallet" ? "85%" : "95%"}
            />
            <Metric
              label="Durchsatz"
              value={
                station.id === "pallet" ? "280 Paletten/h" : station.metric
              }
            />
            <Metric
              label="Stillstand"
              value={station.id === "pallet" ? "18 min" : "0 min"}
            />
            <Metric
              label="Fehler"
              value={station.id === "pallet" ? "3" : "0"}
            />
            <Metric label="Letzte Wartung" value="08:42" />
          </div>
          <div className="station-insight">
            <Sparkles size={22} />
            <div>
              <strong>CLOQI Insight · Demo</strong>
              <p>
                {station.id === "pallet"
                  ? "Die Palettierung läuft seit drei Schichten langsamer als üblich."
                  : "Diese Station läuft in der aktuellen Beispielschicht stabil. Halte Beobachtungen und Abweichungen im Schichtprotokoll fest."}
              </p>
            </div>
          </div>
          {analysis && (
            <div className="station-analysis" role="status">
              <h3>Gemeinsam die Ursache eingrenzen.</h3>
              <ol>
                <li>
                  Stillstandszeiten und angezeigte Meldungen im Schichtprotokoll
                  vergleichen.
                </li>
                <li>
                  Materialübergabe und dokumentierte Wartung mit den
                  Verantwortlichen prüfen.
                </li>
                <li>
                  Maßnahmen abstimmen und ihre Wirkung in der nächsten Schicht
                  beobachten.
                </li>
              </ol>
              <p>
                Vorbereitete Demo-Analyse. Keine gemessene Ursache oder
                technische Freigabe.
              </p>
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                setStation(null);
                go("tasks");
              }}
            >
              Aufgaben ansehen
            </button>
            <button
              className="button primary"
              onClick={() => setAnalysis(true)}
            >
              <Sparkles size={17} />
              {analysis ? "Analyse angezeigt" : "Problem analysieren"}
            </button>
          </div>
          <p className="form-hint">
            Illustrative Stationswerte · keine Live-Messung.
          </p>
        </Modal>
      )}
      {document && (
        <Modal title={document.title} onClose={() => setDocument(null)}>
          <div className="document-preview-label">
            <FileText size={30} />
            <span>
              PDF-Vorschau · {document.pages} Seiten
              <br />
              {document.category} · Linie 3
            </span>
          </div>
          <p className="document-preview-body">{document.body}</p>
          <div className="ai-connection-note">
            Prototyp-Vorschau. Das originale, freigegebene Dokument wird später
            mit dem Wissenssystem verbunden.
          </div>
          <button className="button primary" onClick={() => setDocument(null)}>
            Verstanden
            <Check size={17} />
          </button>
        </Modal>
      )}
      {event && (
        <Modal
          title="Information aus deiner Abteilung"
          onClose={() => setEvent(null)}
        >
          <p className="document-preview-body">{event}</p>
          <p className="form-hint">Beispielinformation · Verpackung</p>
          <button className="button primary" onClick={() => setEvent(null)}>
            Schließen
          </button>
        </Modal>
      )}
    </>
  );
}
function RoleHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="content-heading">
      <div className="page-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
