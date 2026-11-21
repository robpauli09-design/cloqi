// Shared view of "where am I in the AI queue" for the status bar.
export interface AIQueueStatus {
  position: number; // 0 = the AI is answering now
}
let current: AIQueueStatus | null = null;
const listeners = new Set<(status: AIQueueStatus | null) => void>();
export function setAIQueueStatus(status: AIQueueStatus | null) {
  current = status;
  listeners.forEach((listener) => listener(status));
}
export function aiQueueStatus() {
  return current;
}
export function onAIQueueStatus(listener: (status: AIQueueStatus | null) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
