import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { AdminRepository } from "../../src/admin/repository.js";
import { pool } from "../../src/core/db.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };

describe("reading set administration", () => {
  beforeEach(() => {
    poolMock.query.mockReset();
    poolMock.connect.mockReset();
  });

  it("lists linked rounds first and marks a valid unlinked set ready", async () => {
    poolMock.query.mockResolvedValue({ rows: [
      {
        setId: "set-new", setSequence: 2, createdAt: new Date("2026-08-11T12:00:00Z"),
        reviewStatus: "reviewed", publishedAt: new Date("2026-08-11T12:00:00Z"), itemCount: 50, validItemCount: 50,
        visualRequired: 1, visualReady: 1,
        mockTestId: null, slug: null, titleKo: null, mockTestPublished: null,
      },
      {
        setId: "set-one", setSequence: 1, createdAt: new Date("2026-08-10T12:00:00Z"),
        reviewStatus: "reviewed", publishedAt: new Date("2026-08-10T12:00:00Z"), itemCount: 50, validItemCount: 50,
        visualRequired: 1, visualReady: 0,
        mockTestId: "mock-one", slug: "topik-ii-reading-1", titleKo: "읽기 1회", mockTestPublished: true,
      },
    ] });

    const result = await new AdminRepository().listReadingSets();

    expect(result.map((set) => set.setId)).toEqual(["set-one", "set-new"]);
    expect(result[0]).toMatchObject({ round: 1, readyToPublish: false });
    expect(result[1]).toMatchObject({ round: null, readyToPublish: true, blockingReasons: [] });
  });

  it("creates the next published reading round in one transaction", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM topik_app.mock_test_sections") && sql.includes("LIMIT 1")) return { rows: [] };
      if (sql.includes("COUNT(*) FILTER (WHERE qsi.position=10)")) return { rows: [{ required: 1, ready: 1 }] };
      if (sql.includes("FROM topik_bank.question_sets")) return { rows: [{ section: "reading", review_status: "reviewed", published_at: new Date(), item_count: 50, valid_item_count: 50 }] };
      if (sql.includes("substring(slug")) return { rows: [{ round: 3, display_order: 5 }] };
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    const result = await new AdminRepository().publishReadingSet("10000000-0000-4000-8000-000000000010");

    expect(result).toMatchObject({ slug: "topik-ii-reading-3", round: 3, published: true, created: true });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO topik_app.mock_tests"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO topik_app.mock_test_sections"))).toBe(true);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("returns the existing round without creating a duplicate", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM topik_app.mock_test_sections")) return { rows: [{ mock_test_id: "mock-three", slug: "topik-ii-reading-3", is_published: true }] };
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    const result = await new AdminRepository().publishReadingSet("10000000-0000-4000-8000-000000000010");

    expect(result).toEqual({ mockTestId: "mock-three", slug: "topik-ii-reading-3", round: 3, published: true, created: false });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO"))).toBe(false);
  });

  it("rejects an incomplete reading set and rolls back", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM topik_app.mock_test_sections")) return { rows: [] };
      if (sql.includes("COUNT(*) FILTER (WHERE qsi.position=10)")) return { rows: [{ required: 1, ready: 1 }] };
      if (sql.includes("FROM topik_bank.question_sets")) return { rows: [{ section: "reading", review_status: "reviewed", published_at: new Date(), item_count: 49, valid_item_count: 49 }] };
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(new AdminRepository().publishReadingSet("10000000-0000-4000-8000-000000000010")).rejects.toMatchObject({ code: "READING_SET_NOT_READY" });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects a new reading round until its question 10 graph is ready", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM topik_app.mock_test_sections")) return { rows: [] };
      if (sql.includes("COUNT(*) FILTER (WHERE qsi.position=10)")) return { rows: [{ required: 1, ready: 0 }] };
      return { rows: [], rowCount: 1 };
    });
    poolMock.connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(new AdminRepository().publishReadingSet("10000000-0000-4000-8000-000000000010"))
      .rejects.toMatchObject({ code: "READING_VISUALS_INCOMPLETE" });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
});
