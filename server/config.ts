export interface ServerConfig {
  openaiKey: string;
  model: string;
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
  const model = env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  return {
    openaiKey: env.OPENAI_API_KEY?.trim() || "",
    model,
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
export function hasSupabase(c: ServerConfig) {
  return Boolean(c.supabaseUrl && c.supabaseKey);
}
