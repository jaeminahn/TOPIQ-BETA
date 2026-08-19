import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

import { pool } from "./db.js";
import { TopikRepository } from "./repository.js";

const poolMock = pool as unknown as { connect: ReturnType<typeof vi.fn> };

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
