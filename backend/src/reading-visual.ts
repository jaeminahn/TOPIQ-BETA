export type ReadingMaterialPrompt = {
  description: string;
  imagePrompt: string;
  sourceText: string;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function buildReadingGraphPrompt(sourceText: string) {
  return [
    "TOPIK II 읽기 10번용 흑백 통계 그래프를 만드세요.",
    "제목, 모든 한국어 항목, 비율과 조사 대상을 다음 원문과 정확히 일치시키고 값을 추가·삭제·변경하지 마세요.",
    `원문: ${sourceText}`,
  ].join(" ");
}

export function normalizeReadingMaterial(
  position: number,
  content: Record<string, unknown>,
  fallbackStem = "",
): ReadingMaterialPrompt | null {
  if (position !== 10) return null;
  const sourceText = text(content.passage) || text(content.stem) || fallbackStem.trim();
  if (!sourceText) return null;
  const stored = content.visual_material && typeof content.visual_material === "object"
    ? content.visual_material as Record<string, unknown>
    : {};
  const storedSource = text(stored.source_text);
  const current = storedSource === sourceText;
  return {
    description: current ? text(stored.description) || sourceText : sourceText,
    imagePrompt: current ? text(stored.image_prompt) || buildReadingGraphPrompt(sourceText) : buildReadingGraphPrompt(sourceText),
    sourceText,
  };
}

export function materialPromptSnapshot(material: ReadingMaterialPrompt, itemType: string) {
  return {
    visualRole: "material" as const,
    itemType,
    description: material.description,
    imagePrompt: material.imagePrompt,
    sourceText: material.sourceText,
    chartSpec: null,
  };
}
