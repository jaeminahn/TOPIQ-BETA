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
  it("forwards the selected listening set and filter to the repository", async () => {
    const listListeningItems = vi.fn().mockResolvedValue([]);
    const app = await buildApp({} as TopikRepository, { listListeningItems } as unknown as AdminRepository);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/listening/items?setId=10000000-0000-4000-8000-000000000001&status=missing",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(listListeningItems).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001", "missing");
  });

  it("forwards the selected reading set and search to the repository", async () => {
    const listReadingItems = vi.fn().mockResolvedValue([]);
    const app = await buildApp({} as TopikRepository, { listReadingItems } as unknown as AdminRepository);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/reading/items?setId=10000000-0000-4000-8000-000000000001&search=%EB%AC%B8%EB%B2%95",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(listReadingItems).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001", "문법");
  });

  it("ignores a legacy set version query because current pointers are authoritative", async () => {
    const listListeningItems = vi.fn().mockResolvedValue([]);
    const app = await buildApp({} as TopikRepository, { listListeningItems } as unknown as AdminRepository);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/listening/items?setVersion=2",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(listListeningItems).toHaveBeenCalledWith(undefined, undefined);
  });

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

  it("publishes the current reading set through the versionless route", async () => {
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
      url: "/v1/admin/reading/sets/10000000-0000-4000-8000-000000000003/publish",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ slug: "topik-ii-reading-3", published: true, created: true });
    expect(publishReadingSet).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000003");
  });

  it("keeps the old reading set version route as a compatibility alias", async () => {
    const publishReadingSet = vi.fn().mockResolvedValue({ published: true });
    const app = await buildApp({} as TopikRepository, { publishReadingSet } as unknown as AdminRepository);
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/reading/sets/10000000-0000-4000-8000-000000000003/versions/99/publish",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(publishReadingSet).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000003");
  });

  it("returns newest-first item version history from the current set", async () => {
    const listQuestionVersions = vi.fn().mockResolvedValue({
      setId: "10000000-0000-4000-8000-000000000001",
      itemId: "30000000-0000-4000-8000-000000000001",
      position: 1,
      currentVersion: 2,
      versions: [{ itemVersion: 2, isCurrent: true }, { itemVersion: 1, isCurrent: false }],
    });
    const app = await buildApp({} as TopikRepository, { listQuestionVersions } as unknown as AdminRepository);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/question-sets/10000000-0000-4000-8000-000000000001/items/30000000-0000-4000-8000-000000000001/versions",
      headers: { authorization: "Bearer admin-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().versions.map((version: { itemVersion: number }) => version.itemVersion)).toEqual([2, 1]);
    expect(listQuestionVersions).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000001",
    );
  });
});
