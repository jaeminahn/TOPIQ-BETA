import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import {
  AdminExportRepository,
  buildAdminExportQuery,
  encodeCsvRow,
  exportFilename,
  parseAdminExportFilters,
} from "../../src/admin/export.js";
import { pool } from "../../src/core/db.js";

const poolMock = pool as unknown as {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
};

const filters = parseAdminExportFilters({ status: "submitted" });

describe("admin CSV exports", () => {
  beforeEach(() => {
    poolMock.query.mockReset();
    poolMock.connect.mockReset();
  });

  it("normalizes defaults and rejects invalid KST date ranges", () => {
    expect(filters).toMatchObject({
      status: "submitted", minAssignedCount: 0, outcome: "all", rating: "all", resultEmail: "all",
    });
    expect(() => parseAdminExportFilters({ from: "2026-09-10", to: "2026-09-09" }))
      .toThrowError(expect.objectContaining({ code: "INVALID_EXPORT_FILTER" }));
    expect(() => parseAdminExportFilters({ from: "2026-02-31" }))
      .toThrowError(expect.objectContaining({ code: "INVALID_EXPORT_FILTER" }));
  });

  it("builds question analytics with both accuracy denominators and no private email fields", () => {
    const query = buildAdminExportQuery("questions", {
      ...filters,
      section: "reading",
      itemType: "grammar_blank",
      minAssignedCount: 10,
    });

    expect(query.text).toContain("answered_accuracy_pct");
    expect(query.text).toContain("overall_accuracy_pct");
    expect(query.text).toContain("option_1_count");
    expect(query.text).toContain("PERCENTILE_CONT(0.5)");
    expect(query.text).toContain("COALESCE(st.assigned_count,0) >=");
    expect(query.text).toContain("topik_app.item_visual_assets");
    expect(query.text).toContain("COALESCE(choice_visuals.choice_1_url,qi.export_choices->>0) AS choice_1");
    expect(query.text).toContain("iva.visual_role='choice' AND iva.is_current");
    expect(query.text).not.toContain("email_normalized");
    expect(query.text).not.toContain("access_token_hash");
    expect(query.text).not.toContain("set_version");
    expect(query.values).toEqual(expect.arrayContaining(["submitted", "reading", "grammar_blank", 10]));
  });

  it("keeps unanswered rows distinct and applies response outcome filters", () => {
    const query = buildAdminExportQuery("responses", {
      ...filters,
      status: "all",
      outcome: "unanswered",
      from: "2026-09-01",
      to: "2026-09-09",
    });

    expect(query.text).toContain("THEN 'unanswered'");
    expect(query.text).toContain("THEN NULL");
    expect(query.text).toContain("response_rows.response_outcome=");
    expect(query.text).toContain("AT TIME ZONE 'Asia/Seoul'");
    expect(query.text).not.toContain("set_version");
    expect(query.values).toContain("unanswered");
  });

  it("exports the latest active accepted address in session summaries", () => {
    const query = buildAdminExportQuery("sessions", {
      ...filters,
      section: "listening",
      rating: "5",
      resultEmail: "accepted",
    });

    expect(query.text).toContain("af.rating=");
    expect(query.text).toContain("email_state.result_email IS NOT NULL");
    expect(query.text).toContain("BOOL_OR(si.section=");
    expect(query.text).toContain("red.email_original AS result_email");
    expect(query.text).toContain("red.revoked_at IS NULL");
    expect(query.text).toContain("ORDER BY red.accepted_at DESC NULLS LAST,red.requested_at DESC");
    expect(query.text).not.toContain("provider_message_id");
    expect(query.values).toEqual(expect.arrayContaining(["submitted", "listening", 5]));
  });

  it("escapes spreadsheet formulas, quotes and line breaks", () => {
    expect(encodeCsvRow(["normal", "=2+2", "a,\"b\"", "두 줄\n문장", null]))
      .toBe('"normal","\'=2+2","a,""b""","두 줄\n문장",\r\n');
  });

  it("previews session exports without a second cohort count query", async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ count: 7 }] });

    await expect(new AdminExportRepository().preview("sessions", filters))
      .resolves.toEqual({ rowCount: 7, sessionCount: 7 });
    expect(poolMock.query).toHaveBeenCalledTimes(1);
  });

  it("streams a BOM, stable headers and rows in cursor batches", async () => {
    let fetchCount = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("FETCH")) {
        fetchCount += 1;
        return fetchCount === 1
          ? { rows: [{
            session_id: "session-1", user_id: "user-1", mock_test_id: "test-1",
            result_email: "learner@example.com", result_email_accepted: true,
          }] }
          : { rows: [] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    poolMock.connect.mockResolvedValue({ query, release });

    const chunks: Buffer[] = [];
    for await (const chunk of new AdminExportRepository().csvStream("sessions", filters)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const csv = Buffer.concat(chunks).toString("utf8");

    expect(csv.startsWith("\uFEFF\"session_id\",\"user_id\"")).toBe(true);
    expect(csv).toContain('"session-1","user-1","test-1"');
    expect(csv).toContain('"learner@example.com","true"');
    expect(query).toHaveBeenCalledWith(expect.stringContaining("DECLARE admin_export_cursor"), ["submitted"]);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("uses a deterministic KST filename", () => {
    expect(exportFilename("questions", new Date("2026-09-09T01:02:03Z")))
      .toBe("unigate_questions_20260909_100203_KST.csv");
  });
});
