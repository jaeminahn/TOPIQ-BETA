import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { buildNarrationScript } from "../../src/listening/narration.js";
import {
  EXAM_TRACK_COMPOSER_VERSION,
  EXAM_TRACK_SYNTHESIS_VERSION,
  examTrackSourceHash,
  splitLiteralUtterances,
  synthesizeExamTrackParts,
} from "../../src/listening/tts-service.js";
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
    const synthesizeLiteral = vi.fn(async () => Buffer.from(`audio-${++call}`));
    const parts = await synthesizeExamTrackParts(
      script,
      { speakingRate: .9, stylePrompt: "차분하게" },
      synthesizeLiteral,
    );

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


});
