import { describe, expect, it } from "vitest";
import {
  extractSupabaseProjectRef,
  parseArguments,
  parseConnectionString,
  validateSchemas,
} from "../../scripts/copy-postgres-to-supabase.mjs";

describe("PostgreSQL to Supabase copy script", () => {
  it("uses only the application schemas by default", () => {
    expect(parseArguments([]).schemas).toEqual(["topik_bank", "topik_app"]);
    expect(parseArguments(["--", "--dry-run"]).dryRun).toBe(true);
  });

  it("parses a session-pooler URL without exposing it through CLI arguments", () => {
    const connection = parseConnectionString(
      "postgresql://postgres.projectref:p%40ss@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require",
      "target",
    );
    expect(connection.password).toBe("p@ss");
    expect(connection.sslmode).toBe("require");
    expect(extractSupabaseProjectRef(connection)).toBe("projectref");
  });

  it("extracts the project ref from a direct Supabase URL", () => {
    const connection = parseConnectionString(
      "postgresql://postgres:secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      "target",
    );
    expect(extractSupabaseProjectRef(connection)).toBe("abcdefghijklmnopqrst");
  });

  it("rejects Supabase-managed schemas", () => {
    expect(() => validateSchemas(["topik_app", "auth"])).toThrow("Supabase 관리 스키마");
    expect(() => validateSchemas(["supabase_migrations"])).toThrow("Supabase 관리 스키마");
  });
});
