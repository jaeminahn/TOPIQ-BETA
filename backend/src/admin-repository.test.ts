import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { AdminRepository } from "./admin-repository.js";
import { pool } from "./db.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe("AdminRepository response details", () => {
  beforeEach(() => poolMock.query.mockReset());

  it("returns the versioned question presentation and explanation with each response", async () => {
    poolMock.query.mockResolvedValue({
      rowCount: 1,
      rows: [{
        observationId: "observation-1",
        userId: "user-1",
        sessionId: "session-1",
        itemId: "item-1",
        itemVersion: 2,
        itemOrder: 7,
        section: "listening",
        testPosition: 7,
        mockTestTitle: "TOPIK II 듣기 모의고사 1회",
        itemType: "listen_and_choose",
        selectedOption: 2,
        correctAnswer: 3,
        isCorrect: false,
        responseTimeMs: 4500,
        skipped: false,
        timedOut: false,
        answerChanged: true,
        policyVersion: "STATIC_MOCK_V1",
        createdAt: new Date("2026-08-19T12:00:00Z"),
        mode: "timed",
        score: 80,
        rating: 4,
        questionStem: "관리자에게 노출되면 안 되는 원시 필드",
        questionChoices: ["하나", "둘", "셋", "넷"],
        questionContent: {
          question_prompt: "들은 내용과 같은 것을 고르십시오.",
          choices: ["하나", "둘", "셋", "넷"],
          dialogue_turns: [{ speaker: "여자", text: "안녕하세요." }],
          repeat_count: 2,
        },
        explanation: "정답은 셋입니다.",
        audioAssetId: "audio-1",
        visualAssets: [{ number: 3, imageUrl: "https://example.com/three.png" }],
      }],
    });

    const result = await new AdminRepository().getResponseSession("session-1");

    expect(poolMock.query).toHaveBeenCalledWith(expect.stringContaining("iv.content_json"), ["session-1"]);
    expect(result.responses[0]).toMatchObject({
      observationId: "observation-1",
      explanation: "정답은 셋입니다.",
      question: {
        itemId: "item-1",
        itemVersion: 2,
        questionPrompt: "들은 내용과 같은 것을 고르십시오.",
        choices: ["하나", "둘", "셋", "넷"],
        transcript: [{ speaker: "여자", text: "안녕하세요." }],
        audioAssetId: "audio-1",
        visualOptions: [{ number: 3, imageUrl: "https://example.com/three.png" }],
        selectedOption: 2,
      },
    });
    expect(result.responses[0]).not.toHaveProperty("questionContent");
    expect(result.responses[0]).not.toHaveProperty("questionChoices");
  });
});
