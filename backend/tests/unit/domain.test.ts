import { describe, expect, it } from "vitest";
import { bearerToken, clampActiveDuration, normalizeEmail, sanitizeQuestion } from "../../src/exam/domain.js";

describe("response analytics helpers", () => {
  it("caps active time deltas to one minute", () => {
    expect(clampActiveDuration(-5)).toBe(0);
    expect(clampActiveDuration(10_250.4)).toBe(10_250);
    expect(clampActiveDuration(90_000)).toBe(60_000);
    expect(clampActiveDuration(Number.NaN)).toBe(0);
  });

  it("normalizes subscription emails", () => {
    expect(normalizeEmail("  Student@Example.COM ")).toBe("student@example.com");
  });

  it("extracts bearer tokens safely", () => {
    expect(bearerToken("Bearer secret-token")).toBe("secret-token");
    expect(bearerToken("Basic secret-token")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});

describe("question sanitization", () => {
  it("returns renderable content without correct answers or explanations", () => {
    const result = sanitizeQuestion({
      item_order: 1,
      section: "reading",
      test_position: 1,
      item_id: "item-id",
      item_version: 2,
      item_type: "grammar_blank",
      stem: "fallback",
      choices: ["a", "b", "c", "d"],
      selected_option: null,
      content_json: {
        stem: "문장 ( ) 문장",
        choices: ["가", "나", "다", "라"],
        answer: 3,
        explanation: "secret",
      },
    });
    expect(result.stem).toBe("문장 ( ) 문장");
    expect(result.choices).toEqual(["가", "나", "다", "라"]);
    expect(result).not.toHaveProperty("answer");
    expect(result).not.toHaveProperty("explanation");
  });

  it("uses the applied audio track play limit instead of the source passage repeat count", () => {
    const result = sanitizeQuestion({
      item_order: 13,
      section: "listening",
      test_position: 13,
      item_id: "item-id",
      item_version: 1,
      item_type: "paired_13_14",
      stem: "hidden",
      choices: ["1", "2", "3", "4"],
      selected_option: null,
      audio_asset_id: "audio-id",
      audio_repeat_count: 1,
      content_json: { repeat_count: 2, dialogue_turns: [{ speaker: "남자", text: "안녕하세요." }] },
    });
    expect(result.repeatCount).toBe(1);
  });

  it("keeps a reading material graph separate from its text answer choices", () => {
    const result = sanitizeQuestion({
      item_order: 10,
      section: "reading",
      test_position: 10,
      item_id: "item-id",
      item_version: 1,
      item_type: "content_match_short",
      stem: "그래프의 내용과 같은 것을 고르십시오.",
      choices: ["가", "나", "다", "라"],
      selected_option: null,
      content_json: { passage: "독서 34%, 운동 28%" },
      visual_assets: [],
      material_visual: { imageUrl: "https://example.com/reading-10.png", description: "여가 활동 비율 그래프" },
    });

    expect(result.materialVisual).toEqual({
      imageUrl: "https://example.com/reading-10.png",
      description: "여가 활동 비율 그래프",
    });
    expect(result.visualOptions).toEqual([]);
    expect(result.choices).toEqual(["가", "나", "다", "라"]);
    expect(result.passage).toBe("독서 34%, 운동 28%");
  });
});
