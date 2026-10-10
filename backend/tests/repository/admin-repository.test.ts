import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { AdminRepository } from "../../src/admin/repository.js";
import { pool } from "../../src/core/db.js";

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
        skipped: false,
        timedOut: false,
        answerChanged: true,

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
    expect(String(poolMock.query.mock.calls[0]?.[0])).not.toContain("response_time_ms");
    expect(result.responses[0]).not.toHaveProperty("responseTimeMs");
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

  it("normalizes the position 10 prompt and returns the current material asset", async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [{
      setId: "set-1", position: 10, mockTestTitle: "읽기 1회",
      itemId: "item-10", itemVersion: 2, itemType: "content_match_short",
      targetLevel: 3, reviewStatus: "reviewed",
      stem: "그래프의 내용과 같은 것을 고르십시오.", choices: ["1", "2", "3", "4"],
      correctAnswer: 2, explanation: "해설", contentJson: { passage: "독서 34%, 운동 28%" },
      materialVisualAssetId: "asset-10", materialImageUrl: "https://example.com/graph.png",
      visualOptions: [],
    }] });

    const [item] = await new AdminRepository().listReadingItems("set-1");
    const [sql, values] = poolMock.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("iva.visual_role='material'");
    expect(sql).not.toContain("visual_generation_jobs");
    expect(sql).not.toContain("set_version");
    expect(values).toEqual(["set-1"]);
    expect(item!.materialVisual).toMatchObject({
      sourceText: "독서 34%, 운동 28%",
      imagePrompt: expect.stringContaining("독서 34%, 운동 28%"),
      visualAssetId: "asset-10",
      imageUrl: "https://example.com/graph.png",
    });
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

  it("returns applied audio data without job state", async () => {
    poolMock.query.mockResolvedValue({rows: [],rowCount:0});
    await new AdminRepository().listListeningItems("set-1");
    const sql = poolMock.query.mock.calls[0]![0] as string;
    expect(sql).toContain('AS "ttsStyle"');
    expect(sql).not.toContain("tts_generation_jobs");
    expect(sql).not.toContain("generationStatus");
  });
  it("queries the set's current item pointers directly", async () => {
    poolMock.query.mockResolvedValue({ rowCount: 0, rows: [] });

    await new AdminRepository().listListeningItems("set-1");
    const [sql, values] = poolMock.query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain("FROM topik_bank.question_set_items qsi");
    expect(sql).not.toContain("MAX(set_version)");
    expect(values).toEqual(["set-1", null]);
  });

});

