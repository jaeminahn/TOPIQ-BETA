import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { buildApp } from "../../src/app.js";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  vi.stubEnv("APP_ORIGINS", "https://topiq.unigate.kr");
  vi.stubEnv("APP_ORIGINS_EXTRA", "https://new-frontend.example.com");
  vi.resetModules();
  const { buildApp } = await import("../../src/app.js");
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("CORS", () => {
  it.each(["https://topiq.unigate.kr", "https://new-frontend.example.com"])(
    "allows requests and preflight from %s",
    async (origin) => {
      const response = await app.inject({ method: "GET", url: "/health", headers: { origin } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);

      const preflight = await app.inject({
        method: "OPTIONS",
        url: "/v1/exams",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization",
        },
      });
      expect(preflight.statusCode).toBe(204);
      expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
      expect(preflight.headers["access-control-allow-headers"]).toBe("authorization");
    },
  );

  it.each(["GET", "OPTIONS"] as const)("rejects %s requests from unlisted origins", async (method) => {
    const response = await app.inject({
      method,
      url: "/health",
      headers: {
        origin: "https://unlisted.example.com",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("continues to allow requests without an Origin header", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
