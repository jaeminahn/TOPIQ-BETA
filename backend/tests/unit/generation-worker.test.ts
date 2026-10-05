import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../../src/core/config.js", () => ({
  config: {
    googleTts: { workerEnabled: true, model: "test", femaleVoice: "female", maleVoice: "male" },
    googleImage: { workerEnabled: true },
  },
}));

import { pool } from "../../src/core/db.js";
import { TtsWorker } from "../../src/listening/tts-worker.js";
import { VisualWorker } from "../../src/admin/workers/visual-worker.js";
import type { GoogleTtsClient } from "../../src/listening/google-tts.js";
import type { GoogleImageClient } from "../../src/media/google-image.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> };
type PendingJob = { job_id: string };
type WorkerInternals = {
  claim(): Promise<PendingJob | null>;
  process(job: PendingJob): Promise<void>;
};
let withGoogleGenerationRequest: typeof import("../../src/media/google-generation-request-limit.js").withGoogleGenerationRequest;

function schedule(worker: TtsWorker | VisualWorker, jobs: PendingJob[] = [{ job_id: "first" }, { job_id: "second" }]) {
  const internals = worker as unknown as WorkerInternals;
  const claim = vi.spyOn(internals, "claim").mockImplementation(async () => jobs.shift() ?? null);
  const process = vi.spyOn(internals, "process").mockResolvedValue(undefined);
  return { worker, jobs, claim, process };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
  poolMock.query.mockReset();
  poolMock.connect.mockReset();
  ({ withGoogleGenerationRequest } = await import("../../src/media/google-generation-request-limit.js"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([
  { name: "audio", create: () => new TtsWorker() },
  { name: "image", create: () => new VisualWorker() },
])("$name generation worker", ({ name, create }) => {
  it("handles one job at a time without adding a delay before the next job", async () => {
    const { worker, jobs, claim, process } = schedule(create());
    await worker.runOnce();
    expect(process).toHaveBeenCalledWith({ job_id: "first" });
    expect(jobs).toEqual([{ job_id: "second" }]);
    await worker.runOnce();
    expect(claim).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenLastCalledWith({ job_id: "second" });
  });

  it("prevents overlap during a long attempt and releases the guard after completion", async () => {
    const { worker, claim, process } = schedule(create());
    let finish!: () => void;
    process.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const inFlight = worker.runOnce();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(360_000);
    worker.kick();
    worker.kick();
    await worker.runOnce();
    expect(claim).toHaveBeenCalledTimes(1);
    finish();
    await inFlight;
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("checks the next job through the existing three-second polling timer", async () => {
    const { worker, claim, process } = schedule(create());
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(process).toHaveBeenCalledTimes(2);
    worker.stop();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("accepts new jobs after the queue empties without a job cooldown", async () => {
    const { worker, jobs, process } = schedule(create(), []);
    await worker.runOnce();
    jobs.push({ job_id: "first" });
    await worker.runOnce();
    await worker.runOnce();
    jobs.push({ job_id: "second" });
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("releases the running guard when an attempt throws", async () => {
    const { worker, process } = schedule(create());
    process.mockRejectedValueOnce(new Error("failure persistence unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await worker.runOnce();
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("allows another poll after a claim failure", async () => {
    const { worker, claim, process } = schedule(create());
    claim.mockRejectedValueOnce(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await worker.runOnce();
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(1);
  });

  it("keeps only the API cooldown when a completed job includes post-processing", async () => {
    const { worker, process } = schedule(create());
    const requestTimes: number[] = [];
    const request = vi.fn(async () => { requestTimes.push(Date.now()); });
    process.mockImplementation(async () => {
      await withGoogleGenerationRequest("project", name, request);
      await new Promise<void>((resolve) => setTimeout(resolve, 60_000));
    });
    const first = worker.runOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    await first;
    const second = worker.runOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(process).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(requestTimes[1]! - requestTimes[0]!).toBe(180_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await second;
  });
});

it("persists a terminal TTS failure before polling the next job without a job delay", async () => {
  const synthesize = vi.fn().mockRejectedValue(new Error("quota exceeded"));
  const worker = new TtsWorker({ synthesize } as unknown as GoogleTtsClient);
  let persistFailure!: () => void;
  const failurePersistence = new Promise<{ rows: []; rowCount: number }>((resolve) => {
    persistFailure = () => resolve({ rows: [], rowCount: 1 });
  });
  poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{
      job_id: "audio-1", item_id: "item-1", item_version: 1, requested_by: "admin-1",
      force_regenerate: true, attempts: 1, tts_style: { speakingRate: 1, stylePrompt: "" },
      set_id: null, script_snapshot: null,
    }] })
    .mockResolvedValueOnce({ rows: [{ content_json: { dialogue_turns: [{ speaker: "남자", text: "안녕하세요." }] } }] })
    .mockImplementationOnce(() => failurePersistence);
  const inFlight = worker.runOnce();
  await vi.advanceTimersByTimeAsync(360_000);
  expect(String(poolMock.query.mock.calls[2]?.[0])).toContain("SET status='failed'");
  expect(poolMock.query.mock.calls[2]?.[1]).toEqual(["audio-1", "quota exceeded"]);
  worker.kick();
  await worker.runOnce();
  expect(poolMock.query).toHaveBeenCalledTimes(3);
  persistFailure();
  await inFlight;
  await worker.runOnce();
  expect(poolMock.query).toHaveBeenCalledTimes(4);
  expect(synthesize).toHaveBeenCalledTimes(1);
});

it("keeps image retries paced by the API limiter and preserves the three-attempt limit", async () => {
  const providerGenerate = vi.fn().mockRejectedValue(new Error("quota exceeded"));
  const generate = vi.fn(() => withGoogleGenerationRequest("project", "image", providerGenerate));
  const worker = new VisualWorker({ generate } as unknown as GoogleImageClient);
  poolMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
  for (let attempts = 1; attempts <= 3; attempts += 1) {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{
        job_id: "image-1", item_id: "item-1", item_version: 1, requested_by: "admin-1",
        option_number: 1, visual_role: "choice", attempts, prompt_snapshot: { description: "시험 보기 그림" },
      }] })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const inFlight = worker.runOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(generate).toHaveBeenCalledTimes(attempt);
    if (attempt > 1) {
      await vi.advanceTimersByTimeAsync(179_999);
      worker.kick();
      await worker.runOnce();
      expect(providerGenerate).toHaveBeenCalledTimes(attempt - 1);
      expect(poolMock.query).toHaveBeenCalledTimes((attempt - 1) * 3 + 2);
      await vi.advanceTimersByTimeAsync(1);
    }
    await inFlight;
    expect(providerGenerate).toHaveBeenCalledTimes(attempt);
    expect(poolMock.query).toHaveBeenCalledTimes(attempt * 3);
  }
  await worker.runOnce();
  expect(generate).toHaveBeenCalledTimes(3);
  const failureUpdates = poolMock.query.mock.calls.filter(([sql]) => String(sql).includes("SET status=CASE"));
  expect(failureUpdates).toHaveLength(3);
  expect(failureUpdates.every(([sql]) => String(sql).includes("WHEN attempts>=3 THEN 'failed' ELSE 'queued'"))).toBe(true);
  expect(String(poolMock.query.mock.calls[0]?.[0])).toContain("attempts<3");
});
