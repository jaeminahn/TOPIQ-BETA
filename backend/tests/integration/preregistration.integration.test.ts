import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Explicit opt-in: this test writes only to a fresh disposable database with this exact name.
vi.mock("../../src/core/db.js", async () => {
  const { Pool } = await import("pg");
  return { pool: new Pool({ connectionString: process.env.PREREGISTRATION_TEST_DATABASE_URL ?? "postgresql://localhost:1/unavailable", max: 8 }) };
});

import { pool } from "../../src/core/db.js";
import { PreregistrationRepository, preregistrationConsentVersion, type PreregistrationInput } from "../../src/preregistration/repository.js";
import { AdminPreregistrationRepository } from "../../src/admin/preregistrations/repository.js";
import { TopikRepository } from "../../src/exam/repository.js";

const filters = { deduplicate: false, search: "" };
const paging = { page: 1, pageSize: 50 };
const publicRepo = new PreregistrationRepository();
const adminRepo = new AdminPreregistrationRepository();
const sessionId = "10000000-0000-4000-8000-000000000001";
const adminId = "20000000-0000-4000-8000-000000000001";
const token = "session-token";
const input = (email = "User@Example.com"): PreregistrationInput => ({ email, locale: "ko", requestId: randomUUID(), consentVersion: preregistrationConsentVersion });
let ownsSchema = false;

