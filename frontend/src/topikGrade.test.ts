import { describe, expect, it } from "vitest";
import { predictTopikGrade } from "./topikGrade";

describe("predictTopikGrade", () => {
  it.each([
    [49, "below-3"],
    [50, 3],
    [59, 3],
    [60, 4],
    [74, 4],
    [75, 5],
    [84, 5],
    [85, 6],
    [100, 6],
  ] as const)("maps %i points to %s", (score, expected) => {
    expect(predictTopikGrade(score)).toBe(expected);
  });
});
