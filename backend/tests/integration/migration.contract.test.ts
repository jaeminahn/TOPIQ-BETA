import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isAcceptedAppliedMigration, migrationChecksum } from "../../src/migrate.js";

describe("topik_app migration contract", () => {
  it("calculates the same checksum for LF and CRLF checkouts", () => {
    expect(migrationChecksum("SELECT 1;\r\nSELECT 2;\r\n"))
      .toBe(migrationChecksum("SELECT 1;\nSELECT 2;\n"));
  });

  it("accepts only the known production checksums for legacy migrations", () => {
    expect(isAcceptedAppliedMigration(
      "002_admin_listening.sql",
      "f48dd01b46b3832f2521a7c5f2e8f90f02cb0462ce789f42ec7662e7f12a7098",
      "current-checksum",
    )).toBe(true);
    expect(isAcceptedAppliedMigration("005_admin_listening_visual_generation.sql", "old", "current"))
      .toBe(false);
  });

  it("defines the required analytics tables, fields, and fixed mock sets", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/001_topik_app.sql"), "utf8");

    for (const table of [
      "users",
      "sessions",
      "session_items",
      "answer_states",
      "response_events",
      "response_observations",
      "theta_estimation_runs",
      "attempt_feedback",
      "email_subscriptions",
    ]) {
      expect(sql).toContain(`topik_app.${table}`);
    }

    for (const field of [
      "user_id",
      "session_id",
      "item_id",
      "item_version",
      "item_order",
      "selected_option",
      "is_correct",
      "response_time_ms",
      "skipped",
      "timed_out",
      "answer_changed",
      "theta_before",
      "theta_after",
      "policy_version",
      "created_at",
    ]) {
      expect(sql).toContain(field);
    }

    expect(sql).toContain("64c027ea-fa18-5cd3-8039-79ecde41916a");
    expect(sql).toContain("fc0a5fa7-391e-586f-ab7c-1b7b8193358a");
    expect(sql).toContain("UNIQUE (session_id, set_id, set_version, test_position)");
    expect(sql).toContain("CHECK (NOT (skipped AND timed_out))");
  });

  it("defines admin, listening TTS, media, playback, and fixed listening sets", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/002_admin_listening.sql"), "utf8");
    for (const table of ["admin_users", "tts_generation_jobs", "tts_audio_assets", "item_audio_bindings", "item_visual_assets", "audio_playback_events"]) {
      expect(sql).toContain(`topik_app.${table}`);
    }
    expect(sql).toContain("3ffc10a1-db41-5718-b479-60224edec836");
    expect(sql).toContain("c5e3af83-93d5-5bef-a2e7-5186ee358f9c");
    expect(sql).toContain("topik-ii-listening-1");
    expect(sql).toContain("topik-ii-listening-2");
  });

  it("stores TTS style snapshots and adds response management indexes", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/003_admin_management.sql"), "utf8");
    expect(sql).toContain("tts_style JSONB");
    expect(sql).toContain("speakingRate");
    expect(sql).toContain("deleted_at");
    expect(sql).toContain("response_observations_created_idx");
  });

  it("defines grouped TTS targets and auditable session response deletion", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/004_admin_response_audio_groups.sql"), "utf8");
    expect(sql).toContain("topik_app.tts_generation_job_targets");
    expect(sql).toContain("topik_app.response_deletion_audits");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("INSERT INTO topik_app.tts_generation_job_targets");
  });

  it("defines asynchronous listening visual generation jobs", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/005_admin_listening_visual_generation.sql"), "utf8");
    expect(sql).toContain("topik_app.visual_generation_jobs");
    expect(sql).toContain("visual_generation_jobs_active_option_idx");
    expect(sql).toContain("prompt_snapshot JSONB");
  });

  it("adds English to feedback and subscription locales", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/006_english_locale.sql"), "utf8");
    expect(sql).toContain("attempt_feedback_locale_check");
    expect(sql).toContain("email_subscriptions_locale_check");
    expect(sql).toContain("'id', 'ko', 'en'");
  });

  it("defines set-position listening exam tracks and immutable narration snapshots", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/009_listening_exam_tracks.sql"), "utf8");
    expect(sql).toContain("narration_version");
    expect(sql).toContain("script_snapshot");
    expect(sql).toContain("topik_app.question_set_item_audio_bindings");
    expect(sql).toContain("set_id, set_version, position");
    expect(sql).toContain("tts_jobs_active_group_idx");
  });

  it("allows the bell-and-gap exam track narration version", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/010_listening_exam_track_v3.sql"), "utf8");
    expect(sql).toContain("tts_audio_assets_narration_version_check");
    expect(sql).toContain("'dialogue_v1', 'exam_track_v2', 'exam_track_v3'");
  });

  it("allows the literal Gemini exam track narration version", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/011_listening_exam_track_v4.sql"), "utf8");
    expect(sql).toContain("tts_audio_assets_narration_version_check");
    expect(sql).toContain("'dialogue_v1', 'exam_track_v2', 'exam_track_v3', 'exam_track_v4'");
  });

  it("adds reading material visuals and auditable abandoned-session deletion", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/012_reading_material_visuals_and_abandoned_deletion.sql"), "utf8");
    expect(sql).toContain("visual_role");
    expect(sql).toContain("'choice', 'material'");
    expect(sql).toContain("visual_material");
    expect(sql).toContain("all_abandoned_sessions");
  });

  it("stores expiring result email deliveries with revocable hashed tokens", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/013_result_email_delivery.sql"), "utf8");
    expect(sql).toContain("topik_app.result_email_deliveries");
    expect(sql).toContain("result_token_hash CHAR(64) NOT NULL UNIQUE");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain("revoked_at");
    expect(sql).toContain("status IN ('pending', 'accepted', 'failed')");
  });

  it("repairs only unchanged listening narration groups on revised set versions", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/014_repair_listening_revision_audio_bindings.sql"), "utf8");
    expect(sql).toContain("narration_signature");
    expect(sql).toContain("previous.narration_signature=target.narration_signature");
    expect(sql).toContain("previous.ready_asset_count=1");
    expect(sql).toContain("target.current_binding_count=0");
    expect(sql).toContain("asset.narration_version='exam_track_v4'");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
  });
});
