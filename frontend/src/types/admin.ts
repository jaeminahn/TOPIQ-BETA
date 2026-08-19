import type { ExamMode, Question, TranscriptTurn } from "./public";

export interface AdminSummary {
  totalItems: number; totalVersions: number; readingVersions: number; listeningVersions: number;
  setCount: number; mockTestCount: number; publishedMockTests: number; audioReady: number;
  audioMissing: number; visualReady: number; jobsQueued: number; jobsProcessing: number;
  jobsFailed: number; sessionsToday: number;
  responseCount: number; answeredResponseCount: number; unansweredResponseCount: number;
}

export interface AdminListeningTarget {
  itemId: string; itemVersion: number; position: number; itemType: string; questionPrompt: string;
  stem: string; choices: string[]; correctAnswer: number | null; explanation: string;
  contentJson: Record<string, unknown>;
  visualOptionCount: number; visualReadyCount: number; visualOptions: AdminVisualOption[];
}

export interface AdminVisualOption {
  optionNumber: number; description: string; imagePrompt: string; chartSpec: Record<string, unknown> | null;
  visualAssetId: string | null; imageUrl: string | null;
  generationStatus: "queued" | "processing" | "succeeded" | "failed" | null;
  generationError: string | null;
}

export interface AdminListeningGroup {
  setId: string; setVersion: number; positions: number[]; leaderItemId: string; leaderItemVersion: number;
  itemType: string; dialogueTurns: TranscriptTurn[]; questionPrompts: string[]; repeatCount: number;
  audioAssetId: string | null; audioStorageUrl: string | null;
  audioStatus: "ready" | "missing" | "partial"; targets: AdminListeningTarget[];
  lastError: string | null; ttsStyle: TtsStyle | null;
}

export interface TtsJob {
  jobId: string; itemId: string; itemVersion: number; status: "queued" | "processing" | "succeeded" | "failed";
  attempts: number; errorMessage: string | null; audioAssetId: string | null; createdAt: string; completedAt: string | null;
}

export interface AdminListeningMockTest {
  mockTestId: string; titleKo: string; published: boolean; setId: string; setVersion: number;
  itemCount: number; audioReady: number; visualRequired: number; visualReady: number;
}

export type AdminListeningSetBlockReason = "SET_NOT_REVIEWED" | "SET_NOT_PUBLISHED" | "ITEM_COUNT_INVALID" | "ITEMS_INVALID";

export interface AdminListeningSet {
  setId: string; setVersion: number; setSequence: number; createdAt: string;
  reviewStatus: string; publishedAt: string | null; itemCount: number; validItemCount: number;
  audioReady: number; visualRequired: number; visualReady: number;
  mockTestId: string | null; slug: string | null; titleKo: string | null;
  mockTestPublished: boolean | null; round: number | null;
  readyToRegister: boolean; readyToPublish: boolean; blockingReasons: AdminListeningSetBlockReason[];
}

export interface TtsStyle { speakingRate: number; stylePrompt: string }

export interface AdminReadingItem {
  setId: string; setVersion: number; position: number; mockTestTitle: string | null;
  itemId: string; itemVersion: number; itemType: string; targetLevel: number;
  predictedDifficulty: number; reviewStatus: string; stem: string; choices: string[];
  correctAnswer: number | null; explanation: string; contentJson: Record<string, unknown>;
}

export type AdminReadingSetBlockReason = "SET_NOT_REVIEWED" | "SET_NOT_PUBLISHED" | "ITEM_COUNT_INVALID" | "ITEMS_INVALID";

export interface AdminReadingSet {
  setId: string; setVersion: number; setSequence: number; createdAt: string;
  reviewStatus: string; publishedAt: string | null; itemCount: number; validItemCount: number;
  mockTestId: string | null; slug: string | null; titleKo: string | null;
  mockTestPublished: boolean | null; round: number | null; readyToPublish: boolean;
  blockingReasons: AdminReadingSetBlockReason[];
}

export interface AdminResponseSession {
  sessionId: string; userId: string; mockTestTitle: string; mode: ExamMode; status: "submitted" | "abandoned";
  startedAt: string; submittedAt: string | null; score: number | null; maxScore: number; rating: number | null;
  section: "reading" | "listening"; responseCount: number; answeredCount: number;
  unansweredCount: number; correctCount: number; incorrectCount: number;
}

export interface AdminQuestionRevision {
  position: number; itemId: string; itemVersion: number; stem: string; choices: string[];
  correctAnswer: number; explanation: string; contentJson: Record<string, unknown>;
}

export interface AdminResponseObservation {
  observationId: string; userId: string; sessionId: string; itemId: string; itemVersion: number;
  itemOrder: number; section: "reading" | "listening"; testPosition: number; mockTestTitle: string; itemType: string;
  selectedOption: number | null; correctAnswer: number; isCorrect: boolean; responseTimeMs: number; skipped: boolean;
  timedOut: boolean; answerChanged: boolean; policyVersion: string; createdAt: string;
  mode: ExamMode; score: number | null; rating: number | null;
  question: Question; explanation: string;
}
