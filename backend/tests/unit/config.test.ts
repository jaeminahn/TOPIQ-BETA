import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBackendRoot } from "../../src/core/config.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("backend configuration paths", () => {
  it("loads environment files from the backend root after source modules are grouped", () => {
    expect(resolveBackendRoot()).toBe(resolve(process.cwd()));
  });
});

describe("CORS origin configuration", () => {
  it("combines existing and additional frontend origins", async () => {
    vi.stubEnv("APP_ORIGINS", "http://localhost:5173,https://topiq.unigate.kr");
    vi.stubEnv("APP_ORIGINS_EXTRA", " https://new-frontend.example.com,https://topiq.unigate.kr,, ");
    vi.resetModules();

    const { config } = await import("../../src/core/config.js");

    expect(config.appOrigins).toEqual([
      "http://localhost:5173",
      "https://topiq.unigate.kr",
      "https://new-frontend.example.com",
    ]);
  });

  it.each([undefined, "", " , "])("preserves existing origins when extra origins are %s", async (extraOrigins) => {
    vi.stubEnv("APP_ORIGINS", "https://topiq.unigate.kr");
    vi.stubEnv("APP_ORIGINS_EXTRA", extraOrigins);
    vi.resetModules();

    const { config } = await import("../../src/core/config.js");

    expect(config.appOrigins).toEqual(["https://topiq.unigate.kr"]);
  });
});
