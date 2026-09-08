import { describe, expect, it } from "vitest";
import { createBellWave, createSilenceWave, readLinear16WaveFormat } from "./audio-composer.js";

const pcmFormat = {
  audioFormat: 1,
  channels: 1,
  sampleRate: 24_000,
  byteRate: 48_000,
  blockAlign: 2,
  bitsPerSample: 16,
  dataBytes: 0,
};

describe("audio composer", () => {
  it("creates an exact two-second mono LINEAR16 WAV", () => {
    const audio = createSilenceWave(2_000, pcmFormat);
    const format = readLinear16WaveFormat(audio);
    expect(format).toMatchObject({ sampleRate: 24_000, channels: 1, bitsPerSample: 16, dataBytes: 96_000 });
    expect(format.dataBytes / format.byteRate * 1_000).toBe(2_000);
  });

  it("rejects non-WAV input", () => {
    expect(() => readLinear16WaveFormat(Buffer.from("not audio"))).toThrow("not a WAV file");
  });

  it("creates a deterministic 800ms two-tone bell in the target PCM format", () => {
    const audio = createBellWave(pcmFormat);
    const format = readLinear16WaveFormat(audio);
    expect(format).toMatchObject({ sampleRate: 24_000, channels: 1, bitsPerSample: 16, dataBytes: 38_400 });
    expect(format.dataBytes / format.byteRate * 1_000).toBe(800);
    expect(audio.readInt16LE(44)).toBe(0);
    expect(Array.from({ length: 200 }, (_, index) => audio.readInt16LE(44 + (index + 100) * 2))
      .some((sample) => sample !== 0)).toBe(true);
    expect(Array.from({ length: 200 }, (_, index) => audio.readInt16LE(44 + (7_800 + index) * 2))
      .every((sample) => sample === 0)).toBe(true);
  });
});
