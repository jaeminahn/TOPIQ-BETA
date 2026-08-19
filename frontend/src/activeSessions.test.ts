import { beforeEach, describe, expect, it } from "vitest";
import { clearActiveSession, getActiveSession, positionStorageKey, saveActiveSession, updateActivePosition } from "./activeSessions";

describe("active session registry", () => {
  beforeEach(() => localStorage.clear());

  it("persists and updates the last question for each exam", () => {
    saveActiveSession({ examId: "exam-1", sessionId: "session-1", mode: "timed", lastPosition: 1, startedAt: "2026-08-19T00:00:00Z" });
    updateActivePosition("exam-1", "session-1", 17);

    expect(getActiveSession("exam-1")).toMatchObject({ sessionId: "session-1", lastPosition: 17 });
    expect(localStorage.getItem(positionStorageKey("session-1"))).toBe("17");
  });

  it("does not clear a newer session with a stale session id", () => {
    saveActiveSession({ examId: "exam-1", sessionId: "new-session", mode: "practice", lastPosition: 2, startedAt: "2026-08-19T00:00:00Z" });
    clearActiveSession("exam-1", "old-session");
    expect(getActiveSession("exam-1")?.sessionId).toBe("new-session");
  });
});
