# CLOQI – Your day. Your flow.

CLOQI ist ein Kalender, der mitdenkt: Stundenplan, Termine, externe Kalender, Lernzeiten,
Training und Freizeit an einem Ort. CLOQI plant Lernblöcke selbst um dein Leben herum und
schlägt Änderungen vor, wenn sich etwas verschiebt. Begleitet wirst du von **Cloki** (oder **Clea**).

> Diese Version ist die **Webapp (Desktop, Tablet, Smartphone-Browser)**. Native iOS/Android-Apps,
> Push-Nachrichten bei geschlossener App und Widgets sind für Phase 5 geplant.

## Schnellstart

Voraussetzung: **Node.js 22.5 oder neuer** (CLOQI nutzt die eingebaute SQLite-Datenbank von Node).

```bash
npm install
cp .env.example .env.local     # Werte nach Bedarf eintragen
npm run dev                    # http://localhost:3000
```

Ohne weitere Konfiguration funktionieren: Registrierung/Login, Onboarding, Kalender (Tag/Woche/Monat/Agenda),
Termine & Wiederholungen, Kalendergruppen, Learn, Life, CLOQI AI (inkl. Spracheingabe im Browser),
manueller Stundenplan, ICS-/CSV-Import, WebUntis über den iCal-Link, Apple-Kalender-Abo, Cycle.

Für **Google Kalender** und **Outlook** brauchst du eigene OAuth-Zugangsdaten (siehe unten) –
ohne sie zeigt die App das ehrlich an und täuscht keine Verbindung vor.

```bash
npm test          # Unit-Tests der Planungs-, Datums-, iCal-, Zyklus- und Sprachlogik
npm run typecheck
npm run build && npm start
```

## Umgebungsvariablen

