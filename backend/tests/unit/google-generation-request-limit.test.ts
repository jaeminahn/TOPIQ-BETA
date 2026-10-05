import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/db.js", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("../../src/core/config.js", () => ({
  config: {
    googleTts: { projectId: "project", model: "gemini-2.5-flash-tts", femaleVoice: "Aoede", maleVoice: "Charon" },
    googleImage: { projectId: "project", model: "gemini-2.5-flash-image", location: "global" },
  },
}));
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() { return { getRequestHeaders: async () => new Map() }; }
  },
}));

import { buildNarrationScript } from "../../src/listening/narration.js";
import { synthesizeExamTrackParts } from "../../src/listening/tts-worker.js";

const fetchMock = vi.fn();
let withGoogleGenerationRequest: typeof import("../../src/media/google-generation-request-limit.js").withGoogleGenerationRequest;
let GoogleTtsClient: typeof import("../../src/listening/google-tts.js").GoogleTtsClient;
let GoogleImageClient: typeof import("../../src/media/google-image.js").GoogleImageClient;

beforeEach(async () => {
  // Each test starts a fresh server process's module-scoped request queues.
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  [{ withGoogleGenerationRequest }, { GoogleTtsClient }, { GoogleImageClient }] = await Promise.all([
    import("../../src/media/google-generation-request-limit.js"),
    import("../../src/listening/google-tts.js"),
    import("../../src/media/google-image.js"),
  ]);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Google generation request pacing", () => {
  it.each(["success", "failure"])("waits three minutes after a long request ends with %s", async (outcome) => {
    let finish!: () => void;
    const firstRequest = vi.fn(() => new Promise<void>((resolve, reject) => {
      finish = outcome === "success" ? resolve : () => reject(new Error("quota exceeded"));
    }));
    const first = withGoogleGenerationRequest("project", "tts", firstRequest).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(firstRequest).toHaveBeenCalledOnce();
    const nextRequest = vi.fn().mockResolvedValue("second");
    const next = withGoogleGenerationRequest("project", "tts", nextRequest);
    await vi.advanceTimersByTimeAsync(360_000);
    expect(nextRequest).not.toHaveBeenCalled();
    finish();
    await first;
    await vi.advanceTimersByTimeAsync(179_999);
    expect(nextRequest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(next).resolves.toBe("second");
    expect(firstRequest).toHaveBeenCalledOnce();
  });

  it("keeps cooldown state for a new caller and separates projects and models", async () => {
    await withGoogleGenerationRequest("project", "tts", async () => "first");
    const nextRequest = vi.fn().mockResolvedValue("second");
    const next = withGoogleGenerationRequest("project", "tts", nextRequest);
    await expect(withGoogleGenerationRequest("project", "image", async () => "image")).resolves.toBe("image");
    await expect(withGoogleGenerationRequest("other-project", "tts", async () => "other")).resolves.toBe("other");
    await vi.advanceTimersByTimeAsync(179_999);
    expect(nextRequest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(next).resolves.toBe("second");
  });

  it("preserves the remaining cooldown when a new request arrives after the queue empties", async () => {
    await withGoogleGenerationRequest("project", "tts", async () => "first");
    await vi.advanceTimersByTimeAsync(60_000);
    const request = vi.fn().mockResolvedValue("second");
    const pending = withGoogleGenerationRequest("project", "tts", request);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe("second");
  });

  it("resets the cooldown when the server's modules restart", async () => {
    await withGoogleGenerationRequest("project", "tts", async () => "first");
    vi.resetModules();
    const restarted = await import("../../src/media/google-generation-request-limit.js");
    const request = vi.fn().mockResolvedValue("restarted");
    await expect(restarted.withGoogleGenerationRequest("project", "tts", request)).resolves.toBe("restarted");
    expect(request).toHaveBeenCalledOnce();
  });

  it("keeps concurrent requests in order even when a queued request throws synchronously", async () => {
    const calls: string[] = [];
    const first = withGoogleGenerationRequest("project", "tts", async () => { calls.push("first"); return "first"; });
    const second = withGoogleGenerationRequest("project", "tts", () => {
      calls.push("second"); throw new Error("quota exceeded");
    }).catch((error: Error) => error.message);
    const third = withGoogleGenerationRequest("project", "tts", async () => { calls.push("third"); return "third"; });
    await expect(first).resolves.toBe("first");
    await vi.advanceTimersByTimeAsync(179_999);
    expect(calls).toEqual(["first"]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe("quota exceeded");
    await vi.advanceTimersByTimeAsync(179_999);
    expect(calls).toEqual(["first", "second"]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(third).resolves.toBe("third");
    expect(calls).toEqual(["first", "second", "third"]);
  });
});

describe("actual Google client calls", () => {
  it("paces every sentence request within one shared listening audio track", async () => {
    const requestTimes: number[] = [];
    fetchMock.mockImplementation(async () => {
      requestTimes.push(Date.now());
      return { ok: true, json: async () => ({ audioContent: Buffer.from("audio").toString("base64") }) };
    });
    const script = buildNarrationScript([13, 14].map((position) => ({
      position, questionPrompt: "질문", dialogueTurns: [{ speaker: "남자" as const, text: "안녕하세요." }],
    })));
    const client = new GoogleTtsClient();
    const pending = synthesizeExamTrackParts(script, { speakingRate: 1, stylePrompt: "" },
      client.synthesize.bind(client), client.synthesizeLiteral.bind(client));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(179_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(540_000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(requestTimes.slice(1).map((time, index) => time - requestTimes[index]!))
      .toEqual([180_000, 180_000, 180_000, 180_000]);
  });

  it("waits after a quota error before a new literal or legacy client request", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Quota exceeded" } }) })
      .mockResolvedValue({ ok: true, json: async () => ({ audioContent: Buffer.from("audio").toString("base64") }) });
    await expect(new GoogleTtsClient().synthesizeLiteral({ speaker: "남자", text: "안녕하세요." }))
      .rejects.toThrow("Quota exceeded");
    const pending = new GoogleTtsClient().synthesize([{ speaker: "여자", text: "반갑습니다." }]);
    await vi.advanceTimersByTimeAsync(179_999);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("paces both listening and reading image requests independently of TTS", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes("texttospeech")
        ? { audioContent: Buffer.from("audio").toString("base64") }
        : { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from("image").toString("base64") } }] } }] },
    }));
    await Promise.all([
      new GoogleTtsClient().synthesizeLiteral({ speaker: "남자", text: "안녕하세요." }),
      new GoogleImageClient().generate("버스 정류장", "listening_choice"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pending = Promise.all([
      new GoogleTtsClient().synthesizeLiteral({ speaker: "여자", text: "반갑습니다." }),
      new GoogleImageClient().generate("독서 통계", "reading_material"),
    ]);
    await vi.advanceTimersByTimeAsync(179_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
