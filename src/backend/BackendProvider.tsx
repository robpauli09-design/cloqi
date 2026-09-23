import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { BackendStatus } from "../../shared/contracts";
import { getBackendStatus } from "../services/api";
import { supabase } from "./client";
import { useAuth } from "../auth/AuthProvider";

interface BackendContextValue {
  status: BackendStatus | null;
  session: Session | null;
  authLoading: boolean;
  aiMode: "demo" | "live" | "signin-required" | "unavailable";
  error: string;
  refresh: () => Promise<void>;
}
const BackendContext = createContext<BackendContextValue | null>(null);
export function BackendProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const refresh = useCallback(async () => {
    try {
      setStatus(await getBackendStatus());
      setError("");
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Backend nicht erreichbar.");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  const aiMode = user ? (status?.demoAiEnabled ? "live" : "demo") : !status
    ? "unavailable"
    : !status.aiConfigured
      ? "demo"
      : status.authRequired && (!status.authConfigured || !supabase)
        ? "unavailable"
        : status.authRequired && !session
          ? "signin-required"
          : "live";
  return (
    <BackendContext.Provider
      value={{ status, session:user?null:session, authLoading:user?false:authLoading, aiMode, error, refresh }}
    >
      {children}
    </BackendContext.Provider>
  );
}
export function useBackend() {
  const value = useContext(BackendContext);
  if (!value) throw new Error("BackendProvider fehlt.");
  return value;
}