| Variable | Zweck |
|---|---|
| `APP_URL` | Öffentliche Adresse (OAuth-Redirects, Kalender-Feed-Links) |
| `CLOQI_ENCRYPTION_KEY` | 32 Byte base64 – verschlüsselt OAuth-Tokens, WebUntis-Link, Feed-Token und Zyklusdaten. **In Produktion Pflicht.** In der Entwicklung wird automatisch einer unter `.data/` erzeugt. |
| `DATABASE_PATH` | Pfad der SQLite-Datei (Standard `.data/cloqi.db`) |
| `DEFAULT_TIMEZONE` | Zeitzone neuer Konten (Standard `Europe/Vienna`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth-Client (Webanwendung). Redirect: `{APP_URL}/api/integrations/google/callback`. Calendar API aktivieren. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT` | Azure-Portal → App-Registrierung. Redirect: `{APP_URL}/api/integrations/outlook/callback`. Berechtigung `Calendars.ReadWrite`. |
| `CRON_SECRET` | Schützt `POST /api/cron/sync` (regelmäßige Hintergrund-Synchronisierung, z. B. alle 30 Min) |

## Funktionen

**Kalender** – Tages-, Wochen-, Monats- und Agendaansicht · Termine erstellen, bearbeiten, verschieben
(Drag-and-drop), duplizieren, löschen · Zeitraum aufziehen zum Erstellen · aktuelle Uhrzeit · freie Zeiträume
· Konflikte markiert · Wiederholungen (täglich, wöchentlich, alle 2 Wochen, monatlich, jährlich, benutzerdefiniert)
mit „nur dieser Termin“ / „ganze Serie“ · Erinnerungen · Kalendergruppen mit Farbe und Ein-/Ausblenden ·
Quelle jedes Termins sichtbar.

**Kalender verbinden**
| Dienst | Richtung | Technik |
|---|---|---|
| Google Kalender | beidseitig (Import ausgewählter Kalender, Export von CLOQI-Terminen, Änderungen in beide Richtungen) | Google Calendar API, OAuth 2.0 |
| Outlook | beidseitig, wie Google | Microsoft Graph, OAuth 2.0 |
| Apple Kalender / iCloud | **einseitig** CLOQI → Apple (abonnierbarer webcal-Feed) | iCalendar-Feed mit geheimem Link |
| WebUntis | Import WebUntis → CLOQI (WebUntis bleibt maßgeblich) | persönlicher iCal-Link aus WebUntis |
| Andere | Import | ICS- und CSV-Dateien |

Keine Duplikate: jede externe Event-ID ist einem CLOQI-Datensatz zugeordnet (`sync_map`, `external_uid`).
Keine stillen Überschreibungen: Wurde ein Termin in CLOQI **und** extern geändert, fragt CLOQI nach.

**Learn** – Tests/Schularbeiten/Hausübungen eintragen (Formular, Text oder Sprache) · Lernplan-Vorschlag vor
dem Speichern · mehrere Tests parallel nach Datum, Schwierigkeit und Zeit priorisiert · Lernblöcke abhaken ·
„Alles neu planen“ · CLOQI meldet, wenn die Zeit nicht reicht, statt unrealistisch zu planen.

**Automatische Umplanung** – verpasste Lernblöcke, Stundenentfall (WebUntis), Verschiebungen und
Raumänderungen erzeugen Vorschläge, die du annimmst oder ablehnst. Private/externe Termine werden nie
ohne Zustimmung verändert.

**Life** – Routinen (Training, Arbeit, Freunde …) an mehreren Wochentagen, freie Zeit der Woche.

**CLOQI AI** – versteht deutsche Kalenderbefehle („Ich habe am Freitag einen Englisch-Test“, „Trag morgen um
17 Uhr Training ein“, „Plane mir nächste Woche drei Lernstunden für BWL ein“, „Verschiebe mein Training auf
Freitag“, „Wann habe ich diese Woche Zeit?“). Antworten beruhen nur auf echten Kalenderdaten; Änderungen
erst nach Bestätigung. Die Erkennung ist regelbasiert und läuft komplett auf dem eigenen Server; ein
EU-gehostetes Sprachmodell kann später hinter derselben Schnittstelle (`lib/assistant.ts`) ergänzt werden.

**Gamification** – Tagesziel, Lernserien (Streak), Wochenfortschritt, Abzeichen – dezent.

**Cycle (optional)** – Zyklus-Tracker mit Clea, nur nach ausdrücklicher Einwilligung (Art. 9 DSGVO),
verschlüsselt gespeichert, nie exportiert oder synchronisiert, Widerruf löscht alle Daten. Schätzungen,
keine medizinische Beratung.

## Architektur

```
app/            Next.js App Router (Seiten, Server Actions in app/actions, API-Routen in app/api)
components/     UI (Kalenderansichten, Maskottchen, Formulare)
lib/
  scheduler.ts    Planungsalgorithmus (rein, getestet)
  recurrence.ts   Wiederholungen inkl. Sommerzeit (rein, getestet)
  ics.ts          iCalendar lesen/schreiben (rein, getestet)
  assistant.ts    Sprachbefehle → Absichten (rein, getestet)
  cycle.ts        Zyklus-Schätzung (rein, getestet)
  calendar.ts     führt alle Quellen zu einer Kalenderansicht zusammen
  planning.ts     Lernplan vorschlagen/anwenden, verpasste Blöcke erkennen
  webuntis.ts     iCal-Abruf mit SSRF-Schutz, Entfall-/Änderungserkennung
  integrations.ts Google/Outlook OAuth + Zwei-Wege-Sync
  feed.ts         Apple-Kalender-Feed
  db.ts, repo.ts  SQLite (node:sqlite) + Datenzugriff
```

## Sicherheit & Datenschutz

- Passwörter mit scrypt gehasht; Sitzungen als zufälliges Token (nur der Hash wird gespeichert), httpOnly-Cookie.
- OAuth-Tokens, WebUntis-Link, Feed-Token und Zyklusdaten AES-256-GCM-verschlüsselt.
- OAuth mit `state`-Prüfung; Kalenderverbindungen jederzeit trennbar (Google-Token wird widerrufen).
- WebUntis-Abruf nur an `*.webuntis.com`, ohne fremde Weiterleitungen, mit Größen- und Zeitlimit.
- Jede Datenbankabfrage ist an die Benutzer-ID gebunden; Eingaben werden serverseitig validiert.
- CSRF: Server Actions prüfen den Origin, API-Routen zusätzlich per Middleware; Sicherheits-Header gesetzt.
- Schriften werden beim Build lokal eingebunden – keine Anfragen an Google aus dem Browser.
- DSGVO: Datenexport (JSON) und Account-Löschung im Profil.
- **EU-Hosting:** Die SQLite-Datei braucht einen Server mit dauerhaftem Speicher in der EU (z. B. eine VM in
  Frankfurt/Wien). Für mehrere Server-Instanzen `lib/db.ts` auf Postgres in einer EU-Region umstellen.

## Was noch fehlt (ehrlich)

- Native Apps (iOS/Android), echte Push-Nachrichten bei geschlossener App, Widgets, EventKit.
- Beidseitige Apple-Synchronisierung (CalDAV).
- Anmeldung mit Google/Apple (Buttons sind als „bald“ markiert).
- Google/Outlook-Sync per Änderungs-Webhooks – aktuell regelmäßige Prüfung (beim Öffnen der App alle 30 Min
  und per Cron).
- Teilnehmer/Einladungen bei Terminen.
- Die Google-/Outlook-Synchronisierung ist implementiert, konnte aber ohne echte OAuth-Zugangsdaten nicht
  gegen die echten APIs getestet werden.
