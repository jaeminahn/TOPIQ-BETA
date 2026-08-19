import type { ExamMode } from "./types";

const registryKey = "unigate.topik.active-sessions";

export interface ActiveSessionEntry {
  examId: string;
  sessionId: string;
  mode: ExamMode;
  lastPosition: number;
  startedAt: string;
}

function readRegistry(): Record<string, ActiveSessionEntry> {
  try {
    const parsed = JSON.parse(localStorage.getItem(registryKey) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRegistry(entries: Record<string, ActiveSessionEntry>) {
  localStorage.setItem(registryKey, JSON.stringify(entries));
}

export const positionStorageKey = (sessionId: string) => `unigate.topik.position.${sessionId}`;

export function getActiveSession(examId: string) {
  return readRegistry()[examId] ?? null;
}

export function saveActiveSession(entry: ActiveSessionEntry) {
  writeRegistry({ ...readRegistry(), [entry.examId]: entry });
  localStorage.setItem(positionStorageKey(entry.sessionId), String(entry.lastPosition));
}

export function updateActivePosition(examId: string, sessionId: string, lastPosition: number) {
  const registry = readRegistry();
  const current = registry[examId];
  if (current?.sessionId === sessionId) {
    registry[examId] = { ...current, lastPosition };
    writeRegistry(registry);
  }
  localStorage.setItem(positionStorageKey(sessionId), String(lastPosition));
}

export function clearActiveSession(examId: string, sessionId?: string) {
  const registry = readRegistry();
  if (!registry[examId] || (sessionId && registry[examId].sessionId !== sessionId)) return;
  delete registry[examId];
  writeRegistry(registry);
}
