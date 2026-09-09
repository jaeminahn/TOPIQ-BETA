import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/admin-auth.js", () => ({
  adminLogin: vi.fn(),
  requireAdmin: vi.fn().mockResolvedValue({ adminUserId: "admin-id", authUserId: "auth-id", email: "admin@example.com" }),
}));

import type { AdminRepository } from "../../src/admin-repository.js";
import { buildApp } from "../../src/app.js";
import type { TopikRepository } from "../../src/repository.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("admin reading API", () => {
  it("returns reading set summaries", async () => {
    const listReadingSets = vi.fn().mockResolvedValue([{ setId: "10000000-0000-4000-8000-000000000001", round: 1 }]);
    const app = await buildApp({} as TopikRepository, { listReadingSets } as unknown as AdminRepository);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/reading/sets",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sets).toHaveLength(1);
    expect(listReadingSets).toHaveBeenCalledOnce();
  });

  it("publishes a selected reading set version", async () => {
    const publishReadingSet = vi.fn().mockResolvedValue({
      mockTestId: "20000000-0000-4000-8000-000000000003",
      slug: "topik-ii-reading-3",
      round: 3,
      published: true,
      created: true,
    });
    const app = await buildApp({} as TopikRepository, { publishReadingSet } as unknown as AdminRepository);
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/reading/sets/10000000-0000-4000-8000-000000000003/versions/1/publish",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ slug: "topik-ii-reading-3", published: true, created: true });
    expect(publishReadingSet).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000003", 1);
  });
});
