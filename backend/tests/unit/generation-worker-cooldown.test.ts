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
type Worker = TtsWorker | VisualWorker;
type PendingJob = { job_id: string };
type WorkerInternals = {
  claim(): Promise<PendingJob | null>;
  process(job: PendingJob): Promise<void>;
};

function schedule(worker: Worker, jobs: PendingJob[] = [{ job_id: "first" }, { job_id: "second" }]) {
  const internals = worker as unknown as WorkerInternals;
  const claim = vi.spyOn(internals, "claim").mockImplementation(async () => jobs.shift() ?? null);
  const process = vi.spyOn(internals, "process").mockResolvedValue(undefined);
  return { worker, jobs, claim, process };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
  poolMock.query.mockReset();
  poolMock.connect.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([
  { name: "audio", create: () => new TtsWorker() },
  { name: "image", create: () => new VisualWorker() },
])("$name worker cooldown", ({ create }) => {
  it("starts immediately, handles only one job, and leaves the next queued for 300 seconds", async () => {
    const { worker, jobs, claim, process } = schedule(create());

    await worker.runOnce();
    expect(process).toHaveBeenCalledWith({ job_id: "first" });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(jobs).toEqual([{ job_id: "second" }]);

    await vi.advanceTimersByTimeAsync(299_999);
    await worker.runOnce();
    expect(claim).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenLastCalledWith({ job_id: "second" });
  });

  it("counts the cooldown from completion and prevents overlap during a long attempt", async () => {
    const { worker, claim, process } = schedule(create());
    let finish!: () => void;
    process.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));

    const inFlight = worker.runOnce();
    await Promise.resolve();
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(360_000);
    worker.kick();
    worker.kick();
    await worker.runOnce();
    expect(claim).toHaveBeenCalledTimes(1);

    finish();
    await inFlight;
    await vi.advanceTimersByTimeAsync(299_999);
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("resumes through the existing polling timer without kicks bypassing the cooldown", async () => {
    const { worker, process } = schedule(create());
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(process).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(299_999);
    worker.kick();
    worker.kick();
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(process).toHaveBeenCalledTimes(2);
    worker.stop();
  });

  it("does not start a new cooldown when polling an empty queue", async () => {
    const { worker, jobs, process } = schedule(create(), []);
    await worker.runOnce();
    jobs.push({ job_id: "first" });
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300_000);
    await worker.runOnce();
    jobs.push({ job_id: "second" });
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("keeps the remaining cooldown for a job submitted after the queue empties", async () => {
    const { worker, jobs, claim, process } = schedule(create(), [{ job_id: "first" }]);
    await worker.runOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    jobs.push({ job_id: "new-request" });
    worker.kick();
    worker.kick();
    await worker.runOnce();
    expect(claim).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(239_999);
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await worker.runOnce();
    expect(process).toHaveBeenLastCalledWith({ job_id: "new-request" });
  });

  it("waits after an attempt throws even if failure persistence also fails", async () => {
    const { worker, process } = schedule(create());
    process.mockRejectedValueOnce(new Error("failure persistence unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await worker.runOnce();

    await vi.advanceTimersByTimeAsync(299_999);
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("does not add a cooldown when claiming fails before an attempt starts", async () => {
    const { worker, claim, process } = schedule(create());
    claim.mockRejectedValueOnce(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await worker.runOnce();
    await worker.runOnce();
    expect(process).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh worker immediately after a process restart", async () => {
    const existing = schedule(create());
    await existing.worker.runOnce();
    await existing.worker.runOnce();
    expect(existing.process).toHaveBeenCalledTimes(1);

    const restarted = schedule(create());
    await restarted.worker.runOnce();
    expect(restarted.process).toHaveBeenCalledTimes(1);
  });
});

it("keeps audio and image cooldowns independent", async () => {
  const audio = schedule(new TtsWorker());
  const image = schedule(new VisualWorker());
  await audio.worker.runOnce();
  await vi.advanceTimersByTimeAsync(30_000);
  await image.worker.runOnce();
  expect(image.process).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(270_000);
  await audio.worker.runOnce();
  await image.worker.runOnce();
  expect(audio.process).toHaveBeenCalledTimes(2);
  expect(image.process).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(30_000);
  await image.worker.runOnce();
  expect(image.process).toHaveBeenCalledTimes(2);
});

it("counts the TTS failure cooldown from failure persistence and leaves the attempt terminal", async () => {
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
  expect(synthesize).toHaveBeenCalledTimes(1);
  expect(String(poolMock.query.mock.calls[2]?.[0])).toContain("SET status='failed'");
  expect(poolMock.query.mock.calls[2]?.[1]).toEqual(["audio-1", "quota exceeded"]);
  worker.kick();
  await worker.runOnce();
  expect(poolMock.query).toHaveBeenCalledTimes(3);
  persistFailure();
  await inFlight;
  await vi.advanceTimersByTimeAsync(299_999);
  worker.kick();
  await worker.runOnce();
  expect(poolMock.query).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  await worker.runOnce();
  expect(poolMock.query).toHaveBeenCalledTimes(4);
  expect(synthesize).toHaveBeenCalledTimes(1);
});

it("spaces image retries by 300 seconds while preserving the three-attempt limit", async () => {
  const generate = vi.fn().mockRejectedValue(new Error("quota exceeded"));
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
    await worker.runOnce();
    expect(generate).toHaveBeenCalledTimes(attempt);
    expect(poolMock.query).toHaveBeenCalledTimes(attempt * 3);
    await vi.advanceTimersByTimeAsync(299_999);
    worker.kick();
    await worker.runOnce();
    expect(poolMock.query).toHaveBeenCalledTimes(attempt * 3);
    await vi.advanceTimersByTimeAsync(1);
  }
  await worker.runOnce();
  expect(generate).toHaveBeenCalledTimes(3);
  const failureUpdates = poolMock.query.mock.calls.filter(([sql]) => String(sql).includes("SET status=CASE"));
  expect(failureUpdates).toHaveLength(3);
  expect(failureUpdates.every(([sql]) => String(sql).includes("WHEN attempts>=3 THEN 'failed' ELSE 'queued'"))).toBe(true);
  expect(String(poolMock.query.mock.calls[0]?.[0])).toContain("attempts<3");
});
