# CLOQI – Your day. Your flow.

CLOQI ist ein Kalender, der mitdenkt: Stundenplan, Termine, externe Kalender, Lernzeiten,
Training und Freizeit an einem Ort. Mit **CLOQI AI** schreibst du einfach, was ansteht – CLOQI
trägt es ein, plant Lernblöcke um dein Leben herum und merkt sich in deinem **Wissens-Vault**,
wer du bist. Begleitet wirst du von **Cloki** (oder **Clea**).

> Web-Prototyp (Desktop, Tablet, Smartphone-Browser) auf **Vercel + Supabase**.
> Native iOS/Android-Apps folgen später.

## Einrichtung (Supabase + Vercel)

1. **Supabase-Projekt** anlegen – Region **Central EU (Frankfurt)**.
2. Supabase → **SQL Editor** → Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen → **Run**.
   (Kann gefahrlos mehrfach ausgeführt werden.)
3. Supabase → **Project Settings → Database → Connection string → Transaction pooler** (Port 6543) kopieren,
   `[YOUR-PASSWORD]` durch dein Datenbank-Passwort ersetzen → das ist `DATABASE_URL`.
4. **Vercel** → Projekt → *Settings → Environment Variables*: Variablen aus der Tabelle unten eintragen.
   `vercel.json` stellt das Projekt automatisch auf Next.js um (Region Frankfurt, täglicher Sync-Cron).
5. Neu deployen (Push auf `main` oder *Redeploy*). Danach auf der Website einen Account erstellen.

Lokal: `npm install`, `.env.local` aus `.env.example` anlegen (gleiche Werte, `APP_URL=http://localhost:3000`), `npm run dev`.

## Umgebungsvariablen

| Variable | Pflicht | Inhalt |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase Transaction-Pooler-URL (Port 6543) |
| `DATABASE_CA_CERT` | empfohlen | Supabase-SSL-Zertifikat (Project Settings → Database → SSL Configuration → Download), kompletter PEM-Inhalt – damit wird die Identität der Datenbank geprüft |
| `CLOQI_ENCRYPTION_KEY` | ✅ | 32 Byte base64 – `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Nie mehr ändern, sobald echte Daten existieren. |
| `APP_URL` | ✅ | z. B. `https://cloqi.vercel.app` (ohne `/` am Ende) |
| `AI_API_KEY` | für CLOQI AI | Schlüssel des Sprachmodell-Anbieters |
| `AI_MODEL` | für CLOQI AI | Modellname, z. B. ein Modell mit Tool-Calling deines Anbieters |
| `AI_BASE_URL` | optional | Standard `https://api.openai.com/v1`; für EU-Anbieter deren OpenAI-kompatible Basis-URL |
| `CRON_SECRET` | empfohlen | beliebiger langer Zufallswert; Vercel Cron sendet ihn automatisch |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google Kalender (Redirect `{APP_URL}/api/integrations/google/callback`) |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT` | optional | Outlook (Redirect `{APP_URL}/api/integrations/outlook/callback`) |
| `DEFAULT_TIMEZONE` | optional | Standard `Europe/Vienna` |

Ohne `AI_API_KEY`/`AI_MODEL` läuft CLOQI AI im **Basis-Modus** (versteht kurze Kalenderbefehle und fragt vor jeder Änderung).
Supabase-API-Keys (anon/service_role) werden **nicht** gebraucht – CLOQI spricht serverseitig direkt mit der Datenbank.

## CLOQI AI & Wissens-Vault

Der Assistent ist ein Agent mit Werkzeugen: Kalender lesen, Termine/Routinen anlegen, verschieben, löschen,
Tests eintragen (inkl. automatischer Lernplanung), Lernplan neu verteilen, freie Zeit finden, Fächer merken
und den Vault lesen/schreiben. Er funktioniert mit jeder OpenAI-kompatiblen Chat-API (OpenAI, DeepSeek bei
einem EU-Hoster, Mistral …).

```
CLOQI.md        Regeln: wer darf was, Wiki-Aufbau, Backup          (nur lesen)
user.md         Wer du bist: Ziele, Schule, Training, Gewohnheiten  (du + CLOQI)
soul.md         Wie CLOQI arbeiten soll: Ton, Tagesablauf, Lernen   (du; CLOQI liest)
Wochenplan.md   Tests + Lernplan Tag für Tag                        (automatisch)
raw-sources/    Dein Rohmaterial                                    (CLOQI liest nur)
wiki/           Gehört CLOQI – index.md + Themenseiten              (CLOQI schreibt, du liest/löschst)
  log.md        Änderungsprotokoll aller KI-Aktionen               (automatisch, nicht änderbar)
```

Die Rechte werden **serverseitig** erzwungen, nicht nur per Prompt. Jede KI-Aktion landet in `ai_actions`.

## Datenbank (18 Tabellen)

```
ACCOUNT    users ─┬─ profiles (1:1) · study_settings (1:1) · subjects (1:n) · sessions (1:n)
CALENDAR   calendars (1:n) ── events (1:n, Serien über series_id)
TIMETABLE  timetable_entries · school_holidays
LEARN      tasks ── study_blocks
SYNC       calendar_connections ─┬─ calendars (importierte externe Kalender)
                                 └─ sync_mappings (CLOQI-Eintrag ↔ externe Event-ID, keine Duplikate)
ASSISTANT  vault_files · ai_actions · chat_messages · suggestions
HEALTH     cycle_entries (vollständig verschlüsselt)
```

- Jede persönliche Tabelle hängt mit `ON DELETE CASCADE` am Benutzer → Account löschen entfernt alles.
- Echte Typen (`uuid`, `timestamptz`, `date`, `time`, `boolean`, `jsonb`) und `CHECK`-Regeln für alle Aufzählungen.
- Zugangsdaten (`users`) getrennt vom Profil; Geheimnisse und Zyklusdaten werden vor dem Speichern AES-256-GCM-verschlüsselt.
- Supabases öffentliche REST-API ist gesperrt (Row Level Security ohne Policies + entzogene Rechte).

## Weitere Funktionen

Kalender (Tag/Woche/Monat/Agenda, Drag-and-drop, Serien mit „nur dieser / ganze Serie“, Kalendergruppen,
Konflikte), WebUntis über den normalen Stundenplan-Link (öffentlicher Klassen-Stundenplan, eigene Kurse wählbar) oder den iCal-Link, ICS/CSV-Import, Ferien, Google/Outlook-Zwei-Wege-Sync,
Apple-Kalender-Abo (einseitig), Learn mit Lernplan-Vorschlag, Life-Routinen, Gamification, Erinnerungen,
optionales Cycle-Modul, DSGVO-Export und Account-Löschung.

## Entwicklung

```bash
npm test            # Planungs-, Datums-, iCal-, CSV-, Zyklus- und Sprachlogik
npm run typecheck
npm run build
```

## Was noch fehlt

- Native Apps, Push bei geschlossener App, Widgets; beidseitige Apple-Synchronisierung (CalDAV/EventKit).
- Anmeldung mit Google/Apple; Passwort-Zurücksetzen per E-Mail.
- Google-/Outlook-Sync ist implementiert, aber ohne echte OAuth-Zugangsdaten nicht gegen die echten APIs getestet.
