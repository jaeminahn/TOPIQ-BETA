import { AppError } from '../core/errors.js';

export type Difficulty = 1 | 2 | 3;
export const policyVersion = 'MARATHON_V1';
export function defaultDifficulty(position: number, count: number): Difficulty {
  return position / count <= 0.3 ? 1 : position / count <= 0.7 ? 2 : 3;
}
export function targetDifficulty(order: number, recent: boolean[], random = Math.random): Difficulty {
  if (order <= 3) return 1;
  if (order <= 5) return 2;
  const accuracy = recent.filter(Boolean).length / Math.max(1, recent.length);
  const primary = random() < 0.7;
  return accuracy >= 0.8 ? (primary ? 3 : 2) : accuracy >= 0.4 ? (primary ? 2 : 1) : (primary ? 1 : 2);
}
export interface Candidate {
  difficulty: Difficulty;
  personalCount: number;
  answeredCount: number;
}
export function selectCandidate<T extends Candidate>(candidates: T[], target: Difficulty, order: number, random = Math.random): T {
  let pool = order <= 3 ? candidates.filter((item) => item.difficulty === 1) : candidates;
  if (!pool.length) throw new AppError(503, 'MARATHON_NO_QUESTIONS', 'No ready questions are available for this marathon');
  const available = [...new Set(pool.map((item) => item.difficulty))].sort((a,b) => Math.abs(a-target)-Math.abs(b-target) || a-b);
  pool = pool.filter((item) => item.difficulty === available[0]);
  const minimum = Math.min(...pool.map((item) => item.personalCount));
  pool = pool.filter((item) => item.personalCount === minimum);
  // Shuffle ties before sorting so a fixed set of zero-response items does not monopolize selection.
  pool = pool.map((item) => ({ item, tie: random() })).sort((a,b) => a.item.answeredCount-b.item.answeredCount || a.tie-b.tie).map(({item}) => item);
  const size = Math.min(pool.length, Math.max(5, Math.ceil(pool.length * 0.2)));
  return pool[Math.min(size-1, Math.floor(random()*size))]!;
}
