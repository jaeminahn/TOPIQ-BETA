import { describe, expect, it } from "vitest";
import { buildNarrationScript, isAdminNarrationScript, NARRATION_GAP_MS } from "../../src/listening-narration.js";

const turns = [{ speaker: "남자" as const, text: "회의는 세 시에 시작합니다." }];

describe("buildNarrationScript", () => {
  it("builds a numbered instruction followed by one dialogue for a single item", () => {
    expect(buildNarrationScript([{ position: 7, questionPrompt: "들은 내용과 같은 것을 고르십시오.", dialogueTurns: turns }])).toEqual({
      version: "exam_track_v4",
      kind: "single",
      positions: [7],
      segments: [
        { kind: "bell" },
        { kind: "silence", durationMs: NARRATION_GAP_MS },
        { kind: "speech", role: "instruction", speaker: "여자", text: "7번. 들은 내용과 같은 것을 고르십시오." },
        { kind: "silence", durationMs: NARRATION_GAP_MS },
        { kind: "dialogue", repeatIndex: 1, turns },
      ],
    });
  });

  it("builds the complete common-question sequence with one-second gaps between every part", () => {
    const script = buildNarrationScript([
      { position: 14, questionPrompt: "들은 내용과 같은 것을 고르십시오.", dialogueTurns: turns },
      { position: 13, questionPrompt: "남자의 중심 생각을 고르십시오.", dialogueTurns: turns },
    ]);

    expect(script.positions).toEqual([13, 14]);
    expect(script.segments).toEqual([
      { kind: "bell" },
      { kind: "silence", durationMs: NARRATION_GAP_MS },
      { kind: "speech", role: "instruction", speaker: "여자", text: "다음을 듣고 물음에 답하십시오." },
      { kind: "silence", durationMs: NARRATION_GAP_MS },
      { kind: "dialogue", repeatIndex: 1, turns },
      { kind: "silence", durationMs: NARRATION_GAP_MS },
      { kind: "speech", role: "reread", speaker: "여자", text: "다시 읽겠습니다." },
      { kind: "silence", durationMs: NARRATION_GAP_MS },
      { kind: "dialogue", repeatIndex: 2, turns },
      { kind: "silence", durationMs: NARRATION_GAP_MS },
      { kind: "speech", role: "question_number", speaker: "여자", text: "13번." },
      { kind: "silence", durationMs: NARRATION_GAP_MS },
      { kind: "speech", role: "question_number", speaker: "여자", text: "14번." },
    ]);
    expect(script.segments.filter((segment) => segment.kind === "speech" && segment.role === "reread")).toHaveLength(1);
    expect(script.segments.filter((segment) => segment.kind === "speech" && segment.role === "question_number")).toHaveLength(2);
    expect(script.segments.find((segment) => segment.kind === "speech" && segment.role === "instruction"))
      .not.toMatchObject({ text: expect.stringContaining("13번") });
    expect(JSON.stringify(script)).not.toContain("두 번 읽겠습니다");
  });

  it("adds one-second gaps between all common segments but never after the last", () => {
    const script = buildNarrationScript([11, 12, 13].map((position) => ({ position, questionPrompt: "질문", dialogueTurns: turns })));
    const meaningful = script.segments.filter((segment) => segment.kind !== "silence");
    expect(script.segments.filter((segment) => segment.kind === "silence"))
      .toHaveLength(meaningful.length - 1);
    expect(script.segments.filter((segment) => segment.kind === "silence"))
      .toEqual(Array.from({ length: meaningful.length - 1 }, () => ({ kind: "silence", durationMs: 1_000 })));
    expect(script.segments.at(-1)).toMatchObject({ kind: "speech", text: "13번." });
  });

  it("rejects inconsistent common passages and malformed stored scripts", () => {
    expect(() => buildNarrationScript([
      { position: 13, questionPrompt: "질문", dialogueTurns: turns },
      { position: 14, questionPrompt: "질문", dialogueTurns: [{ speaker: "여자", text: "다른 지문" }] },
    ])).toThrow("must share");
    expect(isAdminNarrationScript({
      version: "exam_track_v4", kind: "common", positions: [14, 13],
      segments: [{ kind: "silence", durationMs: -1 }],
    })).toBe(false);
  });

  it("accepts stored v2/v3 scripts but only allows bell segments from v3", () => {
    expect(isAdminNarrationScript({
      version: "exam_track_v2", kind: "single", positions: [1],
      segments: [{ kind: "speech", role: "instruction", speaker: "여자", text: "1번." }],
    })).toBe(true);
    expect(isAdminNarrationScript({
      version: "exam_track_v2", kind: "single", positions: [1], segments: [{ kind: "bell" }],
    })).toBe(false);
    expect(isAdminNarrationScript({
      version: "exam_track_v3", kind: "single", positions: [1], segments: [{ kind: "bell" }],
    })).toBe(true);
  });
});
