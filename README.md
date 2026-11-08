# CLOQI

Deutschsprachige Anwendung für Prozessverbesserungen mit React, TypeScript und Vite. Das Backend verbindet OpenAI für KI-Antworten und Supabase für Anmeldung und gespeicherte Arbeitsbereiche. Vercel kann Oberfläche und API gemeinsam aus diesem Repository bereitstellen.

**Aktueller Prototyp:** Ein gemeinsamer Benutzername-/Passwort-Login öffnet automatisch Management, Abteilungsleitung oder Mitarbeiteransicht. JuliaSommer, SarahBerger und LukasHuber verwenden jeweils `123456`. Diese öffentlichen Demo-Zugänge speichern Aufgaben lokal; sie sind keine produktive Authentifizierung. Das Backend ist vorbereitet, Supabase-Projekt und Vercel-Projekt wurden angelegt. Echte Demo-KI benötigt den serverseitigen OpenAI-Schlüssel, `DEMO_AI_ENABLED=true` und die Demo-Kontingent-Migration. Die weiter unten beschriebene Supabase-Anmeldung ist die Grundlage für eine spätere produktive Anmeldung, nicht ein zweiter Login in der aktuellen Oberfläche.

**Datenimport:** Unter „Daten importieren“ können Management und Abteilungsleitung CSV, XLSX, JSON, PDF, DOCX und TXT einlesen, Zuordnungen prüfen und Prozessdaten übernehmen. Verarbeitung und Speicherung erfolgen lokal im Browser. Details, Grenzen und Datenschutz: [Lokaler Import-Flow](IMPORTS.md).

## Echte Funktionen und Beispieldaten

| Bereich | Verhalten |
| --- | --- |
| Assistent, Prozessanalyse, Artikelzusammenfassung | Mit konfiguriertem Schlüssel echte OpenAI-Anfragen über den Server. Ohne Schlüssel ausdrücklich gekennzeichnete Demo-Antworten. Ein Fehler bei einem echten Aufruf wird angezeigt und nicht durch eine Demo-Antwort verdeckt. |
| Anmeldung | Drei lokale Prototyp-Konten mit automatischer Rollenansicht; keine manuelle Rollenauswahl. |
| Aufgaben, Missionsfortschritt, Feedback, Einstellungen, KI-Prozessanalysen | Bei den Prototyp-Konten getrennt im Browser; Supabase-Arbeitsbereiche sind im Backend für echte Auth-Sitzungen vorbereitet. |
| Unternehmensdaten-Import | Lokale Dateiverarbeitung und bestätigte Speicherung in IndexedDB; kein automatischer Versand an Cloud oder KI. |
| Fabrikbild, Prozesse, Kennzahlen, Diagramme, Team und Wissensartikel | Statische Beispieldaten, keine Maschinen-, ERP- oder MES-Anbindung. |
| Einsparungen und Fabrikverbesserungen | Illustrative Simulation; erledigte Aufgaben erzeugen keine gemessenen Produktionswerte. |

Die KI erhält ausgewählte Beispielprozesse bzw. Artikel und bei Chat/Analyse einen begrenzten Aufgabenkontext. Eine echte Antwort macht Beispieldaten nicht zu Betriebsdaten. CLOQI versendet keine Teamnachrichten und steuert keine Maschinen. Wissensartikel ersetzen keine freigegebenen Betriebsanweisungen. Chatverlauf und einzelne Artikelzusammenfassungen werden nicht dauerhaft im Arbeitsbereich gespeichert. Der Standortschalter verwendet denselben Beispieldatensatz unter verschiedenen Namen. Teameinladungen sind noch nicht implementiert; Mitgliedschaften verwaltet derzeit ein Datenbankadministrator.

## Lokal starten

Voraussetzung: **Node.js 24 LTS** und npm.

