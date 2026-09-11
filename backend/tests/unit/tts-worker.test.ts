import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { buildNarrationScript } from "../../src/listening/narration.js";
import {
  EXAM_TRACK_COMPOSER_VERSION,
  EXAM_TRACK_SYNTHESIS_VERSION,
  TtsWorker,
  examTrackSourceHash,
  splitLiteralUtterances,
  synthesizeExamTrackParts,
} from "../../src/listening/tts-worker.js";
import { pool } from "../../src/core/db.js";

const poolMock = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe("exam-track synthesis", () => {
  beforeEach(() => poolMock.query.mockReset());

  it("synthesizes the common dialogue once and reuses it for the second reading", async () => {
    const script = buildNarrationScript([13, 14].map((position) => ({
      position,
      questionPrompt: "질문",
      dialogueTurns: [{ speaker: "남자" as const, text: "안녕하세요." }],
    })));
    let call = 0;
    const synthesize = vi.fn(async () => Buffer.from("legacy"));
    const synthesizeLiteral = vi.fn(async () => Buffer.from(`audio-${++call}`));
    const parts = await synthesizeExamTrackParts(
      script,
      { speakingRate: .9, stylePrompt: "차분하게" },
      synthesize,
      synthesizeLiteral,
    );

    expect(synthesize).not.toHaveBeenCalled();
    expect(synthesizeLiteral).toHaveBeenCalledTimes(5);
    expect(synthesizeLiteral).toHaveBeenCalledWith(
      { speaker: "남자", text: "안녕하세요." },
      { speakingRate: .9, stylePrompt: "차분하게" },
      { audioEncoding: "LINEAR16", sampleRateHertz: 24_000 },
    );
    expect(parts[4]).toMatchObject({ kind: "audio" });
    expect(parts[8]).toMatchObject({ kind: "audio" });
    expect((parts[4] as { data: Buffer }).data).toBe((parts[8] as { data: Buffer }).data);
    expect(parts).toContainEqual({ kind: "bell" });
    expect(parts).toContainEqual({ kind: "silence", durationMs: 1_000 });
  });

  it("splits literal narration into atomic sentences without changing their text", () => {
    expect(splitLiteralUtterances("1번. 다음을 듣고 고르십시오! 알겠습니까?"))
      .toEqual(["1번.", "다음을 듣고 고르십시오!", "알겠습니까?"]);
  });

  it("changes the cache key when position, speed, or style changes", () => {
    const first = buildNarrationScript([{ position: 13, questionPrompt: "질문", dialogueTurns: [{ speaker: "남자", text: "안녕하세요." }] }]);
    const reusedElsewhere = buildNarrationScript([{ position: 21, questionPrompt: "질문", dialogueTurns: [{ speaker: "남자", text: "안녕하세요." }] }]);
    const baseline = examTrackSourceHash(first, { speakingRate: 1, stylePrompt: "" });

    expect(examTrackSourceHash(reusedElsewhere, { speakingRate: 1, stylePrompt: "" })).not.toBe(baseline);
    expect(examTrackSourceHash(first, { speakingRate: .95, stylePrompt: "" })).not.toBe(baseline);
    expect(examTrackSourceHash(first, { speakingRate: 1, stylePrompt: "차분하게" })).not.toBe(baseline);
  });

  it("uses the no-duration-retry synthesis cache version", () => {
    expect(EXAM_TRACK_SYNTHESIS_VERSION).toBe("GEMINI_LITERAL_ATOMIC_V3_NO_DURATION_RETRY");
  });

  it("uses the bright-bell composer cache version", () => {
    expect(EXAM_TRACK_COMPOSER_VERSION).toBe("LINEAR16_FFMPEG_V4_BRIGHT_BELL");
  });

  it("claims only never-attempted jobs and terminally fails abandoned work", async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    await (new TtsWorker() as unknown as { claim(): Promise<unknown> }).claim();

    const sql = String(poolMock.query.mock.calls[0]?.[0]);
    expect(sql).toContain("status='queued' AND attempts=0");
    expect(sql).toContain("status='failed'");
    expect(sql).not.toContain("attempts<3");
  });

  it("stores the provider error after the first failure without requeuing", async () => {
    poolMock.query
      .mockRejectedValueOnce(new Error("quota exceeded"))
      .mockResolvedValueOnce({ rows: [] });
    const worker = new TtsWorker() as unknown as { process(job: Record<string, unknown>): Promise<void> };

    await worker.process({
      job_id: "job-1", item_id: "item-1", item_version: 1, requested_by: "admin-1",
      force_regenerate: false, attempts: 1, tts_style: { speakingRate: 1, stylePrompt: "" },
      set_id: null, group_start_position: null, script_snapshot: null,
    });

    const failureSql = String(poolMock.query.mock.calls[1]?.[0]);
    expect(failureSql).toContain("SET status='failed',error_message=$2");
    expect(failureSql).not.toContain("'queued'");
    expect(poolMock.query.mock.calls[1]?.[1]).toEqual(["job-1", "quota exceeded"]);
  });
});
