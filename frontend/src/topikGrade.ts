export type PredictedTopikGrade = "below-3" | 3 | 4 | 5 | 6;

export function predictTopikGrade(score: number): PredictedTopikGrade {
  if (score >= 85) return 6;
  if (score >= 75) return 5;
  if (score >= 60) return 4;
  if (score >= 50) return 3;
  return "below-3";
}
