import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/admin/auth.js", () => ({
  adminLogin: vi.fn(),
  requireAdmin: vi.fn(async (token: string) => {
    if (token !== "admin-token") throw new Error("unauthorized");
    return { adminUserId: "admin-1", authUserId: "auth-1", email: "admin@example.com" };
  }),
}));

import type { AdminExportSource } from "../../src/admin/export.js";
import type { AdminRepository } from "../../src/admin/repository.js";
import { buildApp } from "../../src/app.js";
import type { TopikRepository } from "../../src/exam/repository.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function exportSource(overrides: Partial<AdminExportSource> = {}): AdminExportSource {
  return {
    options: vi.fn().mockResolvedValue({ mockTests: [], itemTypes: [] }),
    preview: vi.fn().mockResolvedValue({ rowCount: 1, sessionCount: 1 }),
    csvStream: vi.fn().mockReturnValue(Readable.from(["\uFEFF\"session_id\"\r\n\"session-1\"\r\n"])),
    ...overrides,
  };
}

async function appWith(source: AdminExportSource) {
  const app = await buildApp(
    {} as TopikRepository,
    {} as AdminRepository,
    undefined,
    source,
  );
  apps.push(app);
  return app;
}

describe("admin export API", () => {
  it("returns export options with no-store caching", async () => {
    const source = exportSource({
      options: vi.fn().mockResolvedValue({
        mockTests: [{ mockTestId: "test-1", titleKo: "읽기 1회" }],
        itemTypes: ["grammar_blank"],
      }),
    });
    const app = await appWith(source);

    const response = await app.inject({
      method: "GET", url: "/v1/admin/exports/options",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().itemTypes).toEqual(["grammar_blank"]);
  });

  it("returns a normalized preview and rejects invalid ranges", async () => {
    const source = exportSource();
    const app = await appWith(source);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/exports/responses/preview?status=all&outcome=unanswered&from=2026-09-01&to=2026-09-09",
      headers: { authorization: "Bearer admin-token" },
    });
    const invalid = await app.inject({
      method: "GET",
      url: "/v1/admin/exports/responses/preview?from=2026-09-10&to=2026-09-09",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      rowCount: 1,
      sessionCount: 1,
      filters: { status: "all", outcome: "unanswered", minAssignedCount: 0 },
    });
    expect(source.preview).toHaveBeenCalledWith("responses", expect.objectContaining({ outcome: "unanswered" }));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("INVALID_EXPORT_FILTER");
  });

  it("downloads a protected no-store CSV with filename and row count", async () => {
    const source = exportSource();
    const app = await appWith(source);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/exports/sessions.csv?status=submitted",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="unigate_sessions_/);
    expect(response.headers["x-export-row-count"]).toBe("1");
    expect(response.body.startsWith("\uFEFF\"session_id\"")).toBe(true);
    expect(source.csvStream).toHaveBeenCalledWith("sessions", expect.objectContaining({ status: "submitted" }));
  });
});
