import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

import { pool } from "./db.js";
import { TopikRepository } from "./repository.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };

describe("TopikRepository session audio selection", () => {
  beforeEach(() => {
    poolMock.query.mockReset();
    poolMock.connect.mockReset();
  });

  it("prefers the set-position exam track and exposes a single allowed play", async () => {
    const token = "session-token";
    const session = {
      session_id: "session-1", user_id: "user-1", mock_test_id: "exam-1", mode: "timed",
      status: "in_progress", access_token_hash: createHash("sha256").update(token).digest("hex"),
      started_at: new Date(), expires_at: new Date(Date.now() + 60_000), submitted_at: null,
      abandoned_at: null, results_unlocked_at: null, score: null, max_score: 100,
      timed_out_submission: false,
    };
    const transactionQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM topik_app.sessions")) return { rowCount: 1, rows: [session] };
      return { rowCount: 0, rows: [] };
    });
    poolMock.connect.mockResolvedValue({ query: transactionQuery, release: vi.fn() });
    poolMock.query.mockImplementation(async (sql: string) => {
      if (sql.includes("JOIN topik_app.mock_tests")) return {
        rowCount: 1,
        rows: [{ ...session, slug: "listening-1", title_en: "Listening 1", title_ko: "듣기 1회" }],
      };
      if (sql.includes("FROM topik_app.session_items si")) return {
        rowCount: 1,
        rows: [{
          item_order: 1, section: "listening", test_position: 13, item_id: "item-1", item_version: 1,
          item_type: "paired_13_14", stem: "", choices: ["1", "2", "3", "4"],
          content_json: { question_prompt: "다음을 듣고 답하십시오.", repeat_count: 2 },
          audio_asset_id: "exam-track-1", audio_repeat_count: 1, visual_assets: [], selected_option: null,
        }],
      };
      return { rowCount: 1, rows: [] };
    });

    const result = await new TopikRepository().getSession("session-1", token);
    const questionSql = poolMock.query.mock.calls.find(([sql]) => String(sql).includes("FROM topik_app.session_items si"))?.[0];

    expect(questionSql).toContain("question_set_item_audio_bindings");
    expect(questionSql).toContain("narration_version IN ('exam_track_v2','exam_track_v3','exam_track_v4') THEN 1");
    expect(result.questions[0]).toMatchObject({ audioAssetId: "exam-track-1", repeatCount: 1 });
  });
});

describe("TopikRepository abandonSession", () => {
  beforeEach(() => poolMock.connect.mockReset());

  it("preserves the session while marking it abandoned", async () => {
    const token = "session-token";
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        session_id: "session-1", user_id: "user-1", mock_test_id: "exam-1", mode: "practice",
        status: "in_progress", access_token_hash: createHash("sha256").update(token).digest("hex"),
        started_at: new Date(), expires_at: null, submitted_at: null, abandoned_at: null,
        results_unlocked_at: null, score: null, max_score: 100, timed_out_submission: false,
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(new TopikRepository().abandonSession("session-1", token)).resolves.toEqual({ status: "abandoned" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='abandoned'"), ["session-1"]);
  });
});
