import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { AdminRepository } from "../../src/admin-repository.js";
import { pool } from "../../src/db.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };

describe("AdminRepository response sessions", () => {
  beforeEach(() => poolMock.query.mockReset());

  it("returns the latest accepted and unrevoked result email for each session", async () => {
    poolMock.query.mockResolvedValue({
      rowCount: 1,
      rows: [{
        sessionId: "session-1",
        resultEmail: "learner@example.com",
        totalCount: 1,
      }],
    });

    const result = await new AdminRepository().listResponseSessions({ page: 1, pageSize: 20 });
    const sql = String(poolMock.query.mock.calls[0]?.[0]);

    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain("red.status='accepted'");
    expect(sql).toContain("red.revoked_at IS NULL");
    expect(sql).toContain("ORDER BY red.accepted_at DESC NULLS LAST,red.requested_at DESC");
    expect(sql).toContain('email_state.result_email AS "resultEmail"');
    expect(result).toEqual({
      sessions: [{ sessionId: "session-1", resultEmail: "learner@example.com", totalCount: 1 }],
      total: 1,
    });
  });
});

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

describe("AdminRepository reading graph materials", () => {
  beforeEach(() => {
    poolMock.query.mockReset();
    poolMock.connect.mockReset();
  });

  it("normalizes the position 10 prompt and returns the current material asset and latest job", async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [{
      setId: "set-1", setVersion: 1, position: 10, mockTestTitle: "읽기 1회",
      itemId: "item-10", itemVersion: 2, itemType: "content_match_short",
      targetLevel: 3, predictedDifficulty: 0.5, reviewStatus: "reviewed",
      stem: "그래프의 내용과 같은 것을 고르십시오.", choices: ["1", "2", "3", "4"],
      correctAnswer: 2, explanation: "해설", contentJson: { passage: "독서 34%, 운동 28%" },
      materialVisualAssetId: "asset-10", materialImageUrl: "https://example.com/graph.png",
      materialGenerationStatus: "succeeded", materialGenerationError: null, visualOptions: [],
    }] });

    const [item] = await new AdminRepository().listReadingItems("set-1");
    const sql = String(poolMock.query.mock.calls[0]?.[0]);

    expect(sql).toContain("iva.visual_role='material'");
    expect(sql).toContain("vgj.visual_role='material'");
    expect(item!.materialVisual).toMatchObject({
      sourceText: "독서 34%, 운동 28%",
      imagePrompt: expect.stringContaining("독서 34%, 운동 28%"),
      visualAssetId: "asset-10",
      imageUrl: "https://example.com/graph.png",
      generationStatus: "succeeded",
    });
  });

  it("queues a Gemini material job with a deterministic prompt snapshot", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("SELECT iv.item_type,iv.stem,iv.content_json")) return { rowCount: 1, rows: [{
        item_type: "content_match_short", stem: "그래프 문제",
        content_json: { passage: "버스 34%, 지하철 28%" }, has_asset: false,
      }] };
      if (sql.includes("status IN ('queued','processing')")) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(new AdminRepository().enqueueReadingMaterial("admin-1", "item-10", 2, false))
      .resolves.toMatchObject({ queued: true });
    const insert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO topik_app.visual_generation_jobs"));
    expect(insert?.[1]).toEqual(expect.arrayContaining([
      "item-10", 2, 1, "material", "admin-1", false,
      expect.objectContaining({ visualRole: "material", sourceText: "버스 34%, 지하철 28%" }),
    ]));
  });
});

describe("AdminRepository abandoned response deletion", () => {
  beforeEach(() => poolMock.connect.mockReset());

  it("deletes all abandoned sessions even when they have no response observations and records the scope", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("WHERE s.status='abandoned'")) return { rowCount: 2, rows: [
        { session_id: "session-1", user_id: "user-1" },
        { session_id: "session-2", user_id: "user-2" },
      ] };
      if (sql.includes("DELETE FROM topik_app.response_observations")) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(new AdminRepository().deleteResponseSessions("admin-1", "abandoned"))
      .resolves.toEqual({ deletedSessions: 2, deletedObservations: 0 });
    const audit = query.mock.calls.find(([sql]) => String(sql).includes("response_deletion_audits"));
    expect(audit?.[1]).toEqual(expect.arrayContaining(["admin-1", "all_abandoned_sessions", 2, 0]));
    expect(query).toHaveBeenCalledWith("COMMIT");
  });
});

describe("AdminRepository listening generation state", () => {
  beforeEach(() => poolMock.query.mockReset());

  it("returns the latest job status and requested style separately from the applied audio style", async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [{
      leaderItemId: "item-1",
      ttsStyle: { speakingRate: 1, stylePrompt: "applied" },
      generationJobId: "job-1",
      generationStatus: "processing",
      generationTtsStyle: { speakingRate: .9, stylePrompt: "requested" },
      generationScript: { version: "exam_track_v4" },
      narrationVersion: "exam_track_v4",
      appliedScript: { version: "exam_track_v4" },
    }] });

    const result = await new AdminRepository().listListeningItems("set-1");
    const [sql] = poolMock.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('recent.job_id AS "generationJobId"');
    expect(sql).toContain('recent.status AS "generationStatus"');
    expect(sql).toContain('recent.tts_style AS "generationTtsStyle"');
    expect(sql).toContain('recent.script_snapshot AS "generationScript"');
    expect(sql).toContain('g.narration_version END AS "narrationVersion"');
    expect(sql).toContain("question_set_item_audio_bindings");
    expect(sql).toContain("set_asset.narration_version='exam_track_v4'");
    expect(result[0]).toMatchObject({
      ttsStyle: { speakingRate: 1, stylePrompt: "applied" },
      generationJobId: "job-1",
      generationStatus: "processing",
      generationTtsStyle: { speakingRate: .9, stylePrompt: "requested" },
      narrationVersion: "exam_track_v4",
    });
  });

  it("snapshots a set-specific complete narration script when a group is queued", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
      if (sql.includes("WITH leader AS")) return { rowCount: 2, rows: [
        { item_id: "10000000-0000-4000-8000-000000000001", item_version: 1, position: 13, question_prompt: "첫 문제", dialogue_turns: [{ speaker: "남자", text: "안녕하세요." }] },
        { item_id: "10000000-0000-4000-8000-000000000002", item_version: 1, position: 14, question_prompt: "둘째 문제", dialogue_turns: [{ speaker: "남자", text: "안녕하세요." }] },
      ] };
      if (sql.includes("status IN ('queued','processing')")) return { rowCount: 0, rows: [] };
      if (sql.includes("COUNT(*)::int count")) return { rowCount: 1, rows: [{ count: 0 }] };
      return { rowCount: 1, rows: [] };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    const result = await new AdminRepository().enqueueGroup(
      "20000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000001",
      1,
      "10000000-0000-4000-8000-000000000001",
      false,
      { speakingRate: 1, stylePrompt: "" },
    );

    expect(result).toMatchObject({ queued: true, targetCount: 2 });
    const jobInsert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO topik_app.tts_generation_jobs"));
    expect(jobInsert?.[1]).toEqual(expect.arrayContaining([
      "30000000-0000-4000-8000-000000000001", 1, 13,
      expect.objectContaining({ version: "exam_track_v4", positions: [13, 14] }),
    ]));
    const targetInsert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO topik_app.tts_generation_job_targets"));
    expect(targetInsert?.[1]).toEqual(expect.arrayContaining([[13, 14]]));
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
