import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ signedAudioUrl: vi.fn() }));
vi.mock("../../src/core/db.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("../../src/media/storage.js", () => ({
  SupabaseStorage: class { signedAudioUrl = storage.signedAudioUrl; },
}));
import { pool } from "../../src/core/db.js";
import { AppError } from "../../src/core/errors.js";
import { TopikRepository } from "../../src/exam/repository.js";

const input = {
  sessionId: "session-1", token: "session-token", audioAssetId: "audio-1",
  clientPlayId: "play-1", eventType: "prepared" as const,
};

function setup(options: {
  mode?: "timed" | "practice"; count?: number; status?: string; expired?: boolean;
  missingAsset?: boolean; commitError?: Error; started?: boolean;
} = {}) {
  const operations: string[] = [];
  let released = false;
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (released) throw new Error("Query on a released connection");
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) operations.push(sql);
    if (sql === "COMMIT" && options.commitError) throw options.commitError;
    if (sql.includes("SELECT * FROM topik_app.sessions")) return { rows: [{
      session_id: input.sessionId, user_id: "user-1", mode: options.mode ?? "timed",
      status: options.status ?? "in_progress",
      access_token_hash: createHash("sha256").update(input.token).digest("hex"),
      expires_at: options.expired ? new Date(0) : new Date("2099-01-01"),
    }], rowCount: 1 };
    if (sql.includes("SELECT taa.storage_path")) return {
      rows: options.missingAsset ? [] : [{ storage_path: "listening/track.mp3", repeat_count: 1 }],
      rowCount: options.missingAsset ? 0 : 1,
    };
    if (sql.includes("COUNT(DISTINCT client_play_id)")) return { rows: [{ count: String(options.count ?? 0) }], rowCount: 1 };
    if (sql.includes("SELECT play_number")) return { rows: options.started ? [{ play_number: 1 }] : [], rowCount: options.started ? 1 : 0 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn(() => { released = true; operations.push("release"); });
  vi.mocked(pool.connect).mockResolvedValue({ query, release } as never);
  return { query, release, operations };
}

beforeEach(() => {
  vi.mocked(pool.connect).mockReset();
  storage.signedAudioUrl.mockReset().mockResolvedValue("https://example.test/signed-audio");
});

describe("audio playback connection lifetime", () => {
  it("returns the connection before a slow Storage signing request starts", async () => {
    const { query, release, operations } = setup();
    let finishSigning!: (url: string) => void;
    let startedSigning!: () => void;
    const signingStarted = new Promise<void>(resolve => { startedSigning = resolve; });
    storage.signedAudioUrl.mockImplementation(() => {
      operations.push("sign");
      startedSigning();
      return new Promise<string>(resolve => { finishSigning = resolve; });
    });
    const playback = new TopikRepository().recordAudioPlayback(input);
    await signingStarted;
    expect(operations).toEqual(["BEGIN", "COMMIT", "release", "sign"]);
    expect(release).toHaveBeenCalledTimes(1);
    const queryCount = query.mock.calls.length;
    finishSigning("https://example.test/signed-audio");
    await expect(playback).resolves.toEqual({
      submitted: false, playNumber: 1, maxPlays: 1, audioUrl: "https://example.test/signed-audio",
    });
    expect(storage.signedAudioUrl).toHaveBeenCalledWith("listening/track.mp3");
    expect(query).toHaveBeenCalledTimes(queryCount);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("propagates signing failure without rolling back the committed transaction", async () => {
    const { query, release } = setup();
    const error = new AppError(502, "STORAGE_SIGN_FAILED", "Storage unavailable");
    storage.signedAudioUrl.mockRejectedValue(error);
    await expect(new TopikRepository().recordAudioPlayback(input)).rejects.toBe(error);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(query).not.toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid token", {}, { token: "wrong-token" }, "INVALID_SESSION_TOKEN"],
    ["closed session", { status: "submitted" }, {}, "SESSION_CLOSED"],
    ["missing asset", { missingAsset: true }, {}, "NOT_FOUND"],
    ["replay limit", { count: 1 }, {}, "AUDIO_REPLAY_LIMIT"],
  ] as const)("does not sign a URL for %s", async (_name, options, overrides, code) => {
    const { query, release } = setup(options);
    await expect(new TopikRepository().recordAudioPlayback({ ...input, ...overrides })).rejects.toMatchObject({ code });
    expect(storage.signedAudioUrl).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not sign when the DB commit fails", async () => {
    const error = new Error("Commit failed");
    const { query, release } = setup({ commitError: error });
    await expect(new TopikRepository().recordAudioPlayback(input)).rejects.toBe(error);
    expect(storage.signedAudioUrl).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("finishes an expired session without requesting an audio URL", async () => {
    const { query, release } = setup({ expired: true });
    await expect(new TopikRepository().recordAudioPlayback(input)).resolves.toEqual({ submitted: true });
    expect(storage.signedAudioUrl).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("keeps practice playback unlimited", async () => {
    setup({ mode: "practice", count: 5 });
    await expect(new TopikRepository().recordAudioPlayback(input)).resolves.toMatchObject({ playNumber: 6, maxPlays: null });
  });

  it.each(["started", "completed", "interrupted"] as const)("records %s without signing a URL", async eventType => {
    const { query, release } = setup({ started: eventType !== "started" });
    await expect(new TopikRepository().recordAudioPlayback({ ...input, eventType })).resolves.toEqual({
      submitted: false, playNumber: 1, maxPlays: 1,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO topik_app.audio_playback_events"),
      [expect.any(String), input.clientPlayId, input.sessionId, input.audioAssetId, eventType, 1]);
    expect(storage.signedAudioUrl).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
