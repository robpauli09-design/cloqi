import { z } from "zod";
import type { Task } from "../src/data";

export const processIdSchema = z.enum([
  "raw",
  "production",
  "packaging",
  "logistics",
  "quality",
]);
export const taskSchema = z
  .object({
    id: z.string().min(1).max(160),
    title: z.string().min(1).max(300),
    process: processIdSchema,
    priority: z.enum(["Niedrig", "Mittel", "Hoch", "Kritisch"]),
    due: z.string().max(160),
    person: z.string().max(160),
    done: z.boolean(),
    description: z.string().max(8000),
  })
  .strict();
export const analysisSchema = z
  .object({
    title: z.string().min(1).max(300),
    findings: z.array(z.string().min(1).max(2000)).min(1).max(8),
    recommendation: z.string().min(1).max(8000),
    estimatedMinutesSaved: z.number().nonnegative().max(1440).nullable(),
  })
  .strict();
export const aiResultSchema = z
  .object({
    text: z.string().min(1).max(16000),
    source: z.literal("openai"),
    model: z.string().min(1).max(200),
    analysis: analysisSchema.optional(),
  })
  .strict();
export type AIResult = z.infer<typeof aiResultSchema>;
export const workspaceSchema = z
  .object({
    tasks: z
      .array(taskSchema)
      .max(1000)
      .refine(
        (ts) => new Set(ts.map((t) => t.id)).size === ts.length,
        "Aufgaben-IDs müssen eindeutig sein.",
      ),
    mission: z.number().int().min(0).max(3),
    analyzed: z.array(processIdSchema).max(100).default([]),
    feedback: z.array(z.string().max(8000)).max(500).default([]),
    notifications: z.boolean().default(true),
    reducedMotion: z.boolean().default(false),
    analysisResults: z
      .partialRecord(processIdSchema, aiResultSchema)
      .default({}),
  })
  .strict();
export type WorkspaceState = {
  tasks: Task[];
  mission: number;
  analyzed: string[];
  feedback: string[];
  notifications: boolean;
  reducedMotion: boolean;
  analysisResults: Record<string, AIResult>;
};
const contextSchema = z
  .object({
    tasks: z.array(taskSchema).max(1000),
    mission: z.number().int().min(0).max(3),
  })
  .strict();
export const aiRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("chat"),
      messages: z
        .array(
          z
            .object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(4000),
            })
            .strict(),
        )
        .min(1)
        .max(12),
      context: contextSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("analyze"),
      processId: processIdSchema,
      context: contextSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("summarize"),
      articleId: z.enum([
        "machine",
        "quality",
        "production",
        "safety",
        "software",
      ]),
    })
    .strict(),
]);
export type AIRequest = z.infer<typeof aiRequestSchema>;
export interface BackendStatus {
  aiConfigured: boolean;
  authConfigured: boolean;
  authRequired: boolean;
  mode: "local" | "cloud";
  model: string | null;
}
export interface WorkspaceRecord {
  workspaceId: string;
  state: WorkspaceState;
  revision: number;
}
export function parseWorkspace(input: unknown): WorkspaceState {
  const parsed = workspaceSchema.parse(input);
  return { ...parsed, analysisResults: parsed.analysisResults || {} };
}
