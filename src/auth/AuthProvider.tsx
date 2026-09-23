import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { authenticateDemo, homePath, restoreDemo, users } from "./users";
import type { DemoUser } from "./users";
const key = "kloqi_user";
const AuthContext = createContext<{
  user: DemoUser | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
} | null>(null);
function stored() {
  try {
    return restoreDemo(localStorage.getItem(key));
  } catch {
    return null;
  }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(stored);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setUser(stored());
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  function login(username: string, password: string) {
    const next = authenticateDemo(username, password);
    if (!next) return false;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, username: next.username }),
      );
    } catch {
      /* Session stays valid for this tab. */
    }
    window.history.replaceState(null, "", homePath(next.role));
    setUser(next);
    return true;
  }
  function logout() {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Clear in-memory authentication regardless. */
    }
    window.history.replaceState(null, "", "/login");
    setUser(null);
  }
  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider fehlt.");
  return value;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  useEffect(() => {
    const guard = () => {
      if (!user && window.location.pathname !== "/login")
        window.history.replaceState(null, "", "/login");
    };
    guard();
    window.addEventListener("popstate", guard);
    return () => window.removeEventListener("popstate", guard);
  }, [user]);
  return user ? <div key={user.username}>{children}</div> : <Login />;
}
function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand wordmark">
          KLO<span>Q</span>i<span className="brand-dot">.</span>
        </div>
        <div className="login-story-copy">
          <span className="eyebrow">GEMEINSAM IM FLOW</span>
          <h1>
            Gute Arbeit.
            <br />
            Klare Prozesse.
            <br />
            <em>Ein starkes Team.</em>
          </h1>
          <p>
            Eine Plattform. Dein Arbeitsalltag.
            <br />
            Genau die Übersicht, die du brauchst.
          </p>
        </div>
        <img
          src="/assets/factory.png"
          alt="Isometrische KLOQI-Unternehmenswelt"
        />
        <div className="login-story-footer">
          <span className="status-light" />
          Kleine Schritte. Große Wirkung.
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-mobile-brand wordmark">
          KLO<span>Q</span>i.
        </div>
        <div className="login-form-wrap">
          <span className="eyebrow">WILLKOMMEN BEI KLOQI</span>
          <h2>
            Turning work
            <br />
            into <span>workflow.</span>
          </h2>
          <p className="login-description">
            Eine intelligente Plattform für klare Prozesse, bessere
            Zusammenarbeit und weniger Zeitverlust.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!login(username, password))
                setError(
                  "Benutzername oder Passwort ist nicht korrekt. Bitte versuche es erneut.",
                );
            }}
          >
            <label htmlFor="login-username">Benutzername</label>
            <div className="login-input">
              <UserRound size={18} />
              <input
                id="login-username"
                autoComplete="username"
                placeholder="Dein Benutzername"
                required
                maxLength={80}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
              />
            </div>
            <label htmlFor="login-password">Passwort</label>
            <div className="login-input">
              <LockKeyhole size={18} />
              <input
                id="login-password"
                autoComplete="current-password"
                type={visible ? "text" : "password"}
                placeholder="Dein Passwort"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
              />
              <button
                type="button"
                aria-label={
                  visible ? "Passwort verbergen" : "Passwort anzeigen"
                }
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary login-submit" type="submit">
              Anmelden
              <ArrowRight size={19} />
            </button>
          </form>
          <details className="demo-credentials">
            <summary>Demo-Zugänge</summary>
            <p>
              {users.map((user) => (
                <span key={user.username}>{user.username}</span>
              ))}
            </p>
            <small>
              Passwort für alle Zugänge: <strong>123456</strong>
            </small>
            <small>
              Prototyp mit Beispieldaten. Deine Sitzung wird in diesem Browser
              gespeichert.
            </small>
          </details>
          <div className="login-companion">
            <img src="/assets/kloqi-green.png" alt="KLOQI mit gelbem Helm" />
            <p>
              <strong>Schön, dass du da bist.</strong>
              <span>Wir machen Arbeit ein bisschen einfacher.</span>
            </p>
          </div>
        </div>
        <p className="login-footer">KLOQI · Turning work into workflow.</p>
      </section>
    </main>
  );
}
