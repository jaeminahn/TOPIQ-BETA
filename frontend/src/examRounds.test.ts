import { describe, expect, it } from "vitest";
import type { Exam } from "./types";
import { groupExamsByRound } from "./examRounds";

const exam = (slug: string, section: Exam["section"]): Exam => ({
  id: slug,
  slug,
  titleId: slug,
  titleKo: slug,
  descriptionId: "description",
  descriptionKo: "설명",
  durationSeconds: 3600,
  questionCount: 50,
  maxScore: 100,
  section,
});

describe("groupExamsByRound", () => {
  it("groups matching reading and listening rounds and sorts reading first", () => {
    const groups = groupExamsByRound([
      exam("topik-ii-reading-2", "reading"),
      exam("topik-ii-listening-1", "listening"),
      exam("topik-ii-reading-1", "reading"),
      exam("topik-ii-listening-2", "listening"),
    ]);
    expect(groups.map((group) => group.round)).toEqual([1, 2]);
    expect(groups[0].exams.map((item) => item.section)).toEqual(["reading", "listening"]);
    expect(groups[1].exams.map((item) => item.section)).toEqual(["reading", "listening"]);
  });

  it("places slugs without a round in the final other group", () => {
    const groups = groupExamsByRound([exam("topik-special", "reading"), exam("topik-ii-reading-1", "reading")]);
    expect(groups.map((group) => group.round)).toEqual([1, null]);
  });
});
