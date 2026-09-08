import type { DialogueTurn } from "./google-tts.js";

export const EXAM_TRACK_VERSION = "exam_track_v4" as const;
export const LEGACY_EXAM_TRACK_VERSION = "exam_track_v2" as const;
export const PREVIOUS_EXAM_TRACK_VERSION = "exam_track_v3" as const;
export const NARRATION_GAP_MS = 1_000;

export type ExamTrackVersion = typeof LEGACY_EXAM_TRACK_VERSION
  | typeof PREVIOUS_EXAM_TRACK_VERSION
  | typeof EXAM_TRACK_VERSION;

export type NarrationSpeechRole = "instruction" | "reread" | "question_number";

export type NarrationSegment =
  | { kind: "bell" }
  | { kind: "speech"; role: NarrationSpeechRole; speaker: "여자"; text: string }
  | { kind: "dialogue"; repeatIndex: 1 | 2; turns: DialogueTurn[] }
  | { kind: "silence"; durationMs: number };

export type AdminNarrationScript = {
  version: ExamTrackVersion;
  kind: "single" | "common";
  positions: number[];
  segments: NarrationSegment[];
};

export type NarrationTarget = {
  position: number;
  questionPrompt: string;
  dialogueTurns: DialogueTurn[];
};

const numberCue = (position: number) => `${position}번.`;

function withGaps(segments: Array<Exclude<NarrationSegment, { kind: "silence" }>>): NarrationSegment[] {
  return segments.flatMap((segment, index) => index < segments.length - 1
    ? [segment, { kind: "silence" as const, durationMs: NARRATION_GAP_MS }]
    : [segment]);
}

export function buildNarrationScript(targets: NarrationTarget[]): AdminNarrationScript {
  if (!targets.length) throw new Error("Listening narration targets are missing");
  const ordered = [...targets].sort((left, right) => left.position - right.position);
  const positions = ordered.map((target) => target.position);
  if (new Set(positions).size !== positions.length || positions.some((position) => !Number.isInteger(position) || position <= 0)) {
    throw new Error("Listening narration positions are invalid");
  }
  const turns = ordered[0]!.dialogueTurns;
  if (!turns.length) throw new Error("Listening dialogue_turns are missing");
  if (ordered.length > 1 && ordered.some((target) => JSON.stringify(target.dialogueTurns) !== JSON.stringify(turns))) {
    throw new Error("Common listening items must share the same dialogue_turns");
  }

  if (ordered.length === 1) {
    const target = ordered[0]!;
    const instruction = [numberCue(target.position), target.questionPrompt.trim()].filter(Boolean).join(" ");
    return {
      version: EXAM_TRACK_VERSION,
      kind: "single",
      positions,
      segments: withGaps([
        { kind: "bell" },
        { kind: "speech", role: "instruction", speaker: "여자", text: instruction },
        { kind: "dialogue", repeatIndex: 1, turns },
      ]),
    };
  }

  const segments = withGaps([
    { kind: "bell" },
    {
      kind: "speech",
      role: "instruction",
      speaker: "여자",
      text: "다음을 듣고 물음에 답하십시오. 두 번 읽겠습니다.",
    },
    { kind: "dialogue", repeatIndex: 1, turns },
    { kind: "speech", role: "reread", speaker: "여자", text: "다시 읽겠습니다." },
    { kind: "dialogue", repeatIndex: 2, turns },
    ...positions.map((position) => ({
      kind: "speech" as const,
      role: "question_number" as const,
      speaker: "여자" as const,
      text: numberCue(position),
    })),
  ]);
  return { version: EXAM_TRACK_VERSION, kind: "common", positions, segments };
}

export function isAdminNarrationScript(value: unknown): value is AdminNarrationScript {
  if (!value || typeof value !== "object") return false;
  const script = value as Partial<AdminNarrationScript>;
  const positions = script.positions ?? [];
  const segments = script.segments ?? [];
  return ([LEGACY_EXAM_TRACK_VERSION, PREVIOUS_EXAM_TRACK_VERSION, EXAM_TRACK_VERSION] as string[]).includes(script.version ?? "")
    && (script.kind === "single" || script.kind === "common")
    && Array.isArray(positions)
    && positions.length > 0
    && positions.every((position) => Number.isInteger(position) && position > 0)
    && new Set(positions).size === positions.length
    && positions.every((position, index) => index === 0 || positions[index - 1]! < position)
    && Array.isArray(segments)
    && segments.length > 0
    && segments.every((segment) => {
      if (!segment || typeof segment !== "object" || !("kind" in segment)) return false;
      if (segment.kind === "bell") return script.version === PREVIOUS_EXAM_TRACK_VERSION || script.version === EXAM_TRACK_VERSION;
      if (segment.kind === "silence") return Number.isInteger(segment.durationMs) && segment.durationMs > 0;
      if (segment.kind === "speech") return segment.speaker === "여자"
        && ["instruction", "reread", "question_number"].includes(segment.role)
        && typeof segment.text === "string" && Boolean(segment.text.trim());
      return segment.kind === "dialogue"
        && (segment.repeatIndex === 1 || segment.repeatIndex === 2)
        && Array.isArray(segment.turns)
        && segment.turns.length > 0
        && segment.turns.every((turn) => turn && (turn.speaker === "남자" || turn.speaker === "여자")
          && typeof turn.text === "string" && Boolean(turn.text.trim()));
    });
}
