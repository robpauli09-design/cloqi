import type { Page, Task } from "../data";
import { initialTasks } from "../data";

export type Role = "management" | "department_lead" | "employee";
export interface DemoUser {
  username: string;
  role: Role;
  name: string;
  position: string;
  company: string;
  department?: string;
  line?: string;
  initials: string;
}
export const users: ReadonlyArray<DemoUser> = [
  {
    username: "JuliaSommer",
    role: "management",
    name: "Julia Sommer",
    position: "Geschäftsführung",
    company: "Wiener Zucker",
    initials: "JS",
  },
  {
    username: "SarahBerger",
    role: "department_lead",
    name: "Sarah Berger",
    position: "Abteilungsleiterin Verpackung",
    company: "Wiener Zucker",
    department: "Verpackung",
    initials: "SB",
  },
  {
    username: "LukasHuber",
    role: "employee",
    name: "Lukas Huber",
    position: "Mitarbeiter Produktion",
    company: "Wiener Zucker",
    department: "Verpackung",
    line: "Linie 3",
    initials: "LH",
  },
];
// Explicitly public prototype credentials, never used to authorize cloud APIs.
export function authenticateDemo(
  username: string,
  password: string,
): DemoUser | null {
  return password === "123456"
    ? users.find(
        (user) => user.username.toLowerCase() === username.trim().toLowerCase(),
      ) || null
    : null;
}
export function restoreDemo(value: string | null): DemoUser | null {
  try {
    const saved = JSON.parse(value || "null");
    return saved?.version === 1
      ? users.find((user) => user.username === saved.username) || null
      : null;
  } catch {
    return null;
  }
}
export function homePath(role: Role) {
  return role === "management"
    ? "/app"
    : role === "department_lead"
      ? "/app/department"
      : "/app/employee";
}
export function allowedPages(role: Role): Page[] {
  return role === "employee"
    ? ["home", "tasks", "station", "knowledge", "ai", "settings"]
    : [
        "home",
        "processes",
        "import",
        "tasks",
        "analytics",
        "team",
        "knowledge",
        "ai",
        "settings",
      ];
}
export function pagePath(role: Role, page: Page) {
  return page === "home" ? homePath(role) : `/app/${page}`;
}
export function resolvePage(role: Role, path: string): Page {
  const page = path.replace(/\/$/, "").split("/")[2] as Page;
  return allowedPages(role).includes(page) ? page : "home";
}
export function initialTasksFor(user: DemoUser): Task[] {
  if (user.role === "management")
    return initialTasks.map((task) => ({ ...task }));
  const rows: Array<[string, string, Task["priority"], string, boolean]> =
    user.role === "department_lead"
      ? [
          [
            "department-pallet",
            "Störung Palettierer analysieren",
            "Hoch",
            "Heute",
            false,
          ],
          [
            "department-film",
            "Verpackungsfolie Bestand prüfen",
            "Mittel",
            "Heute",
            false,
          ],
          [
            "department-quality",
            "Qualitätskontrolle Linie 3 dokumentieren",
            "Mittel",
            "Morgen",
            false,
          ],
          [
            "department-label",
            "Etikettierungsparameter optimieren",
            "Niedrig",
            "25. September",
            false,
          ],
        ]
      : [
          [
            "employee-start",
            "Linie 3 starten und erste Qualitätsprüfung durchführen",
            "Hoch",
            "Heute",
            true,
          ],
          [
            "employee-film",
            "Verpackungsfolie Bestand prüfen",
            "Mittel",
            "Heute",
            false,
          ],
          [
            "employee-sample",
            "Stichprobenkontrolle alle 30 Minuten",
            "Mittel",
            "Heute",
            false,
          ],
          [
            "employee-clean",
            "Maschine nach Checkliste reinigen",
            "Mittel",
            "Heute",
            false,
          ],
          [
            "employee-handover",
            "Schichtübergabe dokumentieren",
            "Niedrig",
            "14:00",
            false,
          ],
        ];
  return rows.map(([id, title, priority, due, done]) => ({
    id,
    title,
    priority,
    due,
    done,
    process: "packaging",
    person: user.name,
    description:
      "Verpackung · Linie 3. Durchführung nach der vor Ort freigegebenen Arbeitsanweisung; Rückfragen mit der Abteilungsleitung klären.",
  }));
}
