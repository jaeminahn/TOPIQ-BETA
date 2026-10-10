import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("../../src/email/usage-repository.js", () => ({ emailUsageRepository: {
  authorizeResultReservation: vi.fn().mockResolvedValue({cycle: {}, reserveWarning: false}),
  recordResultReservation: vi.fn().mockResolvedValue(undefined),
} }));
import { pool } from "../../src/core/db.js";
import { emailUsageRepository } from "../../src/email/usage-repository.js";
import { TopikRepository } from "../../src/exam/repository.js";

const survey = { nationalityCode: "VN", birthYear: 2000, topikReasons: ["employment"], topikReasonOther: null,
  koreanStudyDuration: "1_to_2_years", topikExperience: "none", currentTopikLevel: null,
  targetTopikLevel: 4, privacyConsentVersion: "post_exam_survey_v1" };
const input = {sessionId: "session-1", token: "token", email: "user@example.com", rating: 5, locale: "ko" as const};

describe("first survey persistence", () => {
  let completed = false;
  let query: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    completed = false;
    query = vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.includes("SELECT * FROM topik_app.sessions")) return {rowCount: 1, rows: [{
        session_id: input.sessionId, mock_test_id: "exam-1", status: "submitted",
        access_token_hash: createHash("sha256").update(input.token).digest("hex"),
      }]};
      if (sql.includes("SELECT survey_completed_at")) return {rowCount: 1, rows: [{survey_completed_at: completed ? new Date() : null}]};
      if (sql.includes("UPDATE topik_app.attempt_feedback SET")) completed = true;
      if (sql.includes("INSERT INTO topik_app.result_email_deliveries")) return {rowCount: 1, rows: [{expires_at: new Date()}]};
      if (sql.includes("SELECT title_en, title_ko")) return {rowCount: 1, rows: [{title_en: "Reading", title_ko: "읽기"}]};
      return {rowCount: 1, rows: []};
    });
    vi.mocked(pool.connect).mockResolvedValue({query, release: vi.fn()} as never);
  });
  it("rejects missing or invalid surveys before reservations or registration", async () => {
    const repo = new TopikRepository();
    await expect(repo.prepareResultEmail(input)).rejects.toMatchObject({code: "SURVEY_REQUIRED"});
    await expect(repo.prepareResultEmail({...input, survey: {...survey, birthYear: 1000}})).rejects.toMatchObject({code: "INVALID_SURVEY"});
    await expect(repo.registerResultPreregistration({...input, requestId: "request-1", consentVersion: "preregistration_v1"})).rejects.toMatchObject({code: "SURVEY_REQUIRED"});
    expect(emailUsageRepository.authorizeResultReservation).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO"))).toBe(false);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("locks the session and preserves initial survey and consent on subsequent email requests", async () => {
    const repo = new TopikRepository();
    await repo.prepareResultEmail({...input, survey});
    await repo.prepareResultEmail({...input, rating: 3});
    await repo.prepareResultEmail({...input, survey: {invalid: "ignored after completion"}});
    const updates = query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE topik_app.attempt_feedback SET"));
    expect(updates).toHaveLength(1);
    expect(updates[0]?.[0]).toContain("survey_privacy_consented_at=CURRENT_TIMESTAMP");
    expect(updates[0]?.[1]).toEqual([input.sessionId, "VN", 2000, ["employment"], null, "1_to_2_years", "none", null, 4, "post_exam_survey_v1", "post_exam_survey_v1"]);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("FOR UPDATE"))).toHaveLength(3);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO topik_app.attempt_feedback"), [input.sessionId, 3, "ko"]);
    expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(3);
  });
});
