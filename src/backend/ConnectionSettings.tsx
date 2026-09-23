import { useState } from "react";
import { CheckCircle2, Cloud, LogOut, RefreshCw } from "lucide-react";
import { useBackend } from "./BackendProvider";
import { supabase } from "./client";
import { useOptionalWorkspace } from "./WorkspaceProvider";

export function ConnectionSettings() {
  const { status, session, refresh, error } = useBackend();
  const workspace = useOptionalWorkspace();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result =
        mode === "login"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: window.location.origin },
            });
      if (result.error)
        throw new Error(
          mode === "login"
            ? "Anmeldung fehlgeschlagen. Prüfe E-Mail, Passwort und die E-Mail-Bestätigung."
            : "Registrierung fehlgeschlagen. Prüfe deine Eingaben und die Supabase-Auth-Einstellungen.",
        );
      setPassword("");
      if (mode === "signup" && !result.data.session)
        setMessage(
          "Bitte bestätige deine E-Mail-Adresse über den zugesendeten Link und melde dich anschließend an.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Verbindung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!supabase) return;
    setBusy(true);
    try {
      await workspace?.flush();
      const { error } = await supabase.auth.signOut();
      setMessage(
        error ? "Abmeldung fehlgeschlagen. Bitte erneut versuchen." : "",
      );
    } catch {
      setMessage(
        "Änderungen sind noch nicht gespeichert. Bitte zuerst den Speicherfehler oben beheben oder deine Änderungen sichern.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel connection-panel">
      <div className="connection-heading">
        <Cloud size={23} />
        <h2>Backend & KI</h2>
        <button
          className="icon-button"
          aria-label="Verbindung erneut prüfen"
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <ul className="connection-status">
        <li>
          <span className={status ? "connected" : ""}>
            <CheckCircle2 size={17} />
          </span>
          API <strong>{status ? "Erreichbar" : "Nicht erreichbar"}</strong>
        </li>
        <li>
          <span className={status?.aiConfigured ? "connected" : ""}>
            <CheckCircle2 size={17} />
          </span>
          OpenAI{" "}
          <strong>
            {status?.aiConfigured ? status.model : "Schlüssel fehlt"}
          </strong>
        </li>
        <li>
          <span
            className={status?.authConfigured && supabase ? "connected" : ""}
          >
            <CheckCircle2 size={17} />
          </span>
          Supabase{" "}
          <strong>
            {status?.authConfigured && supabase
              ? "Konfiguriert"
              : "Noch nicht eingerichtet"}
          </strong>
        </li>
      </ul>
      {error && (
        <p className="ai-error-message" role="alert">
          {error}
        </p>
      )}
      <p className="form-hint">
        Der OpenAI-Schlüssel wird ausschließlich auf dem Server als{" "}
        <code>OPENAI_API_KEY</code> hinterlegt: lokal in <code>.env</code>, auf
        Vercel in den Environment Variables. Nach Änderungen den Server neu
        starten bzw. neu deployen.
      </p>
      {session ? (
        <>
          <div className="connected-account">
            <strong>{session.user.email}</strong>
            <span>Angemeldet · persönlicher Workspace</span>
          </div>
          <p className="form-hint">
            Aufgaben, Fortschritt, Feedback und KI-Analysen werden in Supabase
            gespeichert. Vor dem Abmelden den Speicherstatus oben abwarten.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void logout()}
          >
            <LogOut size={16} />
            Abmelden
          </button>
        </>
      ) : supabase ? (
        <form onSubmit={submit} className="connection-form">
          <h3>{mode === "login" ? "Bei KLOQI anmelden" : "Konto erstellen"}</h3>
          <label className="form-label" htmlFor="account-email">
            E-Mail
          </label>
          <input
            id="account-email"
            className="form-input"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="form-label" htmlFor="account-password">
            Passwort
          </label>
          <input
            id="account-password"
            className="form-input"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="connection-actions">
            <button className="button primary" disabled={busy}>
              {busy
                ? "Bitte warten…"
                : mode === "login"
                  ? "Anmelden"
                  : "Registrieren"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
            >
              {mode === "login" ? "Neues Konto" : "Zur Anmeldung"}
            </button>
          </div>
        </form>
      ) : (
        <p className="ai-connection-note">
          Bis Supabase eingerichtet ist, bleiben Änderungen in diesem Browser.
          Die Einrichtungsanleitung liegt in der README des Projekts.
        </p>
      )}
      {message && (
        <p className="ai-connection-note" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
