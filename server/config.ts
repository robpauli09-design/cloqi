export interface ServerConfig {
  /** OpenAI-compatible endpoint of the CLOQI AI server, e.g. http://host:8086/v1 */
  aiBaseUrl: string;
  /** Optional bearer token; empty when the AI server has no API key set. */
  aiKey: string;
  model: string;
  aiTimeoutMs: number;
  /**
   * "chat": OpenAI-compatible /chat/completions (default).
   * "chatml": CLOQI renders the Qwen ChatML prompt itself and calls /completions.
   * Needed for LocalAI builds whose chat endpoints drop the model output.
   */
  aiPromptFormat: "chat" | "chatml";
  supabaseUrl: string;
  supabaseKey: string;
  allowedOrigins: string[];
  localDevelopment: boolean;
  demoAiEnabled: boolean;
}
export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
  localDevelopment = false,
): ServerConfig {
  const timeout = Number(env.AI_TIMEOUT_MS);
  return {
    aiBaseUrl: (env.AI_BASE_URL?.trim() || "").replace(/\/+$/, ""),
    aiKey: env.AI_API_KEY?.trim() || "",
    model: env.AI_MODEL?.trim() || "",
    // Self-hosted models answer far slower than hosted APIs; stay below
    // the 180 s Vercel function limit in vercel.json.
    aiTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 170_000) : 150_000,
    aiPromptFormat: env.AI_PROMPT_FORMAT?.trim().toLowerCase() === "chatml" ? "chatml" : "chat",
    supabaseUrl:
      env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || "",
    supabaseKey:
      env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
      env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      "",
    allowedOrigins: (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    localDevelopment,
    demoAiEnabled: env.DEMO_AI_ENABLED === "true",
  };
}
export function hasAI(c: ServerConfig) {
  return Boolean(c.aiBaseUrl && c.model);
}
export function hasSupabase(c: ServerConfig) {
  return Boolean(c.supabaseUrl && c.supabaseKey);
}
