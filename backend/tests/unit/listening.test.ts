import { describe, expect, it } from "vitest";
import { sanitizeQuestion } from "../../src/exam/domain.js";

const row = {
  item_order: 1, section: "listening", test_position: 1,
  item_id: "10000000-0000-4000-8000-000000000001", item_version: 1,
  item_type: "visual_scene", stem: "남자: 노출되면 안 되는 대본", choices: [],
  content_json: {
    question_prompt: "다음을 듣고 고르십시오.", repeat_count: 2,
    dialogue_turns: [{ speaker: "남자", text: "안녕하세요." }, { speaker: "여자", text: "반갑습니다." }],
  },
  audio_asset_id: "20000000-0000-4000-8000-000000000001",
  visual_assets: [{ number: 1, imageUrl: "https://example.com/one.png" }], selected_option: null,
};

describe("listening question safety", () => {
  it("never exposes the stem or transcript during an attempt", () => {
    const question = sanitizeQuestion(row);
    expect(question.stem).toBe("");
    expect(question.transcript).toBeUndefined();
    expect(question.audioAssetId).toBe(row.audio_asset_id);
    expect(question.repeatCount).toBe(2);
    expect(question.visualOptions).toHaveLength(1);
  });

  it("includes the transcript only for unlocked results", () => {
    expect(sanitizeQuestion(row, { includeTranscript: true }).transcript).toEqual(row.content_json.dialogue_turns);
  });
});