```powershell
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Werte in `.env` ergänzen, dann:

```powershell
npm run dev
```

Die App läuft unter [http://localhost:5173](http://localhost:5173). Der gemeinsame Entwicklungsserver `server/dev.ts` lädt `.env`, bedient `/api` und bindet Vite für die Oberfläche ein. Nach Änderungen an `.env` neu starten. Der Kopierbefehl überschreibt keine vorhandene `.env`.

Für lokale KI-Tests reicht zunächst `OPENAI_API_KEY`. Ohne Supabase bleiben Arbeitsbereiche im Browser; dieser Entwicklungsmodus ist für den lokalen Rechner gedacht. Auf Vercel erfordern geschützte API-Funktionen eine gültige Supabase-Anmeldung.

```powershell
npm test
npm run build
```

Der Produktionsbuild liegt in `dist/`. `npm run preview` zeigt nur den statischen Frontend-Build und stellt die API nicht bereit. Für vollständige lokale Tests `npm run dev` verwenden.

## Umgebungsvariablen

`.env.example` enthält die Vorlage ohne Zugangsdaten. Die echte `.env` gehört nicht ins Repository.

| Variable | Zweck |
| --- | --- |
| `OPENAI_API_KEY` | Geheimer OpenAI-API-Schlüssel, ausschließlich auf dem Server. |
| `OPENAI_MODEL` | Modellname; Standard im Code: `gpt-5-mini`. Das OpenAI-Projekt benötigt Zugriff auf dieses Modell. |
| `VITE_SUPABASE_URL` | Öffentliche Supabase-Projekt-URL für Anmeldung und Cloud-Speicherung. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Öffentlicher Publishable Key, normalerweise beginnend mit `sb_publishable_`. |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | Optionale Server-Aliase. Sonst verwendet das Backend die beiden `VITE_SUPABASE_*`-Werte. Falls gesetzt, dasselbe Projekt wie im Frontend verwenden. |
| `ALLOWED_ORIGINS` | Optional: zusätzliche Browser-Ursprünge, durch Kommas getrennt, mit Protokoll und ohne Pfad. Der eigene Ursprung ist automatisch erlaubt. |
| `VITE_API_BASE_URL` | Optional: Backend-Ursprung, etwa `https://cloqi.example.com`, ohne `/api`. Im gemeinsamen Vercel-Projekt leer lassen; für spätere getrennte Clients vorgesehen. |

