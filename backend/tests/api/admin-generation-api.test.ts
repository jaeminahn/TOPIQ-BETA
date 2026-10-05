import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("../../src/admin/auth.js", () => ({
  adminLogin: vi.fn(),
  requireAdmin: vi.fn().mockResolvedValue({ adminUserId: "admin-id" }),
}));

import { buildApp } from "../../src/app.js";
import type { AdminRepository } from "../../src/admin/repository.js";
import type { TopikRepository } from "../../src/exam/repository.js";
import { config } from "../../src/core/config.js";
import { ttsWorker } from "../../src/listening/tts-worker.js";
import { visualWorker } from "../../src/admin/workers/visual-worker.js";

const setId = "10000000-0000-4000-8000-000000000001";
const itemId = "30000000-0000-4000-8000-000000000001";
const enqueue = {
  enqueueSet: vi.fn(), enqueueGroup: vi.fn(), enqueueVisualOption: vi.fn(),
  enqueueVisualSet: vi.fn(), enqueueReadingMaterial: vi.fn(), enqueueReadingVisualSet: vi.fn(),
};
const routes = [
  { kind: "tts", method: "enqueueSet", path: `/listening/sets/${setId}/tts` },
  { kind: "tts", method: "enqueueSet", path: `/listening/sets/${setId}/versions/1/tts` },
  { kind: "tts", method: "enqueueGroup", path: `/listening/sets/${setId}/audio-groups/${itemId}/tts` },
  { kind: "tts", method: "enqueueGroup", path: `/listening/sets/${setId}/versions/1/audio-groups/${itemId}/tts` },
  { kind: "visual", method: "enqueueVisualOption", path: `/listening/items/${itemId}/versions/1/visual-options/1/generate` },
  { kind: "visual", method: "enqueueVisualSet", path: `/listening/sets/${setId}/visuals/generate` },
  { kind: "visual", method: "enqueueVisualSet", path: `/listening/sets/${setId}/versions/1/visuals/generate` },
  { kind: "visual", method: "enqueueReadingMaterial", path: `/reading/items/${itemId}/versions/1/visual-material/generate` },
  { kind: "visual", method: "enqueueReadingVisualSet", path: `/reading/sets/${setId}/visuals/generate` },
  { kind: "visual", method: "enqueueReadingVisualSet", path: `/reading/sets/${setId}/versions/1/visuals/generate` },
] as const;
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
const initialEnabled = [config.googleTts.workerEnabled, config.googleImage.workerEnabled];

beforeEach(() => {
  Object.assign(config.googleTts, { workerEnabled: false });
  Object.assign(config.googleImage, { workerEnabled: false });
  for (const method of Object.values(enqueue)) method.mockReset().mockResolvedValue({ queued: 1, jobIds: ["job"] });
  vi.spyOn(ttsWorker, "kick").mockImplementation(() => {});
  vi.spyOn(visualWorker, "kick").mockImplementation(() => {});
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  Object.assign(config.googleTts, { workerEnabled: initialEnabled[0] });
  Object.assign(config.googleImage, { workerEnabled: initialEnabled[1] });
  vi.restoreAllMocks();
});

describe.each(routes)("admin generation $path", ({ kind, method, path }) => {
  it("rejects disabled generation with the environment setting and leaves the queue empty", async () => {
    const app = await buildApp({} as TopikRepository, enqueue as unknown as AdminRepository);
    apps.push(app);
    const response = await app.inject({ method: "POST", url: `/v1/admin${path}`, headers: { authorization: "Bearer admin-token" }, payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe(kind === "tts" ? "TTS_WORKER_DISABLED" : "VISUAL_WORKER_DISABLED");
    const message = response.json().error.message as string;
    expect(message).toContain(`${kind === "tts" ? "TTS_WORKER_ENABLED" : "VISUAL_WORKER_ENABLED"}=true`);
    expect(message).toContain("환경변수");
    expect(message).toContain("차단되었습니다");
    for (const enqueueMethod of Object.values(enqueue)) expect(enqueueMethod).not.toHaveBeenCalled();
    expect(ttsWorker.kick).not.toHaveBeenCalled();
    expect(visualWorker.kick).not.toHaveBeenCalled();
  });

  it("accepts generation when only its own worker is enabled", async () => {
    Object.assign(kind === "tts" ? config.googleTts : config.googleImage, { workerEnabled: true });
    const app = await buildApp({} as TopikRepository, enqueue as unknown as AdminRepository);
    apps.push(app);
    const response = await app.inject({ method: "POST", url: `/v1/admin${path}`, headers: { authorization: "Bearer admin-token" }, payload: {} });
    expect(response.statusCode).toBe(202);
    expect(enqueue[method]).toHaveBeenCalledOnce();
    expect(kind === "tts" ? ttsWorker.kick : visualWorker.kick).toHaveBeenCalledOnce();
    expect(kind === "tts" ? visualWorker.kick : ttsWorker.kick).not.toHaveBeenCalled();
  });
});
