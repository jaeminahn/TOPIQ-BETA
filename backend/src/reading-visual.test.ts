import { describe, expect, it } from "vitest";
import { buildReadingGraphPrompt, materialPromptSnapshot, normalizeReadingMaterial } from "./reading-visual.js";

describe("reading graph material", () => {
  it("recognizes position 10 and derives a complete Gemini prompt from the passage", () => {
    const material = normalizeReadingMaterial(10, {
      passage: "주말 활동\n독서: 34%\n운동: 28%\n〈조사 대상: 2,000명〉",
    });
    expect(material).toMatchObject({
      description: expect.stringContaining("독서: 34%"),
      sourceText: expect.stringContaining("운동: 28%"),
      imagePrompt: expect.stringContaining("값을 추가·삭제·변경하지 마세요"),
    });
    expect(materialPromptSnapshot(material!, "content_match_short")).toMatchObject({
      visualRole: "material",
      chartSpec: null,
    });
  });

  it("does not classify other reading positions as graph material", () => {
    expect(normalizeReadingMaterial(9, { passage: "독서: 34%" })).toBeNull();
  });

  it("rebuilds a stale stored prompt when its source passage changed", () => {
    const material = normalizeReadingMaterial(10, {
      passage: "새 제목\n산책: 42%",
      visual_material: { source_text: "옛 제목", image_prompt: "옛 프롬프트" },
    });
    expect(material?.imagePrompt).toBe(buildReadingGraphPrompt("새 제목\n산책: 42%"));
  });
});
