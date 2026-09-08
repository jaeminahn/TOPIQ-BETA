import { describe, expect, it } from "vitest";
import {
  buildGoogleTtsRequest,
  buildLiteralGoogleTtsRequest,
  literalDeliveryStyle,
  maximumLiteralDurationMs,
} from "./google-tts.js";

describe("Google TTS request", () => {
  it("requests a fixed-rate LINEAR16 segment for exam-track composition", () => {
    const request = buildGoogleTtsRequest(
      [{ speaker: "여자", text: "13번." }],
      { speakingRate: 1.05, stylePrompt: "시험 안내처럼" },
      { audioEncoding: "LINEAR16", sampleRateHertz: 24_000 },
    );
    expect(request.audioConfig).toMatchObject({
      audioEncoding: "LINEAR16",
      speakingRate: 1.05,
      sampleRateHertz: 24_000,
    });
    expect(request.input).toMatchObject({ text: "13번." });
    expect("prompt" in request.input ? request.input.prompt : "").toContain("exactly once");
  });

  it("uses a content-neutral literal prompt and strips semantic exam directions", () => {
    const request = buildLiteralGoogleTtsRequest(
      { speaker: "여자", text: "1번. 다음을 듣고 고르십시오." },
      { speakingRate: .95, stylePrompt: "차분한 시험 안내 방송처럼 또렷하게 두 번 읽어 주세요" },
      { audioEncoding: "LINEAR16", sampleRateHertz: 24_000 },
    );

    expect(request.input.text).toBe("1번. 다음을 듣고 고르십시오.");
    expect(request.input.prompt).toContain("exactly once");
    expect(request.input.prompt).toContain("calm, clear and articulate");
    expect(request.input.prompt).not.toContain("TOPIK");
    expect(request.input.prompt).not.toContain("시험");
    expect(request.input.prompt).not.toContain("두 번");
    expect(request.voice.name).toBe("Aoede");
  });

  it("normalizes style prose and sets a conservative literal-duration ceiling", () => {
    expect(literalDeliveryStyle("따뜻하고 자연스럽지만 시험처럼 두 번 읽어 주세요"))
      .toBe("natural, warm");
    expect(literalDeliveryStyle("두 번 반복해 주세요")).toBe("neutral and clear");
    expect(maximumLiteralDurationMs("21번.", 1)).toBeLessThan(2_500);
    expect(maximumLiteralDurationMs("다음을 듣고 가장 알맞은 그림을 고르십시오.", 1)).toBeGreaterThan(4_000);
  });
});
