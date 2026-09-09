import { createHash } from "node:crypto";

export const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

export const sha256 = (value: unknown) => createHash("sha256")
  .update(typeof value === "string" ? value : stableJson(value))
  .digest("hex");

export type QuestionRevisionInput = {
  position: number; itemId: string; itemVersion: number; stem: string; choices: string[];
  correctAnswer: number; explanation: string; contentJson: Record<string, unknown>;
};
