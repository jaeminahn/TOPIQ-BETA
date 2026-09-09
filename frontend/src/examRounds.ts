import type { Exam } from "./types";

export interface ExamRound {
  key: string;
  round: number | null;
  exams: Exam[];
}

function examRoundNumber(slug: string) {
  const match = /-(\d+)$/.exec(slug);
  return match ? Number(match[1]) : null;
}

export function groupExamsByRound(exams: Exam[]): ExamRound[] {
  const groups = new Map<string, ExamRound>();
  for (const exam of exams) {
    const round = examRoundNumber(exam.slug);
    const key = round === null ? "other" : `round-${round}`;
    const group = groups.get(key) ?? { key, round, exams: [] };
    group.exams.push(exam);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (a.round ?? Number.MAX_SAFE_INTEGER) - (b.round ?? Number.MAX_SAFE_INTEGER))
    .map((group) => ({
      ...group,
      exams: [...group.exams].sort((a, b) => {
        const sectionOrder = { reading: 0, listening: 1, writing: 2 } as const;
        return sectionOrder[a.section] - sectionOrder[b.section];
      }),
    }));
}