describe.skipIf(!process.env.PREREGISTRATION_TEST_DATABASE_URL)("preregistrations in disposable PostgreSQL", () => {
  beforeAll(async () => {
    const check = await pool.query("SELECT current_database() AS name,to_regnamespace('topik_app') AS schema");
    if (check.rows[0].name !== "unigate_preregistration_test" || check.rows[0].schema) {
      throw new Error("Use a fresh disposable database named unigate_preregistration_test");
    }
    await pool.query(`CREATE SCHEMA topik_app;
      CREATE TABLE topik_app.sessions(session_id UUID PRIMARY KEY, status TEXT NOT NULL, access_token_hash TEXT NOT NULL);
      CREATE TABLE topik_app.attempt_feedback(session_id UUID REFERENCES topik_app.sessions ON DELETE CASCADE, survey_completed_at TIMESTAMPTZ);`);
    ownsSchema = true;
    await pool.query(await readFile(resolve(process.cwd(), "migrations/018_preregistrations.sql"), "utf8"));
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE topik_app.attempt_feedback,topik_app.preregistrations,topik_app.preregistration_deletion_audits,topik_app.sessions RESTART IDENTITY");
    await pool.query("ALTER SEQUENCE topik_app.preregistration_landing_seq RESTART; ALTER SEQUENCE topik_app.preregistration_topik_seq RESTART");
    await pool.query("INSERT INTO topik_app.sessions VALUES ($1,'submitted',$2)", [sessionId, createHash("sha256").update(token).digest("hex")]);
    await pool.query("INSERT INTO topik_app.attempt_feedback VALUES ($1,CURRENT_TIMESTAMP)", [sessionId]);
  });
  afterAll(async () => {
    if (ownsSchema) await pool.query("DROP SCHEMA topik_app CASCADE");
    await pool.end();
  });

  it("generates source IDs, preserves deliberate duplicates and makes concurrent retries idempotent", async () => {
    const application = input();
    const attempts = await Promise.all(Array.from({ length: 16 }, () => publicRepo.registerLanding(application)));
    expect(new Set(attempts.map((row) => row.registrationId))).toEqual(new Set(["001-00000001"]));
    const topik = await new TopikRepository().registerResultPreregistration({ ...input(), sessionId, token });
    expect(topik.registrationId).toBe("002-00000001");
    const distinct = await Promise.all(Array.from({ length: 20 }, () => publicRepo.registerLanding(input())));
    expect(new Set(distinct.map((row) => row.registrationId)).size).toBe(20);
    expect((await adminRepo.list(filters, paging)).total).toBe(22);
    const row = (await pool.query("SELECT * FROM topik_app.preregistrations WHERE registration_id=$1", [attempts[0]!.registrationId])).rows[0];
    expect(row).toMatchObject({ email_original: "User@Example.com", email_normalized: "user@example.com", privacy_consent: true, marketing_consent: true });
    await expect(publicRepo.registerLanding({ ...application, email: "different@example.com" })).rejects.toMatchObject({ code: "PREREGISTRATION_REQUEST_CONFLICT" });
  });

  it("rejects invalid tokens and unsubmitted sessions before inserting", async () => {
    const examRepo = new TopikRepository();
    await expect(examRepo.registerResultPreregistration({ ...input(), sessionId, token: "invalid" })).rejects.toMatchObject({ statusCode: 401 });
    await pool.query("UPDATE topik_app.sessions SET status='in_progress'");
    await expect(examRepo.registerResultPreregistration({ ...input(), sessionId, token })).rejects.toMatchObject({ code: "SESSION_NOT_SUBMITTED" });
    expect((await adminRepo.list(filters, paging)).total).toBe(0);
  });

  it("filters before selecting the latest email and uses KST inclusive calendar dates", async () => {
    const before = await publicRepo.registerLanding(input("before@example.com"));
    const first = await publicRepo.registerLanding(input());
    const last = await publicRepo.registerLanding(input("user@example.com"));
    const end = await publicRepo.registerLanding(input("end@example.com"));
    const outside = await new TopikRepository().registerResultPreregistration({ ...input(), sessionId, token });
    const times = [
      [before.registrationId, "2026-09-30T14:59:59Z"], [first.registrationId, "2026-09-30T15:00:00Z"],
      [last.registrationId, "2026-09-30T15:00:00Z"], [end.registrationId, "2026-10-01T15:00:00Z"],
      [outside.registrationId, "2026-10-02T00:00:00Z"],
    ];
    for (const [id, time] of times) await pool.query("UPDATE topik_app.preregistrations SET consented_at=$2 WHERE registration_id=$1", [id, time]);
    const conditions = { ...filters, source: "landing" as const, deduplicate: true, from: "2026-10-01", to: "2026-10-01", search: "USER@" };
    const result = await adminRepo.list(conditions, paging);
    expect(result.total).toBe(1);
    expect(result.registrations[0]).toMatchObject({ registrationId: last.registrationId });
    let csv = "";
    for await (const chunk of adminRepo.csvStream(conditions)) csv += chunk;
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(last.registrationId);
    expect(csv).not.toContain(first.registrationId);
    expect(csv).not.toContain(outside.registrationId);
    expect(csv).not.toContain("session-token");
  });

  it("treats email search literally and protects spreadsheet formulas", async () => {
    await publicRepo.registerLanding(input("=test_%@example.com"));
    await publicRepo.registerLanding(input("testaa@example.com"));
    const conditions = { ...filters, search: "_%" };
    expect((await adminRepo.list(conditions, paging)).total).toBe(1);
    let csv = "";
    for await (const chunk of adminRepo.csvStream(conditions)) csv += chunk;
    expect(csv).toContain("'=test_%@example.com");
  });

  it("deletes one application, reveals an older duplicate and retains sessions and minimal audits", async () => {
    const first = await publicRepo.registerLanding(input());
    const last = await publicRepo.registerLanding(input());
    const linked = await new TopikRepository().registerResultPreregistration({ ...input("topik@example.com"), sessionId, token });
    await adminRepo.delete(adminId, last.registrationId);
    await adminRepo.delete(adminId, last.registrationId);
    expect((await adminRepo.list({ ...filters, deduplicate: true, source: "landing" }, paging)).registrations[0]).toMatchObject({ registrationId: first.registrationId });
    const audit = (await pool.query("SELECT * FROM topik_app.preregistration_deletion_audits")).rows;
    expect(audit).toHaveLength(1);
    expect(Object.keys(audit[0])).toEqual(["audit_id", "deleted_by", "registration_id", "deleted_at"]);
    expect(audit[0]).toMatchObject({ deleted_by: adminId, registration_id: last.registrationId });
    const next = await publicRepo.registerLanding(input());
    expect(next.registrationId).toBe("001-00000003");
    await adminRepo.delete(adminId, linked.registrationId);
    expect((await pool.query("SELECT * FROM topik_app.sessions")).rowCount).toBe(1);
  });

  it("rolls back deletion when the audit cannot be written and preserves registrations after session deletion", async () => {
    const linked = await new TopikRepository().registerResultPreregistration({ ...input(), sessionId, token });
    await expect(adminRepo.delete("not-a-uuid", linked.registrationId)).rejects.toThrow();
    expect((await adminRepo.list(filters, paging)).total).toBe(1);
    await pool.query("DELETE FROM topik_app.sessions");
    expect((await pool.query("SELECT session_id FROM topik_app.preregistrations")).rows[0].session_id).toBeNull();
    expect((await adminRepo.list(filters, { page: 2, pageSize: 1 }))).toMatchObject({ total: 1, registrations: [] });
  });
});
