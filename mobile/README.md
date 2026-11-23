# CLOQI – App (iPhone & Android)

Expo (React Native), SDK 58, Expo Router. Talks to the website via `/api/mobile/*`
(same account, same data, same rules as the website).

## Auf dem Handy testen (Expo Go)

1. **Expo Go** aus dem App Store / Play Store installieren.
2. Am PC:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
3. QR-Code scannen (iPhone: Kamera-App, Android: in Expo Go). Handy und PC im selben WLAN –
   sonst `npx expo start --tunnel`.
4. Mit demselben Account wie auf der Website anmelden.

Änderungen am Code erscheinen sofort am Handy, solange `expo start` läuft.

Standardmäßig spricht die App mit `https://cloqi.vercel.app`. Für einen lokalen Server
`mobile/.env.local` mit `EXPO_PUBLIC_API_URL=http://<PC-IP>:3000` anlegen.

## Aufbau

```
src/app/_layout.tsx        Schriften, Login-Status, geschützte Bereiche
src/app/login.tsx          Anmelden / Account erstellen
src/app/onboarding.tsx     Name, Geschlecht (bestimmt Cloki/Clea), Benutzerart
src/app/(tabs)/index.tsx   Kalender: Heute · Woche, + Neuer Termin
src/app/(tabs)/ai.tsx      CLOQI AI (Chat)
src/app/(tabs)/profil.tsx  Profil, Links zu Website-Bereichen, Abmelden
src/app/neuer-termin.tsx   Termin anlegen
src/components/            TabBar, UI-Bausteine, Maskottchen
src/theme.ts               Farben/Schriften – gleiche Werte wie die Website
```

## Prüfen

```bash
npx tsc --noEmit
npx eslint src
npx expo-doctor
```

## Später

- Eigene Test-App (Development Build) über `eas build`, Updates über `eas update`.
- Push-Erinnerungen, Apple-Kalender (EventKit), Spracheingabe, Lernen/Life direkt in der App.
