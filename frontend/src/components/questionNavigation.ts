import type { Question } from "../types";

export function normalizeQuestionOrder(questions: Question[], requestedOrder: number) {
  const bounded = Math.max(1, Math.min(questions.length, requestedOrder));
  const target = questions.find((question) => question.itemOrder === bounded);
  if (!target?.itemType.startsWith("paired_")) return bounded;
  return Math.min(
    ...questions
      .filter((question) => question.itemType === target.itemType)
      .map((question) => question.itemOrder),
  );
}
