import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", async () => {
  const { Pool } = await import("pg");
  return {pool: new Pool({connectionString: process.env.SURVEY_TEST_DATABASE_URL ?? "postgresql://localhost:1/unavailable", max: 10})};
});
vi.mock("../../src/email/usage-repository.js", () => ({emailUsageRepository: {
  authorizeResultReservation: vi.fn().mockResolvedValue({cycle: {}, reserveWarning: false}),
  recordResultReservation: vi.fn().mockResolvedValue(undefined),
}}));
import { pool } from "../../src/core/db.js";
import { TopikRepository } from "../../src/exam/repository.js";
import { readSurvey } from "../../src/survey/repository.js";

const sessionId = "10000000-0000-4000-8000-000000000001";
const survey = {nationalityCode: "VN", birthYear: 2000, topikReasons: ["employment"], topikReasonOther: null,
  koreanStudyDuration: "1_to_2_years", topikExperience: "none", currentTopikLevel: null,
  targetTopikLevel: 4, privacyConsentVersion: "post_exam_survey_v1"};
const input = {sessionId, token: "token", rating: 5, email: "user@example.com", locale: "ko" as const};
let ownsSchema = false;

describe.skipIf(!process.env.SURVEY_TEST_DATABASE_URL)("survey in disposable PostgreSQL", () => {
  beforeAll(async () => {
    const check = await pool.query("SELECT current_database() AS name,to_regnamespace('topik_app') AS schema");
    if (check.rows[0].name !== "unigate_survey_test" || check.rows[0].schema) throw Error("Use a fresh disposable database named unigate_survey_test");
    await pool.query(`CREATE SCHEMA topik_app;
      CREATE TABLE topik_app.mock_tests(mock_test_id UUID PRIMARY KEY,title_en TEXT,title_ko TEXT);
      CREATE TABLE topik_app.sessions(session_id UUID PRIMARY KEY,mock_test_id UUID,status TEXT,access_token_hash TEXT,last_seen_at TIMESTAMPTZ);
      CREATE TABLE topik_app.attempt_feedback(session_id UUID PRIMARY KEY REFERENCES topik_app.sessions ON DELETE CASCADE,rating INTEGER,locale TEXT,updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE topik_app.result_email_deliveries(delivery_id UUID PRIMARY KEY,session_id UUID REFERENCES topik_app.sessions ON DELETE CASCADE,email_normalized TEXT,email_original TEXT,locale TEXT,result_token_hash TEXT,expires_at TIMESTAMPTZ);
      INSERT INTO topik_app.mock_tests VALUES ('20000000-0000-4000-8000-000000000001','Reading','읽기');`);
    ownsSchema = true;
    await pool.query("INSERT INTO topik_app.sessions VALUES ($1,'20000000-0000-4000-8000-000000000001','submitted',$2,NULL)", [sessionId,createHash("sha256").update(input.token).digest("hex")]);
    await pool.query("INSERT INTO topik_app.attempt_feedback(session_id,rating,locale) VALUES ($1,3,'ko')", [sessionId]);
    await pool.query(await readFile(resolve(process.cwd(), "migrations/019_post_exam_survey.sql"), "utf8"));
  });
  afterAll(async () => {
    if (ownsSchema) await pool.query("DROP SCHEMA topik_app CASCADE");
    await pool.end();
  });

  it("preserves legacy rows, serializes concurrent submissions, and keeps first consent on retry", async () => {
    expect((await pool.query("SELECT rating,survey_completed_at FROM topik_app.attempt_feedback")).rows[0]).toEqual({rating: 3, survey_completed_at: null});
    const repo = new TopikRepository();
    await expect(repo.prepareResultEmail(input)).rejects.toMatchObject({code: "SURVEY_REQUIRED"});
    await Promise.all(Array.from({length: 8}, () => repo.prepareResultEmail({...input, survey})));
    const first = await readSurvey(pool, sessionId);
    expect(first).toMatchObject({nationalityCode: "VN", birthYear: 2000, topikReasons: ["employment"], privacyConsent: true, currentTopikLevel: null});
    expect(first.completedAt).toBeInstanceOf(Date);
    await repo.prepareResultEmail({...input, rating: 2, email: "retry@example.com", survey: {...survey, birthYear: 1990}});
    await repo.prepareResultEmail({...input, rating: 4});
    expect(await readSurvey(pool, sessionId)).toEqual(first);
    expect((await pool.query("SELECT rating FROM topik_app.attempt_feedback")).rows[0].rating).toBe(4);
    expect((await pool.query("SELECT count(*)::int AS count FROM topik_app.result_email_deliveries")).rows[0].count).toBe(10);
    await expect(pool.query("UPDATE topik_app.attempt_feedback SET target_topik_level=2")).rejects.toMatchObject({code: "23514"});
    await expect(pool.query("UPDATE topik_app.attempt_feedback SET birth_year=NULL")).rejects.toMatchObject({code: "23514"});
    await expect(pool.query("UPDATE topik_app.attempt_feedback SET topik_experience='once',current_topik_level=NULL")).rejects.toMatchObject({code: "23514"});
    await expect(pool.query("UPDATE topik_app.attempt_feedback SET topik_reasons=ARRAY['other']::text[],topik_reason_other=NULL")).rejects.toMatchObject({code: "23514"});
    await pool.query("DELETE FROM topik_app.sessions WHERE session_id=$1", [sessionId]);
    expect(await readSurvey(pool, sessionId)).toBeNull();
  });
});
