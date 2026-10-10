import { describe, expect, it } from "vitest";
import { isAcceptedAppliedMigration, migrationChecksum } from "../../src/migrate.js";

// Database schema and data preservation are covered by the disposable PostgreSQL integration tests.
describe("migration checksum compatibility", () => {
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
    expect(isAcceptedAppliedMigration(
      "014_repair_listening_revision_audio_bindings.sql",
      "c4e2098d21ac207243469dfc3875509bb387dce5246acb8ace4258c305fc5f45",
      "d9fb906838dcfadbd222e97c4bb7006bac4cebeae94df459b6afaa676379fed2",
    )).toBe(true);
    expect(isAcceptedAppliedMigration("005_admin_listening_visual_generation.sql", "old", "current"))
      .toBe(false);
  });
});
