import type { Results } from "./types";

export const COMPLETED_RESULTS_KEY = "unigate.topik.completed-results.v1";

export interface CompletedExamResult {
  examId: string;
  sessionId: string;
  score: number;
  maxScore: number;
  submittedAt: string;
}

function isCompletedExamResult(value: unknown): value is CompletedExamResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.examId === "string" && Boolean(record.examId)
    && typeof record.sessionId === "string" && Boolean(record.sessionId)
    && typeof record.score === "number" && Number.isFinite(record.score)
    && typeof record.maxScore === "number" && record.maxScore > 0
    && typeof record.submittedAt === "string" && Number.isFinite(Date.parse(record.submittedAt));
}

export function readCompletedResults(): Record<string, CompletedExamResult> {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPLETED_RESULTS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, CompletedExamResult>>((results, [examId, value]) => {
      if (isCompletedExamResult(value) && value.examId === examId) results[examId] = value;
      return results;
    }, {});
  } catch {
    return {};
  }
}

export function saveCompletedResult(results: Results) {
  if (!results.submittedAt) return false;
  const next: CompletedExamResult = {
    examId: results.examId,
    sessionId: results.sessionId,
    score: results.score,
    maxScore: results.maxScore,
    submittedAt: results.submittedAt,
  };
  if (!isCompletedExamResult(next)) return false;

  const current = readCompletedResults();
  const previous = current[next.examId];
  if (previous && Date.parse(previous.submittedAt) > Date.parse(next.submittedAt)) return false;
  try {
    localStorage.setItem(COMPLETED_RESULTS_KEY, JSON.stringify({ ...current, [next.examId]: next }));
    return true;
  } catch {
    return false;
  }
}