Alle `VITE_`-Variablen werden öffentlich in den Frontend-Build eingebaut. Der OpenAI-Schlüssel darf **niemals** dieses Präfix erhalten. Diese Anwendung braucht keinen Supabase Secret Key und keinen `service_role`-Schlüssel: Sie nutzt den Publishable Key zusammen mit dem Zugriffstoken des angemeldeten Benutzers. Siehe [Supabase API-Schlüssel](https://supabase.com/docs/guides/getting-started/api-keys).

## Supabase erstmals einrichten

1. Im [Supabase-Dashboard](https://supabase.com/dashboard) eine Organisation und ein neues Projekt anlegen. Region und Datenbankpasswort wählen, dann auf die Bereitstellung warten. Das Datenbankpasswort ist kein `.env`-Wert.
2. Im **SQL Editor** die Dateien in `supabase/migrations/` vollständig und in dieser Reihenfolge je einmal ausführen: `202609220001_kloqi_backend.sql` (Arbeitsbereiche, Mitgliedschaften, gespeicherte Zustände, KI-Limits, Berechtigungen), `202609230001_demo_ai_quota.sql` (gemeinsames Demo-Budget), `202611080001_cloqi_rename.sql` (Umbenennung KLOQI → CLOQI). Einzelne Tabellen allein reichen nicht. Bestehende Datenbanken brauchen nur die noch fehlenden Dateien. Details: `supabase/README.md`.
3. In den Data-API-Einstellungen `public` exponiert lassen. **`cloqi_private` darf nicht exponiert werden.** Die Migration enthält die nötigen Grants und RLS-Regeln; keine pauschalen Schreibrechte ergänzen.
4. Im **Connect**-Dialog Projekt-URL und Publishable Key kopieren; alternativ den Schlüssel unter **Settings → API Keys** finden. Die beiden `VITE_SUPABASE_*`-Werte in `.env` setzen.
5. Unter **Authentication → URL Configuration** zunächst `http://localhost:5173` als **Site URL** setzen. Redirect URLs: `http://localhost:5173/**` und bei Nutzung auch `http://127.0.0.1:5173/**`.
6. Nach dem Vercel-Deployment die **Site URL** auf die feste Produktionsadresse umstellen, etwa `https://dein-projekt.vercel.app`. Diese tatsächliche Rücksprungadresse mit abschließendem `/` zusätzlich erlauben. Lokale Einträge können bestehen bleiben; für Preview-Tests nur die benötigten Preview-Adressen ergänzen.
7. E-Mail/Passwort-Anmeldung und Registrierung in Supabase Auth prüfen. Einen Benutzer registrieren, die Bestätigungs-E-Mail öffnen und anmelden. Bei eingeschränkter Zustellung die Auth-/SMTP-Konfiguration prüfen; für reguläre Benutzer einen eigenen geeigneten SMTP-Versand einrichten.

Beim ersten angemeldeten Laden richtet die App einen Arbeitsbereich ein; spätere Änderungen werden gespeichert. Supabase empfiehlt für Produktion genaue Rücksprungadressen, Wildcards vor allem für Entwicklung und Vorschauen: [Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Später auf Vercel veröffentlichen

Diese Einrichtung ist noch ausstehend und wurde nicht automatisch ausgeführt.

1. Das private Repository [robpauli09-design/cloqi](https://github.com/robpauli09-design/cloqi) verwenden. Es enthält Lockfile, `.env.example`, `vercel.json` und SQL-Migration. Die echte `.env` ist vom Upload ausgeschlossen.
2. In [Vercel](https://vercel.com/new) das Repository importieren. Repository-Hauptverzeichnis als Root Directory, **Vite** als Framework und Node.js **24.x** verwenden.
3. `vercel.json` setzt Installation auf `npm ci`, Build auf `npm run build` und Ausgabe auf `dist`. Die Dateien in `api/` werden zusätzlich als Functions bereitgestellt.
4. Unter **Settings → Environment Variables** mindestens `OPENAI_API_KEY`, `OPENAI_MODEL`, `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` setzen. Production erhält die Produktionswerte; Preview braucht passende eigene Werte, idealerweise ein Test-Supabase-Projekt. Zusätzliche Server-Aliase sind nicht nötig.
5. `VITE_API_BASE_URL` leer lassen. `ALLOWED_ORIGINS` ist bei gemeinsamer Web-App/API-Domain ebenfalls nicht nötig. Für einen späteren getrennten Client dessen konkrete Origin ergänzen.
6. Deployment starten und die Supabase-Redirects ergänzen. Nach Änderungen an Build-Variablen neu deployen: `VITE_*` wird beim Build eingebaut.
7. Anmeldung, Speichern und KI wie unten prüfen. Erst dann ist die Cloud-Anbindung bestätigt.

Die API nutzt native Web-Handler mit `export default { fetch(request: Request): Promise<Response> }`. Auf Vercel läuft kein eigener dauerhafter Entwicklungsserver. Dies entspricht der [Node.js-Functions-Dokumentation](https://vercel.com/docs/functions/runtimes/node-js).

Der SPA-Rewrite leitet Seitenpfade einschließlich verschachtelter Pfade auf `/index.html`. `/api` und alle `/api/...`-Pfade sind ausdrücklich ausgenommen; vorhandene Dateien werden regulär ausgeliefert. Ein unbekannter API-Pfad darf keine HTML-Oberfläche liefern. Grundlage: [Vercel Rewrite-Regeln](https://vercel.com/docs/project-configuration/vercel-json#negative-lookahead). Der Fallback liefert die App aus, fügt ihr aber keine neuen Navigationsrouten hinzu.

## Prüfung und Fehlersuche

`npm test` prüft API-Logik und SQL-Migration lokal. Die Datenbanktests nutzen PGlite mit PostgreSQL-Rollen, Grants und RLS. Das ersetzt keine Prüfung gehosteter Supabase Auth/Data API oder einer Vercel-Bereitstellung. `npx tsc -p tsconfig.server.json` prüft Servertypen; Zod 4 validiert gemeinsame Ein- und Ausgaben.

Nach der Cloud-Einrichtung prüfen:

- `/api/status` liefert JSON mit Konfigurationsstatus. Ein gesetzter Schlüssel beweist noch keine erfolgreiche Anbieter-Verbindung.
- Registrierung bestätigen, anmelden, Aufgabe ändern und Seite neu laden: Der Stand bleibt gespeichert.
- Zweiten Benutzer verwenden: Der erste private Arbeitsbereich ist unzugänglich. Zusätzlich Supabase Security Advisor prüfen.
- Assistent, Prozessanalyse und Zusammenfassung ausführen: echte Antwort oder verständlicher Fehler, keine verdeckte Demo-Ersatzantwort.
- Ohne Anmeldung eine geschützte API aufrufen: kein Cloud-Arbeitsbereich und keine kostenpflichtige KI-Anfrage.
- Verschachtelten Seitenpfad direkt laden: App wird ausgeliefert. `/api/nicht-vorhanden` darf dagegen keine HTML-App liefern.

| Symptom | Prüfen |
| --- | --- |
| API liefert HTML/404 | Projekt-Root, `api/` und `vercel.json`; `npm run preview` enthält kein Backend. |
| Anmeldung fehlt | Beide öffentlichen Supabase-Werte setzen; Dev-Server neu starten bzw. neu bauen. |
| Rücksprung nach Registrierung scheitert | Site URL und Redirect-Liste müssen zur tatsächlich verwendeten Adresse passen. |
| Arbeitsbereich lädt nicht | Vollständige Migration, übereinstimmende Projektwerte, aktive Data API und gültige Anmeldung. |
| KI nicht konfiguriert/Modell nicht verfügbar | Serverseitigen OpenAI-Schlüssel, Modellnamen und Modellzugriff prüfen. |
| KI-Limit erreicht | OpenAI-Projektbudget/-Limits und zusätzliche App-Limits prüfen. |
| Änderung kollidiert mit anderem Tab | Aktuellen Serverstand laden, dann die Änderung erneut vornehmen. Alte Zustände werden nicht blind überschrieben. |

Cloud-KI-Limits: **20 Anfragen pro UTC-Minute und 200 pro UTC-Tag je Benutzer**, serverinstanzübergreifend durch Supabase. Auch nachgelagert fehlgeschlagene Aufrufe verbrauchen eine Reservierung. Diese Limits ersetzen kein OpenAI-Projektbudget. Weitere Details und Testgrenzen: `supabase/README.md`.

## Codeaufbau

- `src/App.tsx`, `src/Pages.tsx`: Oberfläche und Arbeitsabläufe; `src/data.ts`: Domänenmodelle und Beispieldaten.
- `src/services/`: Frontend-Adapter; `shared/contracts.ts`: gemeinsame Typen und Zod-Validierung.
- `api/status.ts`, `api/ai.ts`, `api/workspace.ts`: Vercel-Einstiegspunkte; `server/`: gemeinsame API-Logik und lokaler Server.
- `supabase/migrations/`: SQL-Einrichtung; `test/`: automatisierte Prüfungen.
- `src/useWorkspaceTools.ts`: optionale WebMCP-Aktionen per Feature Detection; ohne Unterstützung bleibt die Oberfläche bedienbar.
- `src/styles.css`: CLOQI-Farbpalette und responsive Komponenten.

## Später als mobile oder Desktop-App

Oberfläche, API und Datenbank bleiben getrennt. Dies sind **eigene grobe Entwicklungsschätzungen** für den heutigen Umfang; neue Funktionen, vollständige Offline-Synchronisierung und Store-Wartezeiten kommen hinzu.

| Ziel | Ansatz | Aufwand |
| --- | --- | --- |
| Installierbare Web-App | PWA: Oberfläche behalten, Manifest/Icons und Caching ergänzen | 2–5 Arbeitstage |
| Android und iOS | Capacitor: Web-Oberfläche wiederverwenden, native Hülle und Veröffentlichung ergänzen | 2–4 Wochen |
| Windows und macOS | Tauri: Vite-Oberfläche behalten, Installer, Updates und Desktop-Integration | 1–3 Wochen |
| Durchgehend native mobile Oberfläche | React Native/Expo: Backend und viele Typen/Regeln behalten, Oberfläche/Navigation weitgehend neu bauen | 6–12+ Wochen |

Offizielle Grundlagen: [PWA](https://web.dev/learn/pwa/), [Capacitor](https://capacitorjs.com/docs), [Tauri mit Vite](https://v2.tauri.app/start/frontend/), [Expo und DOM-Komponenten](https://docs.expo.dev/workflow/web/).

Native Clients brauchen zusätzlich Login-Deep-Links, Sitzungsspeicherung, Signierung, Store-Einrichtung und Gerätetests. iOS-Builds benötigen macOS/Xcode oder einen Cloud-Build-Dienst. Push und Offline-Synchronisierung sind eigene Funktionen: Eine App-Hülle macht Supabase-Zugriffe oder serverseitige KI nicht automatisch offlinefähig. Der OpenAI-Schlüssel bleibt immer im Backend; getrennte Clients nutzen eine konfigurierte API-Adresse.

## Bildquellen

Die Maskottchen unter `public/assets/cloqi-*.png` sind unveränderte Kopien der bereitgestellten Bilder. `public/assets/factory.png` wurde mit ImageGen für diesen Prototyp erzeugt; Prompt siehe `ASSETS.md`. Die Fabrik ist eine stilisierte Illustration und kein maßstabsgetreuer realer Standort.
