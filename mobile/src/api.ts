import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// The app talks to the CLOQI website's app API (/api/mobile/*, see the repo root).
// Override for local testing with EXPO_PUBLIC_API_URL in mobile/.env.local.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://cloqi.vercel.app').replace(/\/$/, '');

const TOKEN_KEY = 'cloqi.session';

export type Gender = 'm' | 'w' | 'd';
export type MascotName = 'cloki' | 'clea';

/** ask = before every change · edit = changes directly, asks before deleting · auto = deletes too */
export type AiMode = 'ask' | 'edit' | 'auto';
export const AI_MODES: { id: AiMode; label: string; hint: string; icon: 'hand-left-outline' | 'create-outline' | 'play-forward-outline' }[] = [
  { id: 'ask', label: 'Nachfragen', hint: 'CLOQI fragt vor jeder Änderung an Kalender, Learn und Sport.', icon: 'hand-left-outline' },
  { id: 'edit', label: 'Automatisch eintragen', hint: 'Trägt ein und verschiebt selbst – fragt nur vor dem Löschen.', icon: 'create-outline' },
  { id: 'auto', label: 'Auto', hint: 'Erledigt alles selbst, auch Löschen. Stoppt bei Riskantem (Wissen löschen, fremde Inhalte).', icon: 'play-forward-outline' },
];

export interface AppUser {
  id: string;
  email: string;
  name: string;
  userType: string | null;
  gender: Gender | null;
  timezone: string;
  onboarded: boolean;
  mascot: MascotName;
  cycleEnabled: boolean;
  dailyGoalMin: number;
  /** CLOQI AI mode (older servers: missing = edit) */
  aiMode?: AiMode;
}

export interface Item {
  key: string;
  kind: 'event' | 'lesson' | 'study' | 'deadline';
  id: string;
  title: string;
  allDay: boolean;
  category: string;
  status: 'active' | 'cancelled' | 'done' | 'missed' | 'planned';
  location: string | null;
  teacher: string | null;
  description: string | null;
  readOnly: boolean;
  calendarLabel: string;
  source: string;
  recurring: boolean;
  occurrenceDate: string | null;  // set for one occurrence of a repeating event
  date: string;   // YYYY-MM-DD in the user's time zone
  start: string;  // HH:MM
  end: string;
}

export interface Today {
  today: string;
  insight: string;
  items: Item[];
  nextLesson: Item | null;
  nextEvent: Item | null;
  studyToday: Item[];
  openTasks: { id: string; title: string; subject: string; kind: string; due: string }[];
  freeToday: { start: string; end: string }[];
  suggestions: { id: string; kind: string; message: string }[];
  progress: { todayMinutes: number; dailyGoal: number; streak: number; weekDone: number; weekPlanned: number };
}

export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string }

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

// On phones the token lives in the Keychain / Android Keystore (SecureStore).
// SecureStore doesn't exist on web (browser preview only) – there localStorage is used.
const store = Platform.OS === 'web'
  ? {
      get: async () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
      set: async (v: string) => { try { localStorage.setItem(TOKEN_KEY, v); } catch { /* private mode */ } },
      del: async () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
    }
  : {
      get: () => SecureStore.getItemAsync(TOKEN_KEY),
      set: (v: string) => SecureStore.setItemAsync(TOKEN_KEY, v),
      del: () => SecureStore.deleteItemAsync(TOKEN_KEY),
    };

export const session = {
  async load() { try { token = await store.get(); } catch { token = null; } return token; },
  async save(t: string) { token = t; await store.set(t); },
  async clear() { token = null; await store.del(); },
  onUnauthorized(fn: () => void) { onUnauthorized = fn; },
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/mobile${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError('Keine Verbindung. Bist du online?', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Fehler ${res.status}`, res.status);
  return data as T;
}

/** Events of a streamed CLOQI AI answer (same as the website, see lib/ai.ts StreamEvent). */
export type StreamEvent =
  | { type: 'thread'; id: string }
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; ok: boolean; reply: string; actions: string[]; threadId: string | null };

/**
 * POSTs to a streaming endpoint and calls onEvent for every NDJSON line as it arrives.
 * Falls back to reading the whole response at once where streaming isn't available.
 */
export async function apiStream(path: string, body: unknown, onEvent: (e: StreamEvent) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/mobile${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Keine Verbindung. Bist du online?', 0);
  }
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) throw new ApiError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Fehler ${res.status}`, res.status);
  // Server-Sent Events: one `data: {json}` line per event; comments (padding) start with ':'
  const handle = (line: string) => { const l = line.trim(); if (l.startsWith('data:')) { try { onEvent(JSON.parse(l.slice(5)) as StreamEvent); } catch { /* ignore */ } } };
  const reader = res.body?.getReader?.();
  if (!reader || typeof TextDecoder === 'undefined') { (await res.text()).split('\n').forEach(handle); return; }
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  handle(buf);
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Da ist etwas schiefgelaufen.');
