import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SetStateAction } from "react";
import { useWorkspace } from "./backend/WorkspaceProvider";
import { useBackend } from "./backend/BackendProvider";
import { useAuth } from "./auth/AuthProvider";
import { allowedPages, initialTasksFor, pagePath, resolvePage } from "./auth/users";
import { RoleViews } from "./roles/RoleViews";
import {ImportFlow,ImportLibrary} from './imports/ImportFlow';
import { DemoBudgetNotice } from './backend/DemoBudgetNotice';
import type { WorkspaceState, AIResult } from "../shared/contracts";
import {
  Home,
  Workflow,
  ListTodo,
  ChartNoAxesCombined,
  Users,
  BookOpen,
  Sparkles,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Leaf,
  Factory,
  Package,
  Truck,
  ShieldCheck,
  Clock3,
  TrendingUp,
  X,
  Check,
  Trophy,
  Maximize2,
  Layers,
  MoreHorizontal,
  CircleHelp,
  LogOut,
  MapPin,
  Target,
  Upload,
} from "lucide-react";
import { processes, articles } from "./data";
import type { Page, Task } from "./data";
import { ContentPages } from "./Pages";
import { useWorkspaceTools } from "./useWorkspaceTools";

export const processIcons = {
  raw: Leaf,
  production: Factory,
  packaging: Package,
  logistics: Truck,
  quality: ShieldCheck,
};
const baseNav = [
  { id: "home", label: "Home", icon: Home },
  { id: "processes", label: "Prozesse", icon: Workflow },
  { id: "import", label: "Datenimport", icon: Upload },
  { id: "tasks", label: "Aufgaben", icon: ListTodo },
  { id: "analytics", label: "Analysen", icon: ChartNoAxesCombined },
  { id: "team", label: "Team", icon: Users },
  { id: "knowledge", label: "Wissen", icon: BookOpen },
  { id: "ai", label: "CLOQI AI", icon: Sparkles },
] as const;
export function IconBox({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`icon-box ${tone}`}>{children}</span>;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const old = document.activeElement as HTMLElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      old?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Schließen"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const {user:currentUser,logout}=useAuth();
  const user=currentUser!;
  const nav = user.role==='employee' ? [
    {id:'home' as Page,label:'Home',icon:Home},
    {id:'tasks' as Page,label:'Meine Aufgaben',icon:ListTodo},
    {id:'station' as Page,label:'Meine Station',icon:Factory},
    {id:'knowledge' as Page,label:'Wissen',icon:BookOpen},
    {id:'ai' as Page,label:'CLOQI AI',icon:Sparkles},
  ] : baseNav;
  const visibleProcesses=user.role==='management'?processes:processes.filter(p=>p.id==='packaging');
  const visibleArticles=user.role==='management'?articles:articles.filter(a=>a.id!=='production');
  const { state, setState } = useWorkspace();
  const { session } = useBackend();
  const {
    tasks,
    mission,
    analyzed,
    feedback,
    notifications,
    reducedMotion,
    analysisResults,
  } = state;
  function field<K extends keyof WorkspaceState>(key: K) {
    return (value: SetStateAction<WorkspaceState[K]>) =>
      setState((previous) => ({
        ...previous,
        [key]:
          typeof value === "function"
            ? (value as (old: WorkspaceState[K]) => WorkspaceState[K])(
                previous[key],
              )
            : value,
      }));
  }
  const setTasks = field("tasks"),
    setMission = field("mission"),
    setAnalyzed = field("analyzed"),
    setFeedback = field("feedback"),
    setNotifications = field("notifications"),
    setReducedMotion = field("reducedMotion"),
    setAnalysisResults = field("analysisResults");
  const [page, setPage] = useState<Page>(()=>resolvePage(user.role,window.location.pathname));
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<Task | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [popover, setPopover] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [worldLarge, setWorldLarge] = useState(false);
  const [showStatus, setShowStatus] = useState(true);
  const [help, setHelp] = useState(false);
  const [site, setSite] = useState("Tulln");
  const [period, setPeriod] = useState("Diese Woche");
  useEffect(()=>{
    const syncRoute=()=>{const next=resolvePage(user.role,window.location.pathname);const canonical=pagePath(user.role,next);if(window.location.pathname!==canonical)window.history.replaceState(null,'',canonical);setPage(next);setPopover('');setMobileMenu(false);setTaskDetail(null);};
    syncRoute();window.addEventListener('popstate',syncRoute);return()=>window.removeEventListener('popstate',syncRoute);
  },[user.role]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion
      ? "reduced"
      : "full";
  }, [reducedMotion]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Globale Suche"]')
          ?.focus();
      }
      if (e.key === "Escape") {
        setPopover("");
        setSearch("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const openTasks = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done).length;
  const progress = Math.min(100, 78 + done * 3 + (mission === 3 ? 5 : 0));
  const go = (next: Page) => {
    const permitted=allowedPages(user.role).includes(next)?next:'home';
    setPage(permitted);
    const path=pagePath(user.role,permitted);if(window.location.pathname!==path)window.history.pushState(null,'',path);
    setSelectedProcess(null);
    setSelectedArticle(null);
    setPopover("");
    setSearch("");
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openProcess = (id: string) => {
    if(user.role!=='management'&&id!=='packaging')return;
    go(user.role==='employee'?"station":"processes");
    setSelectedProcess(id);
  };
  const completeTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.done) return;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: true } : t)));
    setTaskDetail(null);
    if (id === "improve-packaging") {
      setMission(3);
      setToast(
        "Mission geschafft! Deine Fabrikwelt ist ein Stück besser. +120 XP",
      );
    } else
      setToast("Aufgabe abgeschlossen. Gemeinsam einen Schritt weiter! +30 XP");
  };
  const addProposal = (id: string, recommendation?: string) => {
    const p = processes.find((p) => p.id === id)!;
    const taskId = `improve-${id}`;
    if (tasks.some((t) => t.id === taskId)) {
      go("tasks");
      setToast("Der Verbesserungsvorschlag ist bereits in deinen Aufgaben.");
      return;
    }
    setTasks((ts) => [
      ...ts,
      {
        id: taskId,
        title: recommendation
          ? `${p.name}: KI-Vorschlag mit dem Team prüfen`
          : id === "packaging"
            ? "Doppelten Prüfschritt zusammenführen"
            : `${p.name}: Verbesserung mit dem Team prüfen`,
        process: id,
        priority: "Mittel",
        due: "Heute",
        person: "Julia Sommer",
        done: false,
        description:
          recommendation ||
          (id === "packaging"
            ? "Prüfe mit dem Qualitätsteam, ob die Kontrollen in Schritt 3 und 5 gemäß den gültigen Vorgaben zusammengeführt werden können. Stimme den neuen Ablauf ab und dokumentiere die Freigabe. Die prognostizierten Einsparungen sind Beispieldaten."
            : "Besprich den identifizierten Engpass mit dem verantwortlichen Team. Dokumentiere einen abgestimmten Ablauf und prüfe ihn gemeinsam."),
      },
    ]);
    setAnalyzed((a) => (a.includes(id) ? a : [...a, id]));
    if (id === "packaging") setMission((m) => Math.max(m, 2));
    setToast("Verbesserungsvorschlag als Aufgabe angelegt.");
    go("tasks");
  };
  const onAnalyzed = (id: string, result?: AIResult) => {
    setAnalysisResults((previous) => {
      const next = { ...previous };
      if (result) next[id] = result;
      else delete next[id];
      return next;
    });
    setAnalyzed((a) => (a.includes(id) ? a : [...a, id]));
    if (id === "packaging") setMission((m) => Math.max(m, 1));
  };
  const startMission = () => openProcess("packaging");
  const reset = () => {
    setTasks(initialTasksFor(user));
    setMission(0);
    setAnalyzed([]);
    setAnalysisResults({});
    setFeedback([
      "Eine klarere Übergabe zwischen Produktion und Verpackung würde uns helfen.",
      "Die neue Übersicht macht es leichter, die richtige Ansprechperson zu finden.",
    ]);
    setNotifications(true);
    setReducedMotion(false);
    setToast("Die Demo wurde zurückgesetzt.");
    go("home");
  };
  useWorkspaceTools({ page, tasks, mission, openProcess, allowedProcessIds:visibleProcesses.map(p=>p.id) });
  const xp =
    480 +
    tasks.filter((t) => t.done && t.id !== "improve-packaging").length * 30 +
    (mission === 3 ? 120 : 0);
  const liveTask = taskDetail
    ? tasks.find((t) => t.id === taskDetail.id)
    : null;
  const world = (
    <div className={`factory-stage ${mission === 3 ? "improved" : ""}`}>
      <img
        className="factory-image"
        src="/assets/factory.png"
        alt="Isometrische Zuckerfabrik mit Silos, Produktionshallen, Rübenfeldern und Logistik"
      />
      {showStatus &&
        processes.map((p) => {
          const Icon = processIcons[p.id as keyof typeof processIcons];
          const count = openTasks.filter((t) => t.process === p.id).length;
          return (
            <button
              className={`process-pin pin-${p.id}`}
              key={p.id}
              onClick={() => {
                setWorldLarge(false);
                openProcess(p.id);
              }}
            >
              <IconBox
                tone={
                  p.id === "production"
                    ? "yellow"
                    : p.id === "logistics"
                      ? "stone"
                      : "green"
                }
              >
                <Icon size={21} />
              </IconBox>
              <span>
                <strong>{p.name}</strong>
                <small>
                  <i className={p.id === "production" ? "amber" : ""} />
                  {p.id === "production"
                    ? `${count} offene Aufgaben`
                    : p.id === "packaging"
                      ? mission === 3
                        ? "Optimiert"
                        : "Potenzial entdeckt"
                      : p.status}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          );
        })}
      {mission === 3 && (
        <span className="factory-achievement">
          <ShieldCheck size={17} /> Verpackung optimiert
        </span>
      )}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => go("home")}
          aria-label="CLOQI Startseite"
        >
          <span className="wordmark">
            CLO<span>Q</span>i<span className="brand-dot">.</span>
          </span>
          <small>Turning work into workflow.</small>
        </button>
        <div className="workspace-label">DEIN WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              onClick={() => go(n.id)}
              className={`nav-item ${page === n.id ? "active" : ""}`}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "tasks" && <b>{openTasks.length}</b>}
              {n.id === "ai" && <span className="ai-tag">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mascot-note">
            <span
              className="mascot-face"
              role="img"
              aria-label="CLOQI, dein grüner Prozessbegleiter"
            />
            <div>
              <strong>Kleine Schritte.<br />Große Wirkung.</strong>
              <p>Gemeinsam Arbeit besser machen.</p>
            </div>
            <span className="little-spark" aria-hidden="true">✦</span>
          </div>
          <button
            aria-label="Einstellungen"
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings size={20} />
            Einstellungen
          </button>
          <button
            className="nav-item"
            aria-label="Hilfe und Feedback"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
            Hilfe & Feedback
            <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-foot">
            <span className="status-light" />
            Alle Systeme im Flow<span>v.1.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="company-wrap">
            <button
              className="company-select"
              onClick={() => user.role==='management'?setPopover(popover === "company" ? "" : "company"):go('home')}
              aria-expanded={popover === "company"}
            >
              <span className="company-mark">
                W<span>Z</span>
              </span>
              <span>
                <strong>Wiener Zucker</strong>
                <small>
                  <MapPin size={11} />
                  {user.role==='management'?`${site}, Österreich`:`Verpackung${user.line?' · Linie 3':''}`}
                </small>
              </span>
              <ChevronDown size={16} />
            </button>
            {popover === "company" && (
              <div className="popover company-pop">
                <strong>Standort auswählen</strong>
                <p>Beispielstandorte · getrennte Ansichten</p>
                {["Tulln", "Leopoldsdorf"].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSite(s);
                      setPopover("");
                      setToast(
                        `${s} ausgewählt. Angezeigt wird derselbe Demo-Datensatz.`,
                      );
                    }}
                  >
                    <Factory size={16} />
                    {s}
                    {site === s && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="Globale Suche"
              placeholder="Prozesse, Aufgaben, Wissen suchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>Strg K</kbd>
            {search && (
              <div className="popover search-results">
                <strong>Suchergebnisse</strong>
                {visibleProcesses
                  .filter((p) =>
                    (p.name + p.title)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <button key={p.id} onClick={() => openProcess(p.id)}>
                      <Workflow size={16} />
                      {p.title}
                      <small>Prozess</small>
                    </button>
                  ))}
                {tasks
                  .filter((t) =>
                    t.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTaskDetail(t);
                        setSearch("");
                      }}
                    >
                      <ListTodo size={16} />
                      {t.title}
                    </button>
                  ))}
                {visibleArticles
                  .filter((a) =>
                    a.title.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        go("knowledge");
                        setSelectedArticle(a.id);
                      }}
                    >
                      <BookOpen size={16} />
                      {a.title}
                    </button>
                  ))}
                {![
                  ...visibleProcesses.map((p) => p.name + p.title),
                  ...tasks.map((t) => t.title),
                  ...visibleArticles.map((a) => a.title),
                ].some((x) =>
                  x.toLowerCase().includes(search.toLowerCase()),
                ) && <p>Keine Ergebnisse für „{search}“.</p>}
              </div>
            )}
          </div>
          <div className="top-actions">
            <button className="demo-badge" onClick={() => go("settings")}>
              {session ? "Cloud-Workspace" : "Prototyp · Beispieldaten"}
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                aria-label="Benachrichtigungen"
                onClick={() =>
                  setPopover(popover === "notifications" ? "" : "notifications")
                }
              >
                <Bell size={20} />
                {notifications && <i />}
              </button>
              {popover === "notifications" && (
                <div className="popover notifications">
                  <strong>Deine Benachrichtigungen</strong>
                  <button onClick={() => openProcess("packaging")}>
                    <IconBox>
                      <Sparkles size={19} />
                    </IconBox>
                    <span>
                      Potenzial an Linie 3 entdeckt
                      <small>Verpackung · vor 10 Min.</small>
                    </span>
                  </button>
                  <button onClick={() => go("tasks")}>
                    <IconBox tone="yellow">
                      <ListTodo size={19} />
                    </IconBox>
                    <span>
                      {openTasks.length} Aufgaben warten auf dich
                      <small>Dein Team bewegt etwas.</small>
                    </span>
                  </button>
                  <p>Lokale Beispielbenachrichtigungen</p>
                </div>
              )}
            </div>
            <span className="top-divider" />
            <button
              className="profile"
              aria-label={`Profil von ${user.name}`}
              onClick={() => setPopover(popover === "profile" ? "" : "profile")}
            >
              <span className="avatar peach">{user.initials}</span>
              <span>
                <strong>{user.name}</strong>
                <small>{user.position}</small>
              </span>
              <ChevronDown size={14} />
            </button>
            {popover === "profile" && (
              <div className="popover profile-pop">
                <strong>Hallo, {user.name.split(' ')[0]}!</strong>
                <p>{user.position} · Wiener Zucker</p>
                <button onClick={()=>go('settings')}><Users size={16}/>Profil</button>
                <button onClick={() => go("settings")}>
                  <Settings size={16} />
                  Einstellungen
                </button>
                <button
                  onClick={logout}
                >
                  <LogOut size={16} />
                  Abmelden
                </button>
              </div>
            )}
          </div>
        </header>
        <main id="main-content">
          {page==='ai'&&<DemoBudgetNotice/>}
          <nav className="role-breadcrumbs" aria-label="Brotkrumennavigation"><button onClick={()=>go('home')}>Wiener Zucker</button>{user.department&&<><ChevronRight size={13}/><button onClick={()=>go('home')}>{user.department}</button></>}{user.line&&<><ChevronRight size={13}/><button onClick={()=>go('station')}>{user.line}</button></>}</nav>
          {user.role!=='employee'&&(page==='processes'||page==='knowledge')&&<ImportLibrary user={user} onStart={()=>go('import')} knowledgeOnly={page==='knowledge'}/>}
          {page==='import'?<ImportFlow user={user} onDone={()=>go('processes')}/>:user.role!=='management'&&page!=='settings'?<RoleViews user={user} page={page} tasks={tasks} go={go} toggleTask={id=>setTasks(previous=>previous.map(task=>task.id===id?{...task,done:!task.done}:task))}/>:page === "home" ? (
            <>
              <div className="greeting">
                <div>
                  <div className="eyebrow">
                    <span className="sun-icon">✳</span> GEMEINSAM ETWAS BEWEGEN
                  </div>
                  <h1>
                    Guten Morgen, Julia<span className="green-text">!</span>
                  </h1>
                  <p>
                    Gemeinsam Prozesse einfacher, effizienter und nachhaltiger
                    gestalten.
                  </p>
                </div>
                <div className="greeting-date">
                  <span>Dienstag, 22. September</span>
                  <strong>Ein guter Tag für Fortschritt.</strong>
                </div>
              </div>
              <div className="home-grid">
                <section className="world-card">
                  <div className="world-heading">
                    <div>
                      <span className="eyebrow">DEINE UNTERNEHMENSWELT</span>
                      <h2>Hier kommt alles zusammen.</h2>
                    </div>
                    <span className="live-pill">
                      <i />
                      Im Flow
                    </span>
                  </div>
                  {world}
                  <div className="world-toolbar">
                    <span>
                      <span className="status-light" />5 Bereiche. Ein
                      gemeinsames Ziel.
                    </span>
                    <div>
                      <button
                        className={`icon-button ${showStatus ? "selected" : ""}`}
                        title="Prozesskarten ein- oder ausblenden"
                        aria-label="Prozesskarten ein- oder ausblenden"
                        onClick={() => setShowStatus(!showStatus)}
                      >
                        <Layers size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Fabrikwelt vergrößern"
                        onClick={() => setWorldLarge(true)}
                      >
                        <Maximize2 size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="mission-banner">
                    <div className="mission-symbol">
                      <Target size={26} />
                    </div>
                    <div className="mission-copy">
                      <span>
                        DEINE HEUTIGE MISSION <b>+120 XP</b>
                      </span>
                      <strong>
                        {mission === 3
                          ? "Gemeinsam besser. Mission geschafft!"
                          : "Verpackung mit Potenzial."}
                      </strong>
                      <div className="mission-progress">
                        <div>
                          {[1, 2, 3].map((n) => (
                            <i key={n} className={mission >= n ? "done" : ""} />
                          ))}
                        </div>
                        <small>{mission}/3 Schritte</small>
                      </div>
                    </div>
                    <button
                      className="button primary"
                      onClick={
                        mission === 3
                          ? () => openProcess("packaging")
                          : startMission
                      }
                    >
                      {mission === 3
                        ? "Ansehen"
                        : mission
                          ? "Weiter geht’s"
                          : "Heute optimieren"}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </section>
                <aside className="dashboard-rail">
                  <section className="panel progress-card">
                    <div className="section-heading">
                      <h2>Dein Fortschritt</h2>
                      <select
                        aria-label="Fortschrittszeitraum"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        <option>Diese Woche</option>
                        <option>Dieser Monat</option>
                      </select>
                    </div>
                    <div className="progress-body">
                      <div
                        className="progress-ring"
                        style={{
                          background: `conic-gradient(var(--green) ${period === "Diese Woche" ? progress : Math.min(100, progress + 5)}%, #edf0e8 0)`,
                        }}
                      >
                        <div>
                          <strong>
                            {period === "Diese Woche"
                              ? progress
                              : Math.min(100, progress + 5)}
                            <small>%</small>
                          </strong>
                          <span>im Flow</span>
                        </div>
                      </div>
                      <div className="progress-stats">
                        <div>
                          <TrendingUp size={16} />
                          <span>
                            <strong>
                              +{period === "Diese Woche" ? "12" : "18"} %
                            </strong>
                            <small>Effizienz</small>
                          </span>
                        </div>
                        <div>
                          <Clock3 size={16} />
                          <span>
                            <strong>
                              −{period === "Diese Woche" ? "6,5" : "24"} h
                            </strong>
                            <small>Zeitaufwand</small>
                          </span>
                        </div>
                        <div>
                          <Leaf size={16} />
                          <span>
                            <strong>
                              −{period === "Diese Woche" ? "18" : "22"} %
                            </strong>
                            <small>Ressourcen</small>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="level-line">
                      <span>
                        <Trophy size={14} />
                        {xp >= 600
                          ? "Level 5 · Prozessgestalter"
                          : "Level 4 · Möglichmacher"}
                      </span>
                      <b>{xp} XP</b>
                    </div>
                  </section>
                  <section className="panel current-tasks">
                    <div className="section-heading">
                      <h2>Was jetzt zählt</h2>
                      <button
                        className="text-button"
                        onClick={() => go("tasks")}
                      >
                        Alle
                        <ArrowRight size={15} />
                      </button>
                    </div>
                    {openTasks.slice(0, 3).map((t) => (
                      <button
                        className="compact-task"
                        key={t.id}
                        onClick={() => setTaskDetail(t)}
                      >
                        <span
                          className={`task-check ${t.priority === "Hoch" ? "important" : ""}`}
                        >
                          <Check size={12} />
                        </span>
                        <span>
                          <strong>{t.title}</strong>
                          <small>
                            {processes.find((p) => p.id === t.process)?.name}
                          </small>
                        </span>
                        <small className={t.due === "Heute" ? "due-today" : ""}>
                          {t.due}
                        </small>
                      </button>
                    ))}
                    {!openTasks.length && (
                      <div className="all-done">
                        <ShieldCheck />
                        Alles erledigt. Gut gemacht!
                      </div>
                    )}
                  </section>
                  <section className="ask-card">
                    <img src="/assets/cloqi-green.png" alt="CLOQI hilft dir" />
                    <div>
                      <span className="eyebrow">
                        <Sparkles size={13} /> DEIN PROZESSBEGLEITER
                      </span>
                      <h2>Einfach CLOQI fragen.</h2>
                      <p>
                        Eine Frage. Ein neuer Blick.
                        <br />
                        Dein nächster guter Schritt.
                      </p>
                      <button className="button dark" onClick={() => go("ai")}>
                        Frag CLOQI
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </section>
                </aside>
              </div>
              <div className="quick-links">
                {[
                  {
                    title: "Prozesse optimieren",
                    text: "Kleine Änderungen. Große Wirkung.",
                    icon: Workflow,
                    page: "processes",
                    tone: "green",
                  },
                  {
                    title: "Potenziale entdecken",
                    text: "Verstehen, was dich weiterbringt.",
                    icon: ChartNoAxesCombined,
                    page: "analytics",
                    tone: "yellow",
                  },
                  {
                    title: "Wissen teilen",
                    text: "Die richtige Antwort. Zur richtigen Zeit.",
                    icon: BookOpen,
                    page: "knowledge",
                    tone: "stone",
                  },
                  {
                    title: "Gemeinsam wachsen",
                    text: "Ein starkes Team macht den Unterschied.",
                    icon: Users,
                    page: "team",
                    tone: "green",
                  },
                ].map((q) => (
                  <button key={q.page} onClick={() => go(q.page as Page)}>
                    <IconBox tone={q.tone}>
                      <q.icon size={22} />
                    </IconBox>
                    <span>
                      <strong>{q.title}</strong>
                      <small>{q.text}</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
              <div className="page-footer">
                <span>Gute Arbeit beginnt mit einem guten Flow.</span>
                <span>
                  Beispieldaten · Wiener Zucker, {site}
                  <span className="tiny-leaf">↗</span>
                </span>
              </div>
            </>
          ) : (
            <ContentPages
              analysisResults={analysisResults}
              analyzed={analyzed}
              onAnalyzed={onAnalyzed}
              selectedArticle={selectedArticle}
              clearArticle={() => setSelectedArticle(null)}
              feedback={feedback}
              addFeedback={(text) => setFeedback((es) => [...es, text])}
              page={page}
              tasks={tasks}
              mission={mission}
              selectedProcess={selectedProcess}
              setSelectedProcess={setSelectedProcess}
              openProcess={openProcess}
              setTaskDetail={setTaskDetail}
              completeTask={completeTask}
              addProposal={addProposal}
              go={go}
              toast={setToast}
              notifications={notifications}
              setNotifications={setNotifications}
              reducedMotion={reducedMotion}
              setReducedMotion={setReducedMotion}
              reset={reset}
            />
          )}
        </main>
      </div>
      <nav className="bottom-nav">
        {nav
          .filter((n) => ["home", "processes", "station", "tasks", "ai"].includes(n.id))
          .map((n) => (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              className={page === n.id ? "active" : ""}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
            </button>
          ))}
        <button onClick={() => setMobileMenu(true)}>
          <MoreHorizontal size={22} />
          <span>Mehr</span>
        </button>
      </nav>
      {mobileMenu && (
        <Modal title="Dein Workspace" onClose={() => setMobileMenu(false)}>
          <div className="mobile-menu">
            {nav.map((n) => (
              <button className="nav-item" key={n.id} onClick={() => go(n.id)}>
                <n.icon size={22} />
                {n.label}
              </button>
            ))}
            <button className="nav-item" onClick={() => go("settings")}>
              <Settings />
              Einstellungen
            </button>
          </div>
        </Modal>
      )}
      {liveTask && (
        <Modal title="Deine Aufgabe" onClose={() => setTaskDetail(null)}>
          <div className="task-detail">
            <img
              className="task-mascot"
              src={`/assets/cloqi-${liveTask.priority === "Kritisch" ? "red" : liveTask.priority === "Hoch" || liveTask.priority === "Mittel" ? "yellow" : "green"}.png`}
              alt={`CLOQI begleitet deine Aufgabe mit Priorität ${liveTask.priority}`}
            />
            <span
              className={`priority priority-${liveTask.priority.toLowerCase()}`}
            >
              {liveTask.priority}
            </span>
            <h3>{liveTask.title}</h3>
            <p>{liveTask.description}</p>
            <div className="detail-meta">
              <span>
                <Users size={16} />
                {liveTask.person}
              </span>
              <span>
                <Clock3 size={16} />
                {liveTask.due}
              </span>
            </div>
            <button
              className="linked-process"
              onClick={() => {
                setTaskDetail(null);
                openProcess(liveTask.process);
              }}
            >
              <Workflow size={18} />
              {processes.find((p) => p.id === liveTask.process)?.title}
              <ArrowRight size={17} />
            </button>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setTaskDetail(null)}
              >
                Schließen
              </button>
              <button
                className="button primary"
                disabled={liveTask.done}
                onClick={() => completeTask(liveTask.id)}
              >
                <Check size={17} />
                {liveTask.done ? "Abgeschlossen" : "Als erledigt markieren"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {worldLarge && (
        <Modal
          title="Deine Unternehmenswelt"
          onClose={() => setWorldLarge(false)}
          wide
        >
          {world}
        </Modal>
      )}
      {help && (
        <Modal title="Wir helfen dir weiter." onClose={() => setHelp(false)}>
          <div className="help-content">
            <IconBox>
              <CircleHelp />
            </IconBox>
            <h3>Willkommen in der CLOQI-Demo</h3>
            <p>
              Entdecke die Fabrikwelt, analysiere einen Prozess oder schließe
              eine Aufgabe ab. Deine Änderungen bleiben lokal in diesem Browser
              gespeichert.
            </p>
            <p>
              Alle Kennzahlen und KI-Antworten sind Beispieldaten. Es werden
              keine Nachrichten versendet und keine echten Produktionssysteme
              verändert.
            </p>
            <button
              className="button primary"
              onClick={() => {
                setHelp(false);
                go("knowledge");
              }}
            >
              CLOQI kennenlernen
              <ArrowRight size={17} />
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={18} />
          </span>
          {toast}
          <button aria-label="Hinweis schließen" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
