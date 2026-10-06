import type { Exam, ExamMode, Question, Results, TestSession } from "./types";

type AnalyticsValue = string | number | boolean;
type AnalyticsParameters = Record<string, AnalyticsValue | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: "event", eventName: string, parameters?: Record<string, AnalyticsValue>) => void;
  }
}

function compact(parameters: AnalyticsParameters): Record<string, AnalyticsValue> {
  return Object.fromEntries(Object.entries(parameters).filter((entry): entry is [string, AnalyticsValue] => entry[1] !== undefined));
}

/** Sends no PII and safely becomes a no-op when GA is blocked or unavailable. */
export function trackEvent(eventName: string, parameters: AnalyticsParameters = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, compact(parameters));
}

/** Prevents lifecycle events from being duplicated by retries, redirects, or React StrictMode. */
export function trackEventOnce(key: string, eventName: string, parameters: AnalyticsParameters = {}) {
  if (typeof window === "undefined") return;
  const storageKey = `topiq.analytics.${key}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    trackEvent(eventName, parameters);
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    trackEvent(eventName, parameters);
  }
}

export function examParameters(exam: Exam, mode: ExamMode) {
  return {
    exam_id: exam.id,
    exam_slug: exam.slug,
    quiz_type: exam.section,
    quiz_mode: mode,
    question_count: exam.questionCount,
    duration_seconds: exam.durationSeconds,
  };
}

export function sessionParameters(session: TestSession) {
  return {
    exam_id: session.exam.id,
    exam_slug: session.exam.slug,
    quiz_mode: session.mode,
    question_count: session.questions.length,
  };
}

export function questionParameters(question: Question) {
  return {
    question_id: question.itemId,
    question_version: question.itemVersion,
    question_number: question.itemOrder,
    test_position: question.testPosition,
    quiz_type: question.section,
    question_type: question.itemType,
  };
}

export function resultParameters(results: Results) {
  const questionCount = results.questionCount ?? 50;
  const correctCount = questionCount - results.incorrectCount;
  return {
    exam_id: results.examId,
    quiz_type: results.section,
    question_count: questionCount,
    correct_count: correctCount,
    incorrect_count: results.incorrectCount,
    accuracy: questionCount ? Math.round((correctCount / questionCount) * 100) : 0,
    score: results.score,
    max_score: results.maxScore,
  };
}
