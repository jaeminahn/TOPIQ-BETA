import { describe, expect, it, vi } from "vitest";
import {
  buildGoogleTtsRequest,
  buildLiteralGoogleTtsRequest,
  literalDeliveryStyle,
  maximumLiteralDurationMs,
  synthesizeLiteralWithDurationRetry,
} from "./google-tts.js";
import { createSilenceWave } from "./audio-composer.js";

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

  it("normalizes style prose and sets a conservative literal-duration ceiling", () => {
    expect(literalDeliveryStyle("따뜻하고 자연스럽지만 시험처럼 두 번 읽어 주세요"))
      .toBe("natural, warm");
    expect(literalDeliveryStyle("두 번 반복해 주세요")).toBe("neutral and clear");
    expect(maximumLiteralDurationMs("21번.", 1)).toBeLessThan(2_500);
    expect(maximumLiteralDurationMs("다음을 듣고 가장 알맞은 그림을 고르십시오.", 1)).toBeGreaterThan(4_000);
  });

  it("keeps a normal first literal result without retrying", async () => {
    const normal = createSilenceWave(1_500, pcmFormat);
    const request = vi.fn().mockResolvedValue(normal);

    await expect(synthesizeLiteralWithDurationRetry(request, 2_000)).resolves.toBe(normal);
    expect(request).toHaveBeenCalledOnce();
  });

  it("uses the retried result when the first literal result is too long", async () => {
    const long = createSilenceWave(4_000, pcmFormat);
    const normal = createSilenceWave(1_500, pcmFormat);
    const request = vi.fn().mockResolvedValueOnce(long).mockResolvedValueOnce(normal);

    await expect(synthesizeLiteralWithDurationRetry(request, 2_000)).resolves.toBe(normal);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("uses the shorter result instead of failing when both literal results are too long", async () => {
    const longer = createSilenceWave(5_000, pcmFormat);
    const shorter = createSilenceWave(3_000, pcmFormat);
    const request = vi.fn().mockResolvedValueOnce(longer).mockResolvedValueOnce(shorter);
    const slowCueCeiling = maximumLiteralDurationMs("2번.", 0.9);

    await expect(synthesizeLiteralWithDurationRetry(request, slowCueCeiling)).resolves.toBe(shorter);

    const reversedRequest = vi.fn().mockResolvedValueOnce(shorter).mockResolvedValueOnce(longer);
    await expect(synthesizeLiteralWithDurationRetry(reversedRequest, slowCueCeiling)).resolves.toBe(shorter);
  });

  it("still rejects provider failures and invalid LINEAR16 responses", async () => {
    await expect(synthesizeLiteralWithDurationRetry(
      vi.fn().mockRejectedValue(new Error("provider failed")),
      2_000,
    )).rejects.toThrow("provider failed");
    await expect(synthesizeLiteralWithDurationRetry(
      vi.fn().mockResolvedValue(Buffer.from("not audio")),
      2_000,
    )).rejects.toThrow("not a WAV file");
  });
});
