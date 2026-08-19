import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { AdminRepository } from "./admin-repository.js";
import { pool } from "./db.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };

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

describe("AdminRepository question revisions", () => {
  beforeEach(() => poolMock.connect.mockReset());

  it("creates an immutable item and set version, repoints the round, and unpublishes it", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("FROM topik_bank.question_set_versions") && sql.includes("FOR UPDATE")) return { rowCount: 1, rows: [{ review_status: "reviewed", default_target_level: 3, default_predicted_difficulty: 0, published_at: new Date() }] };
      if (sql.includes("SELECT qsi.position,iv.*")) return { rowCount: 1, rows: [{
        position: 1, item_id: "30000000-0000-4000-8000-000000000001", item_version: 1,
        section: "reading", item_type: "grammar_blank", type_slot: 1, primary_skill: "grammar",
        target_level: 3, predicted_difficulty: 0, irt_difficulty: null, irt_discrimination: null,
        generator_provider: "test", generator_model: "test", generator_version: "v1", prompt_version: "a".repeat(64),
        review_status: "reviewed", stem: "old", choices: ["1", "2", "3", "4"], correct_answer: 1,
        explanation: "old explanation", content_json: { stem: "old", choices: ["1", "2", "3", "4"] }, source_provenance: {},
      }] };
      if (sql.includes("MAX(item_version)")) return { rowCount: 1, rows: [{ version: 2 }] };
      if (sql.includes("FROM topik_app.item_visual_assets") && sql.includes("SELECT option_number")) return { rowCount: 0, rows: [] };
      if (sql.includes("MAX(set_version)")) return { rowCount: 1, rows: [{ version: 2 }] };
      if (sql.includes("UPDATE topik_app.mock_test_sections")) return { rowCount: 1, rows: [{ mock_test_id: "20000000-0000-4000-8000-000000000001" }] };
      return { rowCount: 1, rows: [] };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    const result = await new AdminRepository().reviseQuestionSet(
      "10000000-0000-4000-8000-000000000001",
      1,
      [{
        position: 1, itemId: "30000000-0000-4000-8000-000000000001", itemVersion: 1,
        stem: "new", choices: ["1", "2", "3", "4"], correctAnswer: 2,
        explanation: "new explanation", contentJson: { stem: "new", choices: ["1", "2", "3", "4"] },
      }],
    );

    expect(result).toMatchObject({ setVersion: 2, published: false, revisions: [{ position: 1, itemVersion: 2 }] });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO topik_bank.item_versions"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET is_published=FALSE"))).toBe(true);
  });
});
