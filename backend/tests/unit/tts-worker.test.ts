import { describe, expect, it, vi } from "vitest";
import { buildNarrationScript } from "../../src/listening-narration.js";
import {
  EXAM_TRACK_COMPOSER_VERSION,
  EXAM_TRACK_SYNTHESIS_VERSION,
  examTrackSourceHash,
  splitLiteralUtterances,
  synthesizeExamTrackParts,
} from "../../src/tts-worker.js";

describe("exam-track synthesis", () => {
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
    expect(synthesizeLiteral).toHaveBeenCalledTimes(6);
    expect(synthesizeLiteral).toHaveBeenCalledWith(
      { speaker: "남자", text: "안녕하세요." },
      { speakingRate: .9, stylePrompt: "차분하게" },
      { audioEncoding: "LINEAR16", sampleRateHertz: 24_000 },
    );
    expect(parts[5]).toMatchObject({ kind: "audio" });
    expect(parts[9]).toMatchObject({ kind: "audio" });
    expect((parts[5] as { data: Buffer }).data).toBe((parts[9] as { data: Buffer }).data);
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
