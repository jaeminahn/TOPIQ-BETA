import { beforeEach, describe, expect, it } from "vitest";
import type { Results } from "./types";
import { COMPLETED_RESULTS_KEY, readCompletedResults, saveCompletedResult } from "./completedResults";

const result = (input: Partial<Results> = {}): Results => ({
  examId: "exam-reading-1",
  sessionId: "session-new",
  titleKo: "읽기 1회",
  score: 82,
  maxScore: 100,
  submittedAt: "2026-08-11T12:00:00.000Z",
  incorrectCount: 0,
  incorrect: [],
  ...input,
});

describe("completed results storage", () => {
  beforeEach(() => localStorage.clear());

  it("stores the latest result per exam and protects a newer result", () => {
    expect(saveCompletedResult(result())).toBe(true);
    expect(saveCompletedResult(result({ sessionId: "session-old", score: 40, submittedAt: "2026-08-10T12:00:00.000Z" }))).toBe(false);
    expect(readCompletedResults()["exam-reading-1"]).toMatchObject({ sessionId: "session-new", score: 82 });

    expect(saveCompletedResult(result({ sessionId: "session-latest", score: 90, submittedAt: "2026-08-12T12:00:00.000Z" }))).toBe(true);
    expect(readCompletedResults()["exam-reading-1"]).toMatchObject({ sessionId: "session-latest", score: 90 });
  });

  it("ignores malformed storage and results without a submission time", () => {
    localStorage.setItem(COMPLETED_RESULTS_KEY, "not-json");
    expect(readCompletedResults()).toEqual({});
    expect(saveCompletedResult(result({ submittedAt: null }))).toBe(false);
  });
});
