import { describe, expect, it, vi } from "vitest";
import {
  buildGoogleTtsRequest,
  buildLiteralGoogleTtsRequest,
  literalDeliveryStyle,
  synthesizeLiteralOnce,
} from "../../src/listening/google-tts.js";
import { createSilenceWave } from "../../src/listening/audio-composer.js";

const pcmFormat = {
  audioFormat: 1,
  channels: 1,
  sampleRate: 24_000,
  byteRate: 48_000,
  blockAlign: 2,
  bitsPerSample: 16,
  dataBytes: 0,
};

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

  it("normalizes style prose", () => {
    expect(literalDeliveryStyle("따뜻하고 자연스럽지만 시험처럼 두 번 읽어 주세요"))
      .toBe("natural, warm");
    expect(literalDeliveryStyle("두 번 반복해 주세요")).toBe("neutral and clear");
  });

  it("accepts the first literal result even when it is long", async () => {
    const long = createSilenceWave(5_000, pcmFormat);
    const replacement = createSilenceWave(1_500, pcmFormat);
    const request = vi.fn().mockResolvedValueOnce(long).mockResolvedValueOnce(replacement);

    await expect(synthesizeLiteralOnce(request)).resolves.toBe(long);
    expect(request).toHaveBeenCalledOnce();
  });

  it("propagates a literal provider failure without retrying", async () => {
    const request = vi.fn().mockRejectedValue(new Error("provider failed"));
    await expect(synthesizeLiteralOnce(request)).rejects.toThrow("provider failed");
    expect(request).toHaveBeenCalledOnce();
  });
});
