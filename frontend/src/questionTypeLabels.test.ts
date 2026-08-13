import { describe, expect, it } from "vitest";
import { questionTypeLabel } from "./questionTypeLabels";

describe("question type labels", () => {
  it("returns Korean labels for reading and listening types", () => {
    expect(questionTypeLabel("grammar_blank", "reading")).toBe("문법 빈칸");
    expect(questionTypeLabel("visual_chart", "listening")).toBe("그래프 선택");
  });

  it("distinguishes shared passages from shared listening audio", () => {
    expect(questionTypeLabel("paired_21_22", "reading")).toBe("공통 지문");
    expect(questionTypeLabel("paired_21_22", "listening")).toBe("공통 듣기");
  });
});