describe("AdminRepository question revisions", () => {
  beforeEach(() => poolMock.connect.mockReset());

  const listeningMember = (
    position: number,
    itemId: string,
    itemType: string,
    questionPrompt: string,
    dialogueTurns: Array<{ speaker: "남자" | "여자"; text: string }>,
  ) => ({
    position, item_id: itemId, item_version: 1,
    section: "listening", item_type: itemType, type_slot: position, primary_skill: "listening",
    target_level: 3,
    generator_provider: "test", generator_model: "test", generator_version: "v1", prompt_version: "a".repeat(64),
    review_status: "reviewed", stem: "", choices: ["1", "2", "3", "4"], correct_answer: 1,
    explanation: "old explanation",
    content_json: {
      stem: "", choices: ["1", "2", "3", "4"], question_prompt: questionPrompt,
      dialogue_turns: dialogueTurns, repeat_count: 1,
    },
    source_provenance: {},
  });

  const revisionQuery = (members: ReturnType<typeof listeningMember>[]) => vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
    if (sql.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [{}] };
    if (sql.includes("FROM topik_bank.question_sets") && sql.includes("FOR UPDATE")) {
      return { rowCount: 1, rows: [{ review_status: "reviewed", default_target_level: 3, published_at: new Date() }] };
    }
    if (sql.includes("SELECT qsi.position,iv.*")) return { rowCount: members.length, rows: members };
    if (sql.includes("MAX(item_version)")) return { rowCount: 1, rows: [{ version: 2 }] };
    if (sql.includes("FROM topik_app.item_visual_assets") && sql.includes("SELECT option_number")) return { rowCount: 0, rows: [] };
    if (sql.includes("UPDATE topik_bank.question_set_items")) return { rowCount: 1, rows: [] };
    if (sql.includes("SELECT DISTINCT mock_test_id")) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [] };
  });

  it("creates one immutable item version, updates one pointer, and unpublishes the linked round", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("FROM topik_bank.question_sets") && sql.includes("FOR UPDATE")) return { rowCount: 1, rows: [{ review_status: "reviewed", default_target_level: 3, published_at: new Date() }] };
      if (sql.includes("SELECT qsi.position,iv.*")) return { rowCount: 1, rows: [{
        position: 1, item_id: "30000000-0000-4000-8000-000000000001", item_version: 1,
        section: "reading", item_type: "grammar_blank", type_slot: 1, primary_skill: "grammar",
        target_level: 3,
        generator_provider: "test", generator_model: "test", generator_version: "v1", prompt_version: "a".repeat(64),
        review_status: "reviewed", stem: "old", choices: ["1", "2", "3", "4"], correct_answer: 1,
        explanation: "old explanation", content_json: { stem: "old", choices: ["1", "2", "3", "4"] }, source_provenance: {},
      }] };
      if (sql.includes("MAX(item_version)")) return { rowCount: 1, rows: [{ version: 2 }] };
      if (sql.includes("FROM topik_app.item_visual_assets") && sql.includes("SELECT option_number")) return { rowCount: 0, rows: [] };
      if (sql.includes("UPDATE topik_bank.question_set_items")) return { rowCount: 1, rows: [] };
      if (sql.includes("SELECT DISTINCT mock_test_id")) return { rowCount: 1, rows: [{ mock_test_id: "20000000-0000-4000-8000-000000000001" }] };
      return { rowCount: 1, rows: [] };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    const result = await new AdminRepository().reviseQuestionSet(
      "10000000-0000-4000-8000-000000000001",
      [{
        position: 1, itemId: "30000000-0000-4000-8000-000000000001", itemVersion: 1,
        stem: "new", choices: ["1", "2", "3", "4"], correctAnswer: 2,
        explanation: "new explanation", contentJson: { stem: "new", choices: ["1", "2", "3", "4"] },
      }],
    );

    expect(result).toMatchObject({ published: false, revisions: [{ position: 1, itemVersion: 2 }] });
    expect(result).not.toHaveProperty("setVersion");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO topik_bank.item_versions"))).toBe(true);
    const pointerUpdates = query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE topik_bank.question_set_items"));
    expect(pointerUpdates).toHaveLength(1);
    expect(pointerUpdates[0]?.[1]).toEqual([
      "10000000-0000-4000-8000-000000000001", 1, 2,
      "30000000-0000-4000-8000-000000000001",
    ]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET is_published=FALSE"))).toBe(true);
  });

  it("reuses every group audio binding when only answers and choices change", async () => {
    const singleDialogue = [{ speaker: "여자" as const, text: "안녕하세요." }];
    const pairDialogue = [{ speaker: "남자" as const, text: "회의가 시작됩니다." }];
    const members = [
      listeningMember(1, "30000000-0000-4000-8000-000000000001", "listen_and_choose", "들은 내용을 고르십시오.", singleDialogue),
      listeningMember(13, "30000000-0000-4000-8000-000000000013", "paired_13_14", "남자의 생각을 고르십시오.", pairDialogue),
      listeningMember(14, "30000000-0000-4000-8000-000000000014", "paired_13_14", "들은 내용과 같은 것을 고르십시오.", pairDialogue),
    ];
    const query = revisionQuery(members);
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await new AdminRepository().reviseQuestionSet("10000000-0000-4000-8000-000000000001", [{
      position: 1, itemId: members[0]!.item_id, itemVersion: 1, stem: "",
      choices: ["가", "2", "3", "4"], correctAnswer: 2, explanation: "new explanation",
      contentJson: { ...members[0]!.content_json, choices: ["가", "2", "3", "4"] },
    }]);

    const itemVersions = query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO topik_bank.item_versions"));
    expect(itemVersions).toHaveLength(1);
    const pointerUpdates = query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE topik_bank.question_set_items"));
    expect(pointerUpdates).toHaveLength(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE topik_app.question_set_item_audio_bindings"))).toBe(false);
  });

  it("leaves only the changed narration group without a copied audio binding", async () => {
    const singleDialogue = [{ speaker: "여자" as const, text: "안녕하세요." }];
    const pairDialogue = [{ speaker: "남자" as const, text: "회의가 시작됩니다." }];
    const members = [
      listeningMember(1, "30000000-0000-4000-8000-000000000001", "listen_and_choose", "들은 내용을 고르십시오.", singleDialogue),
      listeningMember(13, "30000000-0000-4000-8000-000000000013", "paired_13_14", "남자의 생각을 고르십시오.", pairDialogue),
      listeningMember(14, "30000000-0000-4000-8000-000000000014", "paired_13_14", "들은 내용과 같은 것을 고르십시오.", pairDialogue),
    ];
    const query = revisionQuery(members);
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await new AdminRepository().reviseQuestionSet("10000000-0000-4000-8000-000000000001", [{
      position: 1, itemId: members[0]!.item_id, itemVersion: 1, stem: "",
      choices: ["1", "2", "3", "4"], correctAnswer: 1, explanation: "old explanation",
      contentJson: { ...members[0]!.content_json, question_prompt: "새 문제 문장을 고르십시오." },
    }]);

    const invalidation = query.mock.calls.find(([sql]) => String(sql).includes("UPDATE topik_app.question_set_item_audio_bindings"));
    expect(invalidation?.[1]).toEqual(["10000000-0000-4000-8000-000000000001", [1]]);
  });

  it("versions and invalidates only a changed shared-dialogue group", async () => {
    const singleDialogue = [{ speaker: "여자" as const, text: "안녕하세요." }];
    const pairDialogue = [{ speaker: "남자" as const, text: "회의가 시작됩니다." }];
    const changedPairDialogue = [{ speaker: "남자" as const, text: "회의 시간이 변경됐습니다." }];
    const members = [
      listeningMember(1, "30000000-0000-4000-8000-000000000001", "listen_and_choose", "들은 내용을 고르십시오.", singleDialogue),
      listeningMember(13, "30000000-0000-4000-8000-000000000013", "paired_13_14", "남자의 생각을 고르십시오.", pairDialogue),
      listeningMember(14, "30000000-0000-4000-8000-000000000014", "paired_13_14", "들은 내용과 같은 것을 고르십시오.", pairDialogue),
    ];
    const query = revisionQuery(members);
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await new AdminRepository().reviseQuestionSet("10000000-0000-4000-8000-000000000001", members.slice(1).map((member) => ({
      position: member.position, itemId: member.item_id, itemVersion: 1, stem: "",
      choices: ["1", "2", "3", "4"], correctAnswer: 1, explanation: "old explanation",
      contentJson: { ...member.content_json, dialogue_turns: changedPairDialogue },
    })));

    const itemVersions = query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO topik_bank.item_versions"));
    expect(itemVersions).toHaveLength(2);
    const pointerUpdates = query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE topik_bank.question_set_items"));
    expect(pointerUpdates).toHaveLength(2);
    const invalidation = query.mock.calls.find(([sql]) => String(sql).includes("UPDATE topik_app.question_set_item_audio_bindings"));
    expect(invalidation?.[1]).toEqual(["10000000-0000-4000-8000-000000000001", [13, 14]]);
  });

  it("rejects a stale item version before inserting a revision", async () => {
    const member = listeningMember(1, "30000000-0000-4000-8000-000000000001", "listen_and_choose", "문제", [{ speaker: "여자", text: "안녕하세요." }]);
    const query = revisionQuery([member]);
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(new AdminRepository().reviseQuestionSet("10000000-0000-4000-8000-000000000001", [{
      position: 1, itemId: member.item_id, itemVersion: 0, stem: "", choices: ["1", "2", "3", "4"],
      correctAnswer: 2, explanation: "수정", contentJson: member.content_json,
    }])).rejects.toMatchObject({ code: "QUESTION_VERSION_CONFLICT" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO topik_bank.item_versions"))).toBe(false);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects an unchanged save without creating a version", async () => {
    const member = listeningMember(1, "30000000-0000-4000-8000-000000000001", "listen_and_choose", "문제", [{ speaker: "여자", text: "안녕하세요." }]);
    const query = revisionQuery([member]);
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(new AdminRepository().reviseQuestionSet("10000000-0000-4000-8000-000000000001", [{
      position: 1, itemId: member.item_id, itemVersion: 1, stem: member.stem,
      choices: member.choices, correctAnswer: member.correct_answer, explanation: member.explanation,
      contentJson: member.content_json,
    }])).rejects.toMatchObject({ code: "QUESTION_UNCHANGED" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO topik_bank.item_versions"))).toBe(false);
  });
});

describe("AdminRepository question version history", () => {
  beforeEach(() => poolMock.query.mockReset());

  it("returns all item versions newest first and marks the current pointer", async () => {
    poolMock.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ position: 7, item_version: 2 }] })
      .mockResolvedValueOnce({ rowCount: 2, rows: [
        { itemId: "item-1", itemVersion: 2, isCurrent: true },
        { itemId: "item-1", itemVersion: 1, isCurrent: false },
      ] });

    const result = await new AdminRepository().listQuestionVersions("set-1", "item-1");
    const historySql = String(poolMock.query.mock.calls[1]?.[0]);
    expect(historySql).toContain("ORDER BY item_version DESC");
    expect(poolMock.query.mock.calls[1]?.[1]).toEqual(["item-1", 2]);
    expect(result).toMatchObject({ position: 7, currentVersion: 2, versions: [
      { itemVersion: 2, isCurrent: true }, { itemVersion: 1, isCurrent: false },
    ] });
  });
});
