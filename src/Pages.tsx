import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Search,
  Sparkles,
  Users,
  Workflow,
  ListTodo,
  Plus,
  BookOpen,
  ShieldCheck,
  Leaf,
  MessageSquare,
  TrendingUp,
  Target,
  CircleHelp,
  RotateCcw,
  Bell,
  Eye,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { processes, members, articles, chartData } from "./data";
import type { Page, Task } from "./data";
import { IconBox, Modal, processIcons } from "./App";
import { answerDemoQuestion } from "./services/demoAssistant";
import { useBackend } from "./backend/BackendProvider";
import { ConnectionSettings } from "./backend/ConnectionSettings";
import { requestAI, type AIResult } from "./services/api";
import { useAuth } from "./auth/AuthProvider";
export interface ContentProps {
  analyzed: string[];
  analysisResults: Record<string, AIResult>;
  onAnalyzed: (id: string, result?: AIResult) => void;
  selectedArticle: string | null;
  clearArticle: () => void;
  feedback: string[];
  addFeedback: (text: string) => void;
  page: Page;
  tasks: Task[];
  mission: number;
  selectedProcess: string | null;
  setSelectedProcess: (id: string | null) => void;
  openProcess: (id: string) => void;
  setTaskDetail: (task: Task) => void;
  completeTask: (id: string) => void;
  addProposal: (id: string, recommendation?: string) => void;
  go: (page: Page) => void;
  toast: (message: string) => void;
  notifications: boolean;
  setNotifications: (v: boolean) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
  reset: () => void;
}
export function ContentPages(props: ContentProps) {
  switch (props.page) {
    case "processes":
      return <Processes {...props} />;
    case "tasks":
      return <Tasks {...props} />;
    case "analytics":
      return <Analytics />;
    case "team":
      return (
        <Team
          tasks={props.tasks}
          toast={props.toast}
          entries={props.feedback}
          addFeedback={props.addFeedback}
        />
      );
    case "knowledge":
      return (
        <Knowledge
          articleId={props.selectedArticle}
          clearArticle={props.clearArticle}
          go={props.go}
        />
      );
    case "ai":
      return <Assistant {...props} />;
    case "settings":
      return <SettingsPage {...props} />;
    default:
      return null;
  }
}
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="content-heading">
      <div className="page-heading">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function DemoNote() {
  return (
    <div className="demo-note">
      <CircleHelp size={14} />
      Beispieldaten · Keine Verbindung zu echten Produktionssystemen.
    </div>
  );
}
function AIConnectionNote({ go }: { go: (page: Page) => void }) {
  const { aiMode } = useBackend();
  if (aiMode === "live" || aiMode === "demo") return null;
  return (
    <div className="ai-connection-note" role="status">
      <CircleHelp size={18} />
      <p>
        {aiMode === "signin-required"
          ? "Melde dich an, um die CLOQI KI zu nutzen."
          : "Die KI-Verbindung ist noch nicht bereit. Prüfe die Einrichtung und den Verbindungsstatus in den Einstellungen."}
      </p>
      <button className="button secondary" onClick={() => go("settings")}>
        Zu den Einstellungen <ArrowRight size={15} />
      </button>
    </div>
  );
}
function AIError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="ai-error-message" role="alert">
      <p>{message}</p>
      <button className="text-action" onClick={retry}>
        <RotateCcw size={15} /> Erneut versuchen
      </button>
    </div>
  );
}
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Die KI-Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut.";
}
function Processes({
  selectedProcess,
  setSelectedProcess,
  openProcess,
  addProposal,
  mission,
  tasks,
  go,
  analyzed,
  analysisResults,
  onAnalyzed,
}: ContentProps) {
  const { aiMode, session } = useBackend();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Alle Bereiche");
  const [analyzing, setAnalyzing] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current += 1;
    setAnalyzing(false);
    setAnalysisError(null);
    setStep(null);
    return () => {
      requestVersion.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [selectedProcess, aiMode, session?.user.id]);
  const viewProcesses = processes.map((p) =>
    p.id === "packaging" && mission === 3
      ? {
          ...p,
          status: "Optimiert",
          duration: 20,
          waiting: 3,
          steps: p.steps.map((step, index) =>
            index === 2
              ? "Maschine einstellen"
              : index === 4
                ? "Gemeinsame Qualitätskontrolle"
                : step,
          ),
        }
      : p,
  );
  const process = viewProcesses.find((p) => p.id === selectedProcess);
  const analyze = async () => {
    if (!process || analyzing) return;
    if (aiMode !== "live" && aiMode !== "demo") {
      go("settings");
      return;
    }
    const id = process.id;
    const version = ++requestVersion.current;
    setAnalysisError(null);
    setAnalyzing(true);
    if (aiMode === "demo") {
      timer.current = setTimeout(() => {
        if (version !== requestVersion.current) return;
        onAnalyzed(id);
        setAnalyzing(false);
      }, 700);
      return;
    }
    try {
      const result = await requestAI({
        action: "analyze",
        processId: id,
        context: { tasks, mission },
      });
      if (version !== requestVersion.current) return;
      onAnalyzed(id, result);
    } catch (error) {
      if (version === requestVersion.current)
        setAnalysisError(errorText(error));
    } finally {
      if (version === requestVersion.current) setAnalyzing(false);
    }
  };
  if (process) {
    const Icon = processIcons[process.id as keyof typeof processIcons];
    const improved = process.id === "packaging" && mission === 3;
    const result = analysisResults[process.id];
    const isDemoAnalyzed =
      !result &&
      aiMode === "demo" &&
      (analyzed.includes(process.id) || improved);
    const isAnalyzed = Boolean(result) || isDemoAnalyzed;
    return (
      <>
        <button
          className="back-button"
          onClick={() => setSelectedProcess(null)}
        >
          <ArrowLeft size={17} />
          Alle Prozesse
        </button>
        <Heading
          eyebrow={`${process.name.toUpperCase()} · PROZESSDETAIL`}
          title={process.title}
          description="Jeder Schritt zählt. Gemeinsam finden wir den besseren Ablauf."
        >
          <button
            className="button primary"
            onClick={analyze}
            disabled={analyzing}
          >
            <Sparkles size={17} />
            {analyzing
              ? "CLOQI analysiert …"
              : isAnalyzed
                ? "Erneut analysieren"
                : "Prozess analysieren"}
          </button>
        </Heading>
        <AIConnectionNote go={go} />
        {analysisError && <AIError message={analysisError} retry={analyze} />}
        {analyzing && (
          <p className="ai-source" role="status">
            CLOQI analysiert den Beispielprozess …
          </p>
        )}
        <div className="process-meta">
          <span className={`status-tag ${improved ? "success" : ""}`}>
            <span className="status-light" />
            {improved ? "Optimiert" : process.status}
          </span>
          <span>
            <Users size={15} />
            {process.people} Personen beteiligt
          </span>
          <span>
            <Clock3 size={15} />
            Zuletzt aktualisiert: heute, 08:45
          </span>
        </div>
        {process.id === "packaging" && mission > 0 && (
          <div className="mission-steps">
            {[
              "Prozess analysieren",
              "Vorschlag als Aufgabe anlegen",
              "Verbesserung abschließen",
            ].map((s, i) => (
              <span key={s} className={mission > i ? "current" : ""}>
                <b>{mission > i ? <Check size={13} /> : i + 1}</b>
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="metric-grid">
          {[
            {
              label: "Bearbeitungszeit",
              value: `${improved ? 20 : process.duration} Min.`,
              icon: Clock3,
              sub: improved
                ? "Simulierter Zielwert"
                : "Durchschnitt je Durchlauf",
            },
            {
              label: "Fehlerquote",
              value: `${process.error} %`,
              icon: ShieldCheck,
              sub: "In den Beispieldaten",
            },
            {
              label: "Wartezeit",
              value: `${improved ? 3 : process.waiting} Min.`,
              icon: Workflow,
              sub: improved ? "Simulierter Zielwert" : "Zwischen den Schritten",
            },
            {
              label: "Offene Aufgaben",
              value: String(
                tasks.filter((t) => t.process === process.id && !t.done).length,
              ),
              icon: ListTodo,
              sub: "Gemeinsam weiterkommen",
            },
          ].map((m) => (
            <div className="panel metric" key={m.label}>
              <div>
                <span>{m.label}</span>
                <m.icon size={18} />
              </div>
              <strong>{m.value}</strong>
              <small>{m.sub}</small>
            </div>
          ))}
        </div>
        <section className="panel workflow-panel">
          <div className="section-heading">
            <div>
              <h2>Ein Prozess. Klare Schritte.</h2>
              <p>Wähle einen Schritt für mehr Details.</p>
            </div>
            <span className="subtle-label">AKTUELLER ABLAUF</span>
          </div>
          <div className="workflow-steps">
            {process.steps.map((s, i) => (
              <button
                key={s}
                onClick={() => setStep(step === i ? null : i)}
                className={`${step === i ? "selected" : ""} ${process.id === "packaging" && (i === 2 || i === 4) && isDemoAnalyzed && !improved ? "bottleneck" : ""}`}
              >
                <span className="step-number">{i + 1}</span>
                <strong>{s}</strong>
                <small>
                  {process.id === "packaging" &&
                  (i === 2 || i === 4) &&
                  isDemoAnalyzed &&
                  !improved
                    ? "Prüfschritt"
                    : "Prozessschritt"}{" "}
                  {i + 1}
                </small>
                {i < process.steps.length - 1 && (
                  <ChevronRight className="step-arrow" size={18} />
                )}
              </button>
            ))}
          </div>
          {step !== null && (
            <div className="step-detail">
              <IconBox>
                <Icon size={20} />
              </IconBox>
              <div>
                <strong>
                  Schritt {step + 1}: {process.steps[step]}
                </strong>
                <p>
                  {process.id === "packaging" &&
                  (step === 2 || step === 4) &&
                  !improved
                    ? "Dieser Schritt enthält eine Kontrolle. Prüfe gemeinsam mit der Qualitätssicherung, ob sich doppelte Prüfungen im freigegebenen Ablauf vermeiden lassen."
                    : "Die zuständigen Personen führen den Schritt nach dem aktuellen Arbeitsprotokoll aus und dokumentieren die Übergabe an den nächsten Bereich."}
                </p>
              </div>
            </div>
          )}
        </section>
        {result ? (
          <section className="analysis-result panel" aria-label="KI-Analyse">
            <div className="analysis-title">
              <IconBox>
                <Sparkles size={24} />
              </IconBox>
              <div>
                <span className="eyebrow">
                  KI-ANALYSE AUF BASIS VON BEISPIELDATEN
                </span>
                <h2>{result.analysis?.title || "Deine Prozessanalyse"}</h2>
              </div>
              <span className="demo-badge">CLOQI KI · {result.model}</span>
            </div>
            <p className="ai-generated-text">{result.text}</p>
            {result.analysis && (
              <>
                <ul className="ai-findings">
                  {result.analysis.findings.map((finding, index) => (
                    <li key={index}>{finding}</li>
                  ))}
                </ul>
                {result.analysis.estimatedMinutesSaved !== null && (
                  <p className="ai-source">
                    Geschätztes Potenzial:{" "}
                    {result.analysis.estimatedMinutesSaved} Min. je Durchlauf.
                    Diese KI-Schätzung muss fachlich geprüft werden.
                  </p>
                )}
                <div className="recommendation">
                  <Leaf size={20} />
                  <div>
                    <strong>{result.analysis.recommendation}</strong>
                    <p>
                      Vor einer Umsetzung gemeinsam mit dem verantwortlichen
                      Team prüfen.
                    </p>
                  </div>
                </div>
              </>
            )}
            <div className="analysis-actions">
              {result.analysis?.recommendation && (
                <button
                  className="button primary"
                  onClick={() =>
                    addProposal(process.id, result.analysis!.recommendation)
                  }
                >
                  <Plus size={17} /> Verbesserungsvorschlag erstellen
                </button>
              )}
              <button className="button secondary" onClick={() => go("ai")}>
                <MessageSquare size={17} /> Mit CLOQI besprechen
              </button>
            </div>
          </section>
        ) : isDemoAnalyzed ? (
          <section className="analysis-result panel">
            <div className="analysis-title">
              <IconBox>
                <Sparkles size={24} />
              </IconBox>
              <div>
                <span className="eyebrow">CLOQI HAT GENAUER HINGESCHAUT</span>
                <h2>
                  {improved
                    ? "Dein besserer Ablauf ist bereit."
                    : process.id === "packaging"
                      ? "Zwei Kontrollen. Eine gute Chance."
                      : "Weniger warten. Besser weiterarbeiten."}
                </h2>
              </div>
              <span className="demo-badge">Demo-Analyse</span>
            </div>
            <p>
              {improved
                ? "Im simulierten neuen Ablauf wird die Maschine in Schritt 3 eingestellt. Die gemeinsame Qualitätskontrolle erfolgt in Schritt 5. Die ursprüngliche Analyse bleibt hier als Vergleich dokumentiert."
                : process.id === "packaging"
                  ? "Der Beispielprozess enthält einen doppelten Prüfschritt. Die Kontrollen in Schritt 3 und Schritt 5 prüfen teilweise dieselben Merkmale."
                  : "In den Beispieldaten entsteht bei der Übergabe eine Wartezeit. Eine abgestimmte Vorbereitung kann den Ablauf vereinfachen."}
            </p>
            <div className="finding-grid">
              <div>
                <strong>
                  {process.id === "packaging" ? "12" : process.waiting} Min.
                </strong>
                <span>mögliche Zeitersparnis</span>
              </div>
              <div>
                <strong>{process.id === "packaging" ? "3" : "1"}</strong>
                <span>wiederholte Arbeitsschritte</span>
              </div>
              <div>
                <strong>2</strong>
                <span>Wartepunkte</span>
              </div>
              <div>
                <strong>{process.people}</strong>
                <span>beteiligte Personen</span>
              </div>
            </div>
            <div className="recommendation">
              <Leaf size={20} />
              <div>
                <strong>
                  {process.id === "packaging"
                    ? "Prüfung aus Schritt 3 und 5 zusammenführen."
                    : "Übergabe und Vorbereitung gemeinsam abstimmen."}
                </strong>
                <p>
                  Mit dem verantwortlichen Team prüfen und einen freigegebenen
                  Ablauf dokumentieren. Alle Einsparungen sind simulierte
                  Potenziale.
                </p>
              </div>
            </div>
            <div className="analysis-actions">
              <button
                className="button primary"
                onClick={() => addProposal(process.id)}
              >
                <Plus size={17} />
                Verbesserungsvorschlag erstellen
              </button>
              <button className="button secondary" onClick={() => go("ai")}>
                <MessageSquare size={17} />
                Mit CLOQI besprechen
              </button>
            </div>
          </section>
        ) : (
          <section className="analysis-invitation">
            <img
              src="/assets/cloqi-green.png"
              alt="CLOQI schaut mit dir auf den Prozess"
            />
            <div>
              <span className="eyebrow">EIN FRISCHER BLICK HILFT</span>
              <h2>Da geht noch ein bisschen mehr.</h2>
              <p>
                Ich schaue mir die Schritte an und zeige dir, wo sich der Ablauf
                vereinfachen lässt.
              </p>
              <button
                className="text-action"
                onClick={analyze}
                disabled={analyzing}
              >
                {analyzing
                  ? "Analyse läuft …"
                  : "Lass uns den Prozess analysieren"}
                <ArrowRight size={17} />
              </button>
            </div>
          </section>
        )}
        <DemoNote />
      </>
    );
  }
  return (
    <>
      <Heading
        eyebrow="DEINE PROZESSE"
        title="Alles im Zusammenhang."
        description="Vom ersten Rohstoff bis zur letzten Lieferung. Entdecke, was deinen Betrieb bewegt."
      />
      <div className="filter-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder="Prozesse durchsuchen …"
            aria-label="Prozesse durchsuchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="tabs">
          {["Alle Bereiche", "Mit Potenzial", "Stabil"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="process-grid">
        {viewProcesses
          .filter(
            (p) =>
              (p.name + p.title).toLowerCase().includes(query.toLowerCase()) &&
              (filter === "Alle Bereiche" ||
                (filter === "Stabil" &&
                  ["Stabil", "Optimiert"].includes(p.status)) ||
                (filter === "Mit Potenzial" &&
                  !["Stabil", "Optimiert"].includes(p.status))),
          )
          .map((p) => {
            const Icon = processIcons[p.id as keyof typeof processIcons];
            return (
              <button
                className="panel process-card"
                key={p.id}
                onClick={() => openProcess(p.id)}
              >
                <div className="process-card-top">
                  <IconBox tone={p.id === "production" ? "yellow" : "green"}>
                    <Icon size={25} />
                  </IconBox>
                  <ArrowUpRight size={20} />
                </div>
                <span className="eyebrow">{p.name}</span>
                <h2>{p.title}</h2>
                <span className="status-tag">
                  <span className="status-light" />
                  {p.id === "packaging" && mission === 3
                    ? "Optimiert"
                    : p.status}
                </span>
                <div className="process-card-bottom">
                  <span>
                    <Clock3 size={15} />
                    {p.duration} Min.
                  </span>
                  <span>
                    <Users size={15} />
                    {p.people} Personen
                  </span>
                </div>
              </button>
            );
          })}
      </div>
      {!viewProcesses.some(
        (p) =>
          (p.name + p.title).toLowerCase().includes(query.toLowerCase()) &&
          (filter === "Alle Bereiche" ||
            (filter === "Stabil" &&
              ["Stabil", "Optimiert"].includes(p.status)) ||
            (filter === "Mit Potenzial" &&
              !["Stabil", "Optimiert"].includes(p.status))),
      ) && (
        <Empty
          title="Kein Prozess gefunden."
          text="Versuche einen anderen Suchbegriff oder Filter."
        />
      )}
      <DemoNote />
    </>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Search size={27} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Tasks({ tasks, setTaskDetail, completeTask }: ContentProps) {
  const [filter, setFilter] = useState("Offen");
  const [priority, setPriority] = useState("Alle Prioritäten");
  const [query, setQuery] = useState("");
  const filtered = tasks.filter(
    (t) =>
      (filter === "Alle" ||
        (filter === "Erledigt" && t.done) ||
        (filter === "Offen" && !t.done)) &&
      (priority === "Alle Prioritäten" || priority === t.priority) &&
      t.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="GEMEINSAM INS TUN KOMMEN"
        title="Kleine Schritte. Echter Fortschritt."
        description="Hier siehst du, was ansteht – und was ihr gemeinsam schon geschafft habt."
      />
      <div className="task-summary">
        <div>
          <IconBox tone="yellow">
            <ListTodo />
          </IconBox>
          <strong>{tasks.filter((t) => !t.done).length}</strong>
          <span>offene Aufgaben</span>
        </div>
        <div>
          <IconBox>
            <CheckCheck />
          </IconBox>
          <strong>{tasks.filter((t) => t.done).length}</strong>
          <span>gemeinsam erledigt</span>
        </div>
        <div>
          <IconBox tone="stone">
            <Target />
          </IconBox>
          <strong>
            {tasks.filter((t) => !t.done && t.due === "Heute").length}
          </strong>
          <span>heute im Fokus</span>
        </div>
      </div>
      <div className="filter-toolbar">
        <div className="tabs">
          {["Offen", "Erledigt", "Alle"].map((f) => (
            <button
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
              key={f}
            >
              {f}
            </button>
          ))}
        </div>
        <label className="search-field compact">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aufgabe suchen …"
            aria-label="Aufgabe suchen"
          />
        </label>
        <select
          className="filter-select"
          aria-label="Nach Priorität filtern"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          {["Alle Prioritäten", "Niedrig", "Mittel", "Hoch", "Kritisch"].map(
            (p) => (
              <option key={p}>{p}</option>
            ),
          )}
        </select>
      </div>
      <section className="panel task-list">
        <div className="task-list-head">
          <span>AUFGABE</span>
          <span>VERANTWORTLICH</span>
          <span>PRIORITÄT</span>
          <span>FÄLLIG</span>
        </div>
        {filtered.map((t) => (
          <div className={`task-row ${t.done ? "is-done" : ""}`} key={t.id}>
            <div>
              <button
                aria-label={`${t.title} abschließen`}
                title={t.done ? "Abgeschlossen" : "Aufgabe abschließen"}
                className={`checkbox ${t.done ? "checked" : ""}`}
                onClick={() => completeTask(t.id)}
                disabled={t.done}
              >
                {t.done && <Check size={15} />}
              </button>
              <button className="task-title" onClick={() => setTaskDetail(t)}>
                <strong>{t.title}</strong>
                <small>{processes.find((p) => p.id === t.process)?.name}</small>
              </button>
            </div>
            <span className="assigned">
              <span className="avatar sage">
                {t.person
                  .split(" ")
                  .map((s) => s[0])
                  .join("")}
              </span>
              {t.person}
            </span>
            <span>
              <span className={`priority priority-${t.priority.toLowerCase()}`}>
                {t.priority}
              </span>
            </span>
            <span className={t.due === "Heute" ? "today" : ""}>{t.due}</span>
          </div>
        ))}
        {!filtered.length && (
          <Empty
            title={
              filter === "Erledigt"
                ? "Der erste Schritt zählt."
                : "Alles im Blick."
            }
            text={
              filter === "Erledigt"
                ? "Deine abgeschlossenen Aufgaben erscheinen hier."
                : "Keine Aufgaben für diese Auswahl. Passe die Filter an."
            }
          />
        )}
      </section>
      <div className="gentle-note">
        <Leaf size={20} />
        <span>
          Jede erledigte Aufgabe macht euren gemeinsamen Arbeitsalltag ein
          bisschen leichter.
        </span>
      </div>
      <DemoNote />
    </>
  );
}
function Analytics() {
  const [period, setPeriod] = useState("Diese Woche");
  const [category, setCategory] = useState("Alle Prozesse");
  const multiplier =
    (period === "Dieser Monat" ? 1.12 : 1) *
    (category === "Verpackung" ? 0.78 : category === "Produktion" ? 1.15 : 1);
  const data = (
    period === "Dieser Monat" ? chartData.slice(0, 4) : chartData
  ).map((d, i) => ({
    ...d,
    day: period === "Dieser Monat" ? `Woche ${i + 1}` : d.day,
    before: Math.round(d.before * multiplier),
    after: Math.round(d.after * multiplier),
    waiting: Math.round(d.waiting * multiplier),
  }));
  return (
    <>
      <Heading
        eyebrow="VERSTEHEN. VERBESSERN. WEITERKOMMEN."
        title="Der Blick aufs große Ganze."
        description="Wenige Kennzahlen. Klare Erkenntnisse. Mehr Raum für gute Entscheidungen."
      >
        <select
          className="filter-select"
          aria-label="Analysezeitraum"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option>Diese Woche</option>
          <option>Dieser Monat</option>
        </select>
      </Heading>
      <div className="tabs analytics-tabs">
        {["Alle Prozesse", "Produktion", "Verpackung"].map((c) => (
          <button
            className={category === c ? "active" : ""}
            key={c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="metric-grid">
        {[
          {
            label: "Ø Prozessdauer",
            value: `${Math.round(32 * multiplier)} Min.`,
            change: "12 % kürzer",
            icon: Clock3,
          },
          {
            label: "Ø Wartezeit",
            value: `${Math.round(7 * multiplier)} Min.`,
            change: "3 Min. weniger",
            icon: Workflow,
          },
          {
            label: "Fehlerquote",
            value: `${(1.4 * multiplier).toFixed(1).replace(".", ",")} %`,
            change: "0,4 Punkte weniger",
            icon: ShieldCheck,
          },
          {
            label: "Verbesserungspotenzial",
            value: `${Math.round(18 * multiplier)} %`,
            change: "Gemeinsam erreichbar",
            icon: Leaf,
          },
        ].map((m) => (
          <div className="panel metric" key={m.label}>
            <div>
              <span>{m.label}</span>
              <m.icon size={18} />
            </div>
            <strong>{m.value}</strong>
            <small className="green-text">↗ {m.change}</small>
          </div>
        ))}
      </div>
      <div className="analytics-grid">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <h2>Der Prozess kommt in den Flow.</h2>
              <p>Durchschnittliche Dauer in Minuten</p>
            </div>
            <span className="chart-label">
              <i />
              Aktuell
            </span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 15, right: 10, left: -20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="greenArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8bcf32" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#8bcf32" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#edf0e7" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#87907e" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#87907e" }}
                />
                <Tooltip
                  formatter={(v, name) => [
                    `${v} Min.`,
                    name === "before" ? "Vorher" : "Aktuell",
                  ]}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#e6e8e4",
                    fontSize: 13,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="before"
                  stroke="#ced4c4"
                  strokeDasharray="5 5"
                  fill="none"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="after"
                  stroke="#80b840"
                  fill="url(#greenArea)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-foot">
            <span>— Aktueller Verlauf</span>
            <span>┄ Vorheriger Vergleichszeitraum</span>
          </div>
        </section>
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <h2>Weniger Leerlauf.</h2>
              <p>Wartezeit in Minuten</p>
            </div>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 15, right: 0, left: -25, bottom: 5 }}
              >
                <CartesianGrid vertical={false} stroke="#edf0e7" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#87907e" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#87907e" }}
                />
                <Tooltip
                  formatter={(v) => [`${v} Min.`, "Wartezeit"]}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#e6e8e4",
                    fontSize: 13,
                  }}
                  cursor={{ fill: "#f7f8f2" }}
                />
                <Bar
                  dataKey="waiting"
                  fill="#c4d995"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={30}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <div className="analytics-insights">
        <section className="panel insight">
          <IconBox tone="yellow">
            <Sparkles />
          </IconBox>
          <h2>Wiederholung erkennen.</h2>
          <p>
            {category === "Produktion"
              ? "In der Produktion können Übergaben besser abgestimmt werden."
              : "An Linie 3 überschneiden sich zwei Prüfschritte. Hier lohnt sich ein gemeinsamer Blick."}
          </p>
          <span className="insight-number">
            {category === "Produktion" ? "2" : "3"} Schritte{" "}
            <small>mit Potenzial</small>
          </span>
        </section>
        <section className="panel insight">
          <IconBox>
            <MessageSquare />
          </IconBox>
          <h2>Dem Team zuhören.</h2>
          <p>„Eine klarere Übergabe würde uns im Alltag wirklich helfen.“</p>
          <span className="subtle-label">ANONYMES BEISPIELFEEDBACK</span>
        </section>
        <section className="panel insight">
          <IconBox>
            <TrendingUp />
          </IconBox>
          <h2>Es geht voran.</h2>
          <p>
            Rohstoffe und Qualität laufen stabil. Für Verpackung und Logistik
            sind nächste Schritte sichtbar.
          </p>
          <span className="insight-number">
            2 von 5 <small>Bereichen stabil</small>
          </span>
        </section>
      </div>
      <DemoNote />
    </>
  );
}
function Team({
  tasks,
  toast,
  entries,
  addFeedback,
}: {
  tasks: Task[];
  toast: (s: string) => void;
  entries: string[];
  addFeedback: (s: string) => void;
}) {
  const { session } = useBackend();
  const [selected, setSelected] = useState<(typeof members)[number] | null>(
    null,
  );
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  return (
    <>
      <Heading
        eyebrow="ZUSAMMEN GEHT MEHR"
        title="Ein Team. Viele gute Ideen."
        description="Wissen verbinden, Unterstützung finden und Prozesse gemeinsam besser machen."
      >
        <button
          className="button primary"
          onClick={() => setShowFeedback(true)}
        >
          <MessageSquare size={17} />
          Feedback festhalten
        </button>
      </Heading>
      <div className="team-principle">
        <Users size={22} />
        <div>
          <strong>Prozesse verbessern. Menschen unterstützen.</strong>
          <p>Hier geht es um Zusammenarbeit und gemeinsames Wissen.</p>
        </div>
        <span className="live-pill">4 Beispielprofile</span>
      </div>
      <div className="team-grid">
        {members.map((m) => (
          <button
            className="panel member-card"
            onClick={() => setSelected(m)}
            key={m.name}
          >
            <span className={`avatar ${m.color}`}>{m.initials}</span>
            <h2>{m.name}</h2>
            <p>{m.role}</p>
            <span className="subtle-label">{m.area}</span>
            <div className="skill-tags">
              {m.skills.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <div className="member-bottom">
              <span>
                {tasks.filter((t) => t.person === m.name && !t.done).length}{" "}
                offene Aufgaben
              </span>
              <ArrowUpRight size={17} />
            </div>
          </button>
        ))}
      </div>
      <section className="panel feedback-panel">
        <div className="section-heading">
          <h2>Stimmen aus dem Team</h2>
          <span className="subtle-label">PROZESSFEEDBACK</span>
        </div>
        {entries.map((e, i) => (
          <div className="feedback-entry" key={`${i}-${e}`}>
            <MessageSquare size={18} />
            <p>„{e}“</p>
            <span>
              {i < 2
                ? "Beispielfeedback"
                : session
                  ? "Dein Workspace"
                  : "Lokal gespeichert"}
            </span>
          </div>
        ))}
      </section>
      <DemoNote />
      {selected && (
        <Modal title="Gemeinsam im Flow" onClose={() => setSelected(null)}>
          <div className="member-detail">
            <span className={`avatar ${selected.color}`}>
              {selected.initials}
            </span>
            <h3>{selected.name}</h3>
            <p>
              {selected.role} · {selected.area}
            </p>
            <h4>Prozesskenntnisse</h4>
            <div className="skill-tags">
              {selected.skills.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <h4>Aktuelle Schulung</h4>
            <div className="linked-process">
              <BookOpen size={18} />
              {selected.training}
            </div>
            <h4>Offene Aufgaben</h4>
            {tasks
              .filter((t) => t.person === selected.name && !t.done)
              .map((t) => (
                <p className="member-task" key={t.id}>
                  <ListTodo size={15} />
                  {t.title}
                </p>
              ))}
            {!tasks.some((t) => t.person === selected.name && !t.done) && (
              <p>Aktuell keine offenen Aufgaben.</p>
            )}
          </div>
        </Modal>
      )}
      {showFeedback && (
        <Modal title="Deine Idee zählt." onClose={() => setShowFeedback(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!feedback.trim()) return;
              addFeedback(feedback.trim());
              setFeedback("");
              setShowFeedback(false);
              toast(
                session
                  ? "Dein Feedback wurde deinem persönlichen Workspace hinzugefügt."
                  : "Dein Feedback ist in dieser Demo sichtbar. Es wurde nicht versendet.",
              );
            }}
          >
            <label className="form-label" htmlFor="feedback">
              Was würde euren Arbeitsalltag leichter machen?
            </label>
            <textarea
              id="feedback"
              className="form-textarea"
              rows={5}
              placeholder="Zum Beispiel: Eine gemeinsame Checkliste für die Übergabe …"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              required
            />
            <p className="form-hint">
              {session
                ? "Dein Beitrag gehört zu deinem persönlichen Workspace in Supabase. Er wird nicht mit anderen Konten geteilt."
                : "Dein Beitrag bleibt lokal in diesem Browser."}
            </p>
            <div className="modal-actions">
              <button className="button primary" type="submit">
                <Plus size={16} />
                Feedback hinzufügen
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function Knowledge({
  articleId,
  clearArticle,
  go,
}: {
  articleId: string | null;
  clearArticle: () => void;
  go: (page: Page) => void;
}) {
  const { aiMode, session } = useBackend();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Alle");
  const [article, setArticle] = useState<(typeof articles)[number] | null>(
    null,
  );
  const [summary, setSummary] = useState(false);
  const [summaryResult, setSummaryResult] = useState<AIResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current += 1;
    setSummary(false);
    setSummaryResult(null);
    setSummarizing(false);
    setSummaryError(null);
    return () => {
      requestVersion.current += 1;
    };
  }, [article?.id, aiMode, session?.user.id]);
  useEffect(() => {
    if (articleId) {
      setArticle(articles.find((a) => a.id === articleId) || null);
      setSummary(false);
    }
  }, [articleId]);
  const summarize = async () => {
    if (!article || summarizing) return;
    if (aiMode !== "live" && aiMode !== "demo") {
      go("settings");
      return;
    }
    if (aiMode === "demo" || summaryResult) {
      setSummary(!summary);
      return;
    }
    const version = ++requestVersion.current;
    setSummaryError(null);
    setSummarizing(true);
    try {
      const result = await requestAI({
        action: "summarize",
        articleId: article.id,
      });
      if (version !== requestVersion.current) return;
      setSummaryResult(result);
      setSummary(true);
    } catch (error) {
      if (version === requestVersion.current) setSummaryError(errorText(error));
    } finally {
      if (version === requestVersion.current) setSummarizing(false);
    }
  };
  const filtered = articles.filter(
    (a) =>
      (a.title + a.intro).toLowerCase().includes(query.toLowerCase()) &&
      (category === "Alle" || a.category === category),
  );
  return (
    <>
      <Heading
        eyebrow="WISSEN, DAS WEITERHILFT"
        title="Gute Antworten. Griffbereit."
        description="Arbeitsabläufe verstehen, Wissen teilen und jeden Tag ein bisschen sicherer werden."
      />
      <div className="knowledge-search">
        <BookOpen size={24} />
        <input
          aria-label="Wissen durchsuchen"
          placeholder="Was möchtest du wissen?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Search size={22} />
      </div>
      <div className="tabs knowledge-tabs">
        {["Alle", "Verpackung", "Produktion", "Qualität", "Allgemein"].map(
          (c) => (
            <button
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
              key={c}
            >
              {c}
            </button>
          ),
        )}
      </div>
      <div className="knowledge-grid">
        {filtered.map((a, i) => (
          <button
            className="panel article-card"
            onClick={() => {
              setArticle(a);
              setSummary(false);
            }}
            key={a.id}
          >
            <div className={`article-art article-art-${i % 3}`}>
              <BookOpen size={42} strokeWidth={1.4} />
              <span>WISSEN MACHT DEN UNTERSCHIED.</span>
            </div>
            <div className="article-card-content">
              <span className="eyebrow">
                {a.category} <span>· {a.time} LESEZEIT</span>
              </span>
              <h2>{a.title}</h2>
              <p>{a.intro}</p>
              <span className="text-action">
                Mehr erfahren
                <ArrowUpRight size={16} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <Empty
          title="Noch keine passende Antwort."
          text="Versuche einen anderen Begriff oder wähle eine andere Kategorie."
        />
      )}
      <DemoNote />
      {article && (
        <Modal
          title={article.title}
          onClose={() => {
            setArticle(null);
            clearArticle();
          }}
          wide
        >
          <article className="knowledge-detail">
            <span className="eyebrow">
              {article.category} · {article.time}
            </span>
            <p className="article-intro">{article.intro}</p>
            <div className="article-copy">
              {article.body.map((p, i) => (
                <section key={p}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <p>{p}</p>
                </section>
              ))}
            </div>
            <button
              className="button primary"
              onClick={summarize}
              disabled={summarizing}
            >
              <Sparkles size={17} />
              {summarizing
                ? "CLOQI fasst zusammen …"
                : summary
                  ? "Zusammenfassung schließen"
                  : "Von CLOQI zusammenfassen lassen"}
            </button>
            <AIConnectionNote go={go} />
            {summaryError && (
              <AIError message={summaryError} retry={summarize} />
            )}
            {summary && (
              <div className="knowledge-summary">
                <Sparkles size={22} />
                <div>
                  <strong>Das Wichtigste für dich</strong>
                  <p className="ai-generated-text">
                    {summaryResult?.text || article.summary}
                  </p>
                  <small>
                    {summaryResult
                      ? `CLOQI KI · ${summaryResult.model} · Zusammenfassung eines Beispielartikels`
                      : "Vorbereitete Demo-Zusammenfassung"}
                  </small>
                </div>
              </div>
            )}
            <DemoNote />
          </article>
        </Modal>
      )}
    </>
  );
}
interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  actions?: boolean;
  source?: string;
}
function Assistant({
  openProcess,
  addProposal,
  toast,
  tasks,
  mission,
  go,
}: ContentProps) {
  const { aiMode, session } = useBackend();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [failedMessages, setFailedMessages] = useState<Message[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersion = useRef(0);
  useEffect(() => {
    requestVersion.current += 1;
    setMessages([]);
    setThinking(false);
    setChatError(null);
    setFailedMessages(null);
    return () => {
      requestVersion.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [aiMode, session?.user.id]);
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);
  const complete = async (conversation: Message[]) => {
    const version = ++requestVersion.current;
    setChatError(null);
    setFailedMessages(null);
    setThinking(true);
    if (aiMode === "demo") {
      timer.current = setTimeout(() => {
        if (version !== requestVersion.current) return;
        const answer = answerDemoQuestion(
          conversation[conversation.length - 1].text,
          tasks,
          mission === 3,
        );
        setMessages([
          ...conversation,
          {
            id: Date.now() + 1,
            role: "assistant",
            ...answer,
            source: "Vorbereitete Demo-Antwort",
          },
        ]);
        setThinking(false);
      }, 650);
      return;
    }
    try {
      const result = await requestAI({
        action: "chat",
        messages: conversation
          .slice(-12)
          .map((message) => ({
            role: message.role,
            content: message.text.slice(0, 4000),
          })),
        context: { tasks, mission },
      });
      if (version !== requestVersion.current) return;
      setMessages([
        ...conversation,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: result.text,
          source: `CLOQI KI · ${result.model}`,
        },
      ]);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setChatError(errorText(error));
      setFailedMessages(conversation);
    } finally {
      if (version === requestVersion.current) setThinking(false);
    }
  };
  const send = (text: string) => {
    const prompt = text.trim();
    if (!prompt || thinking) return;
    if (aiMode !== "demo" && aiMode !== "live") {
      go("settings");
      return;
    }
    const conversation: Message[] = [
      ...messages,
      { id: Date.now(), role: "user", text: prompt },
    ];
    setMessages(conversation);
    setInput("");
    void complete(conversation);
  };
  return (
    <>
      <Heading
        eyebrow="DEIN DIGITALER PROZESSBEGLEITER"
        title="Frag CLOQI."
        description="Zusammen wird aus einer Frage der nächste gute Schritt."
      />
      <AIConnectionNote go={go} />
      <div className="ai-layout">
        <section className="panel chat-panel">
          <div className="chat-header">
            <span className="ai-avatar">
              <Sparkles size={19} />
            </span>
            <span>
              <strong>CLOQI</strong>
              <small>Für dich und deinen Workflow da.</small>
            </span>
            <span className="demo-badge">
              {aiMode === "live"
                ? "Mit CLOQI KI verbunden"
                : aiMode === "demo"
                  ? "Simulierter Assistent"
                  : "Verbindung einrichten"}
            </span>
          </div>
          <div className="chat-messages" ref={listRef}>
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <img src="/assets/cloqi-green.png" alt="Hallo, ich bin CLOQI" />
                <h2>Hallo Julia. Was bewegt dich?</h2>
                <p>
                  Ein Prozess hakt? Eine Frage ist offen?
                  <br />
                  Lass uns gemeinsam genauer hinschauen.
                </p>
                <div className="suggested-prompts">
                  {[
                    "Warum dauert die Verpackung heute länger?",
                    "Welche Aufgaben sind heute wichtig?",
                    "Wie starte ich mit CLOQI?",
                  ].map((q) => (
                    <button onClick={() => send(q)} key={q}>
                      {q}
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`chat-message ${m.role}`}>
                  <span
                    className={m.role === "user" ? "avatar peach" : "ai-avatar"}
                  >
                    {m.role === "user" ? "JS" : <Sparkles size={17} />}
                  </span>
                  <div>
                    <strong>{m.role === "user" ? "Du" : "CLOQI"}</strong>
                    <p className="ai-generated-text">{m.text}</p>
                    {m.source && (
                      <small className="ai-source">{m.source}</small>
                    )}
                    {m.actions && (
                      <div className="chat-actions">
                        <button onClick={() => openProcess("packaging")}>
                          <Sparkles size={15} />
                          Prozess analysieren
                        </button>
                        <button onClick={() => addProposal("packaging")}>
                          <Plus size={15} />
                          Verbesserungsvorschlag erstellen
                        </button>
                        <button onClick={() => setNotice(true)}>
                          <Users size={15} />
                          Team informieren
                        </button>
                        <button onClick={() => openProcess("packaging")}>
                          <Workflow size={15} />
                          Prozess öffnen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {thinking && (
              <div className="thinking" role="status">
                <Sparkles size={17} />
                CLOQI schaut nach …
              </div>
            )}
            {chatError && failedMessages && (
              <AIError
                message={chatError}
                retry={() => {
                  if (!thinking) void complete(failedMessages);
                }}
              />
            )}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              aria-label="Nachricht an CLOQI"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Frag mich etwas zu deinen Prozessen …"
              disabled={thinking}
              maxLength={4000}
            />
            <button
              aria-label="Nachricht senden"
              disabled={!input.trim() || thinking}
            >
              <ArrowRight size={20} />
            </button>
          </form>
          <p className="chat-disclaimer">
            {aiMode === "live"
              ? "Der CLOQI-KI-Server erhält deine Nachrichten sowie Aufgaben und Prozesskontext aus den Beispieldaten. KI-Antworten können Fehler enthalten."
              : aiMode === "demo"
                ? "Lokale Demo mit vorbereiteten Antworten. Keine echte KI-Verbindung."
                : "Für echte KI-Antworten richte die Verbindung in den Einstellungen ein."}
          </p>
        </section>
        <aside className="ai-context">
          <div className="panel">
            <span className="eyebrow">DEIN KONTEXT</span>
            <h3>Gemeinsam im Flow.</h3>
            <p>
              Wiener Zucker
              <br />
              Produktion · Linie 3
            </p>
            <div className="context-item">
              <Workflow size={17} />5 Beispielprozesse
            </div>
            <div className="context-item">
              <ListTodo size={17} />
              {tasks.filter((t) => !t.done).length} offene Aufgaben
            </div>
            <div className="context-item">
              <BookOpen size={17} />5 Wissensartikel
            </div>
          </div>
          <div className="ai-tip">
            <Leaf size={22} />
            <h3>Ein guter Anfang</h3>
            <p>
              Beschreibe den Prozess und was dir aufgefallen ist. Je konkreter
              deine Frage, desto hilfreicher der nächste Schritt.
            </p>
          </div>
        </aside>
      </div>
      {notice && (
        <Modal title="Team informieren" onClose={() => setNotice(false)}>
          <p className="form-hint">Vorschau einer lokalen Demo-Mitteilung</p>
          <div className="notice-preview">
            <strong>An: Team Verpackung & Qualität</strong>
            <p>
              Bei Linie 3 überschneiden sich die Kontrollen in Schritt 3 und 5.
              Lasst uns gemeinsam prüfen, wie wir den Ablauf vereinfachen
              können.
            </p>
          </div>
          <p>Diese Demo sendet keine Nachrichten.</p>
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => {
                setNotice(false);
                toast(
                  "Demo-Mitteilung lokal vorgemerkt. Es wurde keine Nachricht versendet.",
                );
              }}
            >
              <Check size={17} />
              Lokal vormerken
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function SettingsPage({
  notifications,
  setNotifications,
  reducedMotion,
  setReducedMotion,
  reset,
  toast,
}: ContentProps) {
  const {user}=useAuth();
  const { session } = useBackend();
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(user!.name);
  return (
    <>
      <Heading
        eyebrow="DEIN CLOQI"
        title="So passt es zu dir."
        description="Ein guter Workspace fühlt sich richtig an."
      />
      <div className="settings-layout">
        <ConnectionSettings />
        <section className="panel settings-panel">
          <h2>Dein Profil</h2>
          <div className="settings-profile">
            <span className="avatar peach">{user!.initials}</span>
            <div>
              <strong>{user!.name}</strong>
              <p>{user!.position} · Wiener Zucker{user!.department?` · ${user!.department}`:''}{user!.line?` · ${user!.line}`:''}</p>
            </div>
          </div>
          <div className="form-grid">
            <div>
              <label className="form-label" htmlFor="profile-name">
                Anzeigename
              </label>
              <input
                className="form-input"
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                readOnly
              />
            </div>
            <div>
              <label className="form-label" htmlFor="profile-role">
                Rolle
              </label>
              <input
                className="form-input"
                id="profile-role"
                value={user!.position}
                readOnly
              />
            </div>
          </div>
          <p className="form-hint">
            Das Beispielprofil ist in dieser Demo fest vorgegeben.
          </p>
        </section>
        <section className="panel settings-panel">
          <h2>Dein Arbeitsalltag</h2>
          <div className="setting-row">
            <IconBox>
              <Bell size={20} />
            </IconBox>
            <div>
              <strong>Hinweise anzeigen</strong>
              <p>Zeige neue Hinweise am Benachrichtigungssymbol.</p>
            </div>
            <button
              role="switch"
              aria-checked={notifications}
              aria-label="Hinweise anzeigen"
              className={`switch ${notifications ? "on" : ""}`}
              onClick={() => setNotifications(!notifications)}
            >
              <i />
            </button>
          </div>
          <div className="setting-row">
            <IconBox tone="stone">
              <Eye size={20} />
            </IconBox>
            <div>
              <strong>Weniger Bewegung</strong>
              <p>Reduziere Animationen und Übergänge.</p>
            </div>
            <button
              role="switch"
              aria-checked={reducedMotion}
              aria-label="Weniger Bewegung"
              className={`switch ${reducedMotion ? "on" : ""}`}
              onClick={() => setReducedMotion(!reducedMotion)}
            >
              <i />
            </button>
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>
            {session ? "Dein persönlicher Workspace" : "Deine Demo-Daten"}
          </h2>
          <p>
            {session
              ? "Aufgaben, Mission, Feedback, KI-Analysen und Einstellungen werden in deinem persönlichen Supabase-Workspace gespeichert."
              : "Aufgaben, Mission, Feedback, KI-Analysen und Einstellungen werden lokal in diesem Browser gespeichert."}
          </p>
          <div className="settings-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(true)}
            >
              <RotateCcw size={16} />
              {session ? "Workspace zurücksetzen" : "Demo zurücksetzen"}
            </button>
            <button
              className="text-action"
              onClick={() =>
                toast(
                  "CLOQI · React, TypeScript, eigener KI-Server und Supabase · Produktionsdaten sind Beispiele.",
                )
              }
            >
              <CircleHelp size={16} />
              Über CLOQI
            </button>
          </div>
        </section>
      </div>
      <DemoNote />
      {confirm && (
        <Modal title="Neu anfangen?" onClose={() => setConfirm(false)}>
          <p>
            {session
              ? "Aufgaben, Mission, Feedback, KI-Analysen und Einstellungen in deinem persönlichen Supabase-Workspace werden auf den Ausgangszustand zurückgesetzt."
              : "Alle lokalen Aufgaben, Missionsschritte, Feedbacks, KI-Analysen und Einstellungen werden auf den Ausgangszustand zurückgesetzt."}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setConfirm(false)}
            >
              Abbrechen
            </button>
            <button
              className="button primary"
              onClick={() => {
                setConfirm(false);
                reset();
              }}
            >
              {session ? "Workspace zurücksetzen" : "Demo zurücksetzen"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
