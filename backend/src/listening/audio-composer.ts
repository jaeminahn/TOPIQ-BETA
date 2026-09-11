import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../core/config.js";

export type AudioCompositionPart =
  | { kind: "audio"; data: Buffer }
  | { kind: "bell" }
  | { kind: "silence"; durationMs: number };

type WaveFormat = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataBytes: number;
};

function chunkOffset(buffer: Buffer, wanted: string) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    if (name === wanted) return { offset: offset + 8, length };
    offset += 8 + length + (length % 2);
  }
  return null;
}

export function readLinear16WaveFormat(buffer: Buffer): WaveFormat {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("TTS LINEAR16 response is not a WAV file");
  }
  const format = chunkOffset(buffer, "fmt ");
  const data = chunkOffset(buffer, "data");
  if (!format || format.length < 16 || !data) throw new Error("TTS LINEAR16 WAV chunks are missing");
  const result: WaveFormat = {
    audioFormat: buffer.readUInt16LE(format.offset),
    channels: buffer.readUInt16LE(format.offset + 2),
    sampleRate: buffer.readUInt32LE(format.offset + 4),
    byteRate: buffer.readUInt32LE(format.offset + 8),
    blockAlign: buffer.readUInt16LE(format.offset + 12),
    bitsPerSample: buffer.readUInt16LE(format.offset + 14),
    dataBytes: data.length,
  };
  if (result.audioFormat !== 1 || result.bitsPerSample !== 16) {
    throw new Error("TTS WAV must contain 16-bit PCM audio");
  }
  return result;
}

export function createSilenceWave(durationMs: number, format: WaveFormat) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Silence duration must be positive");
  const sampleFrames = Math.round(format.sampleRate * durationMs / 1_000);
  const dataLength = sampleFrames * format.blockAlign;
  const output = Buffer.alloc(44 + dataLength);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataLength, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(format.channels, 22);
  output.writeUInt32LE(format.sampleRate, 24);
  output.writeUInt32LE(format.byteRate, 28);
  output.writeUInt16LE(format.blockAlign, 32);
  output.writeUInt16LE(format.bitsPerSample, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataLength, 40);
  return output;
}

export const BELL_DURATION_MS = 620;
export const BELL_FREQUENCIES_HZ = [783.99, 1_046.5] as const;
const FIRST_TONE_DURATION_MS = 320;
const SECOND_TONE_START_MS = 150;
const SECOND_TONE_DURATION_MS = BELL_DURATION_MS - SECOND_TONE_START_MS;

function toneEnvelope(timeSeconds: number, durationSeconds: number) {
  const attackSeconds = 0.006;
  const releaseSeconds = 0.07;
  const attack = Math.min(1, timeSeconds / attackSeconds);
  const release = Math.min(1, Math.max(0, durationSeconds - timeSeconds) / releaseSeconds);
  const decay = Math.exp(-3.5 * timeSeconds / durationSeconds);
  return Math.max(0, Math.min(attack, release)) * decay;
}

function brightBellTone(timeSeconds: number, durationSeconds: number, frequency: number) {
  const partials = Math.sin(2 * Math.PI * frequency * timeSeconds) * 0.72
    + Math.sin(2 * Math.PI * frequency * 2.01 * timeSeconds) * 0.2
    + Math.sin(2 * Math.PI * frequency * 3.98 * timeSeconds) * 0.08;
  return partials * toneEnvelope(timeSeconds, durationSeconds);
}

export function createBellWave(format: WaveFormat) {
  const sampleFrames = Math.round(format.sampleRate * BELL_DURATION_MS / 1_000);
  const dataLength = sampleFrames * format.blockAlign;
  const output = createSilenceWave(BELL_DURATION_MS, format);
  const firstToneFrames = Math.round(format.sampleRate * FIRST_TONE_DURATION_MS / 1_000);
  const secondToneStart = Math.round(format.sampleRate * SECOND_TONE_START_MS / 1_000);
  const amplitude = Math.round(0.24 * 0x7fff);

  for (let frame = 0; frame < sampleFrames; frame += 1) {
    let sample = 0;
    if (frame < firstToneFrames) {
      const time = frame / format.sampleRate;
      sample += brightBellTone(time, FIRST_TONE_DURATION_MS / 1_000, BELL_FREQUENCIES_HZ[0]);
    }
    if (frame >= secondToneStart) {
      const localFrame = frame - secondToneStart;
      const time = localFrame / format.sampleRate;
      sample += brightBellTone(time, SECOND_TONE_DURATION_MS / 1_000, BELL_FREQUENCIES_HZ[1]);
    }
    const value = Math.max(-0x8000, Math.min(0x7fff, Math.round(sample * amplitude)));
    for (let channel = 0; channel < format.channels; channel += 1) {
      output.writeInt16LE(value, 44 + frame * format.blockAlign + channel * 2);
    }
  }

  // Keep the header-derived byte length as the source of truth for composition duration.
  if (dataLength !== readLinear16WaveFormat(output).dataBytes) throw new Error("Bell WAV size is invalid");
  return output;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(config.googleTts.ffmpegPath, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => { errorOutput = `${errorOutput}${String(chunk)}`.slice(-4_000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code ?? "unknown"}): ${errorOutput.trim()}`)));
  });
}

const manifestPath = (path: string) => path.replaceAll("\\", "/").replaceAll("'", "'\\''");

export async function composeExamTrack(parts: AudioCompositionPart[]) {
  if (!parts.length || !parts.some((part) => part.kind === "audio")) throw new Error("Audio composition parts are missing");
  const firstAudio = parts.find((part): part is Extract<AudioCompositionPart, { kind: "audio" }> => part.kind === "audio")!;
  const expected = readLinear16WaveFormat(firstAudio.data);
  const directory = await mkdtemp(join(tmpdir(), "unigate-exam-track-"));
  try {
    const files: string[] = [];
    let durationMs = 0;
    for (const [index, part] of parts.entries()) {
      const data = part.kind === "audio"
        ? part.data
        : part.kind === "bell"
          ? createBellWave(expected)
          : createSilenceWave(part.durationMs, expected);
      const actual = readLinear16WaveFormat(data);
      if (actual.channels !== expected.channels || actual.sampleRate !== expected.sampleRate
        || actual.bitsPerSample !== expected.bitsPerSample || actual.blockAlign !== expected.blockAlign) {
        throw new Error("TTS WAV segments do not share the same PCM format");
      }
      durationMs += actual.dataBytes / actual.byteRate * 1_000;
      const path = join(directory, `${String(index).padStart(3, "0")}.wav`);
      await writeFile(path, data);
      files.push(path);
    }
    const manifest = join(directory, "concat.txt");
    await writeFile(manifest, files.map((path) => `file '${manifestPath(path)}'`).join("\n"), "utf8");
    const output = join(directory, "exam-track.mp3");
    await runFfmpeg([
      "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", manifest,
      "-vn", "-codec:a", "libmp3lame", "-b:a", "64k", output,
    ]);
    return { audio: await readFile(output), durationMs: Math.round(durationMs) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
