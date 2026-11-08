import type { Task } from "../data";

export interface DemoAnswer {
  text: string;
  actions: boolean;
}

/** Local deterministic adapter. Replace this function with a backend call for a real assistant. */
export function answerDemoQuestion(
  prompt: string,
  tasks: Task[],
  packagingImproved: boolean,
): DemoAnswer {
  const question = prompt.trim().toLocaleLowerCase("de");
  if (/verpack|linie|lang|warte|prüf|prozess/.test(question))
    return {
      text: packagingImproved
        ? "Ihr habt den Verbesserungsvorschlag für Linie 3 abgeschlossen. Die Verpackung ist in dieser Demo optimiert: Der simulierte Zielwert liegt bei 20 statt 32 Minuten. Das sind keine gemessenen Produktionswerte. Der freigegebene Ablauf sollte im echten Betrieb gemeinsam mit dem Qualitätsteam überprüft werden."
        : "Bei Linie 3 wurde im Beispiel heute eine zusätzliche manuelle Qualitätskontrolle durchgeführt. Dadurch verlängert sich der durchschnittliche Verpackungsprozess um ca. 8 Minuten. Die Kontrollen in Schritt 3 und Schritt 5 überschneiden sich. Gemeinsam mit dem Qualitätsteam könnt ihr prüfen, wie sich dieser Ablauf vereinfachen lässt.",
      actions: true,
    };
  if (/aufgabe|heute|offen/.test(question)) {
    const open = tasks.filter((t) => !t.done);
    const today = open.filter((t) => t.due === "Heute");
    return {
      text: `Es gibt ${open.length} offene Aufgaben. ${today.length ? `Für heute eingeplant: ${today.map((t) => `„${t.title}“`).join(" und ")}.` : "Für heute ist keine Aufgabe mehr offen."} Du kannst die Aufgabenübersicht öffnen, Zuständigkeiten prüfen und erledigte Schritte abhaken.`,
      actions: false,
    };
  }
  if (/hallo|hilfe|cloqi|start/.test(question))
    return {
      text: "Hallo Julia! Ich helfe dir, die Beispielprozesse besser zu verstehen. Öffne eine Fabrikkarte, starte eine Prozessanalyse oder schau dir das Wissen zu Linie 3 an. Was möchtest du als Nächstes verbessern?",
      actions: false,
    };
  return {
    text: "Ich kann in dieser Demo Fragen zum Verpackungsprozess, zu offenen Aufgaben und zum Einstieg in CLOQI beantworten. Für diese Frage liegt mir keine vorbereitete Antwort vor. Ein guter Start ist: „Warum dauert die Verpackung länger?“",
    actions: false,
  };
}
