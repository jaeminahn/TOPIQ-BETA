import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("dotenv", () => ({ config: vi.fn() }));
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

describe("generation worker opt-in", () => {
  it.each([
    { tts: undefined, visual: undefined, enabled: [false, false] },
    { tts: "false", visual: "false", enabled: [false, false] },
    { tts: "true", visual: "true", enabled: [true, true] },
    { tts: "true", visual: undefined, enabled: [true, false] },
    { tts: undefined, visual: "true", enabled: [false, true] },
  ])("enables workers only when explicitly true: $tts / $visual", async ({ tts, visual, enabled }) => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("TTS_WORKER_ENABLED", tts);
    vi.stubEnv("VISUAL_WORKER_ENABLED", visual);
    vi.resetModules();
    const { config } = await import("../../src/core/config.js");
    expect([config.googleTts.workerEnabled, config.googleImage.workerEnabled]).toEqual(enabled);
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
