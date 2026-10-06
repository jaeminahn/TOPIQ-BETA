import { beforeEach, describe, expect, it, vi } from "vitest";
import { resultParameters, trackEvent, trackEventOnce } from "./analytics";

describe("analytics", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.gtag = vi.fn();
  });

  it("sends defined parameters without leaking undefined values", () => {
    trackEvent("quiz_start", { exam_id: undefined, quiz_type: "reading", question_count: 50 });

    expect(window.gtag).toHaveBeenCalledWith("event", "quiz_start", {
      quiz_type: "reading",
      question_count: 50,
    });
  });

  it("deduplicates lifecycle events within the browser tab", () => {
    trackEventOnce("result_view.session-1", "result_view", { score: 80 });
    trackEventOnce("result_view.session-1", "result_view", { score: 80 });

    expect(window.gtag).toHaveBeenCalledOnce();
  });

  it("derives result funnel metrics from the actual question count", () => {
    expect(resultParameters({
      examId: "exam-1",
      sessionId: "session-1",
      titleKo: "읽기",
      section: "reading",
      questionCount: 20,
      score: 70,
      maxScore: 100,
      submittedAt: null,
      incorrectCount: 6,
      incorrect: [],
    })).toMatchObject({ question_count: 20, correct_count: 14, incorrect_count: 6, accuracy: 70 });
  });
});
