import type { ExamMode, Question, TranscriptTurn } from "./public";

export interface AdminSummary {
  totalItems: number; totalVersions: number; readingVersions: number; listeningVersions: number;
  setCount: number; mockTestCount: number; publishedMockTests: number; audioReady: number;
  audioMissing: number; visualReady: number; jobsQueued: number; jobsProcessing: number;
  jobsFailed: number; sessionsToday: number;
  responseCount: number; answeredResponseCount: number; unansweredResponseCount: number;
  emailUsage: {
    enabled: boolean; configured: boolean; cycleStart: string; cycleEnd: string;
    acceptedCount: number; pendingCount: number; limit: number; remaining: number;
    warningThreshold: number; warningStatus: "not_sent" | "pending" | "accepted" | "failed";
  };
}

export interface AdminListeningTarget {
  itemId: string; itemVersion: number; position: number; itemType: string; questionPrompt: string;
  stem: string; choices: string[]; correctAnswer: number | null; explanation: string;
  contentJson: Record<string, unknown>;
  visualOptionCount: number; visualReadyCount: number; visualOptions: AdminVisualOption[];
}

export interface AdminVisualPromptOption {
  optionNumber: number; description: string; imagePrompt: string; chartSpec: Record<string, unknown> | null;
}

export interface AdminVisualOption extends AdminVisualPromptOption {
  visualAssetId: string | null; imageUrl: string | null;
  generationStatus: "queued" | "processing" | "succeeded" | "failed" | null;
  generationError: string | null;
}

export interface AdminListeningGroup {
  setId: string; positions: number[]; leaderItemId: string; leaderItemVersion: number;
  itemType: string; dialogueTurns: TranscriptTurn[]; questionPrompts: string[]; repeatCount: number;
  audioAssetId: string | null; audioStorageUrl: string | null;
  audioStatus: "ready" | "legacy" | "missing" | "partial"; targets: AdminListeningTarget[];
  narrationVersion: "dialogue_v1" | "exam_track_v2" | "exam_track_v3" | "exam_track_v4" | null;
  appliedScript: AdminNarrationScript | null; generationScript: AdminNarrationScript | null;
  generationJobId: string | null; generationStatus: TtsGenerationStatus | null;
  generationTtsStyle: TtsStyle | null; lastError: string | null; ttsStyle: TtsStyle | null;
}

export type AdminNarrationSegment =
  | { kind: "bell" }
  | { kind: "speech"; role: "instruction" | "reread" | "question_number"; speaker: "여자"; text: string }
  | { kind: "dialogue"; repeatIndex: 1 | 2; turns: TranscriptTurn[] }
  | { kind: "silence"; durationMs: number };

export interface AdminNarrationScript {
  version: "exam_track_v2" | "exam_track_v3" | "exam_track_v4"; kind: "single" | "common"; positions: number[];
  segments: AdminNarrationSegment[];
}

export type TtsGenerationStatus = "queued" | "processing" | "succeeded" | "failed";

export interface TtsJob {
  jobId: string; itemId: string; itemVersion: number; status: TtsGenerationStatus;
  attempts: number; errorMessage: string | null; audioAssetId: string | null; createdAt: string; completedAt: string | null;
}

export type AdminListeningSetBlockReason = "SET_NOT_REVIEWED" | "SET_NOT_PUBLISHED" | "ITEM_COUNT_INVALID" | "ITEMS_INVALID";

export interface AdminListeningSet {
  setId: string; setSequence: number; createdAt: string;
  reviewStatus: string; publishedAt: string | null; itemCount: number; validItemCount: number;
  audioReady: number; visualRequired: number; visualReady: number;
  mockTestId: string | null; slug: string | null; titleKo: string | null;
  mockTestPublished: boolean | null; round: number | null;
  readyToRegister: boolean; readyToPublish: boolean; blockingReasons: AdminListeningSetBlockReason[];
}

export interface TtsStyle { speakingRate: number; stylePrompt: string }

export interface AdminReadingItem {
  setId: string; position: number; mockTestTitle: string | null;
  itemId: string; itemVersion: number; itemType: string; targetLevel: number;
  predictedDifficulty: number; reviewStatus: string; stem: string; choices: string[];
  correctAnswer: number | null; explanation: string; contentJson: Record<string, unknown>;
  visualOptions: AdminVisualPromptOption[];
  materialVisual: AdminReadingMaterialVisual | null;
}

export interface AdminReadingMaterialVisual {
  description: string;
  imagePrompt: string;
  sourceText: string;
  visualAssetId: string | null;
  imageUrl: string | null;
  generationStatus: "queued" | "processing" | "succeeded" | "failed" | null;
  generationError: string | null;
}

export type AdminReadingSetBlockReason = "SET_NOT_REVIEWED" | "SET_NOT_PUBLISHED" | "ITEM_COUNT_INVALID" | "ITEMS_INVALID" | "VISUALS_INCOMPLETE";

export interface AdminReadingSet {
  setId: string; setSequence: number; createdAt: string;
  reviewStatus: string; publishedAt: string | null; itemCount: number; validItemCount: number;
  visualRequired: number; visualReady: number;
  mockTestId: string | null; slug: string | null; titleKo: string | null;
  mockTestPublished: boolean | null; round: number | null; readyToPublish: boolean;
  blockingReasons: AdminReadingSetBlockReason[];
}

export interface AdminResponseSession {
  sessionId: string; userId: string; mockTestTitle: string; mode: ExamMode; status: "submitted" | "abandoned";
  startedAt: string; submittedAt: string | null; abandonedAt: string | null; score: number | null; maxScore: number; rating: number | null;
  resultEmail: string | null;
  section: "reading" | "listening"; responseCount: number; answeredCount: number;
  unansweredCount: number; correctCount: number; incorrectCount: number;
}

export interface AdminQuestionRevision {
  position: number; itemId: string; itemVersion: number; stem: string; choices: string[];
  correctAnswer: number; explanation: string; contentJson: Record<string, unknown>;
}

export interface AdminQuestionVersion {
  itemId: string; itemVersion: number; itemType: string; targetLevel: number;
  predictedDifficulty: number; reviewStatus: string; stem: string; choices: string[];
  correctAnswer: number | null; explanation: string; contentJson: Record<string, unknown>;
  createdAt: string; isCurrent: boolean;
}

export interface AdminResponseObservation {
  observationId: string; userId: string; sessionId: string; itemId: string; itemVersion: number;
  itemOrder: number; section: "reading" | "listening"; testPosition: number; mockTestTitle: string; itemType: string;
  selectedOption: number | null; correctAnswer: number; isCorrect: boolean; responseTimeMs: number; skipped: boolean;
  timedOut: boolean; answerChanged: boolean; policyVersion: string; createdAt: string;
  mode: ExamMode; score: number | null; rating: number | null;
  question: Question; explanation: string;
}

export type AdminExportDataset = "questions" | "responses" | "sessions";
export type AdminExportStatus = "submitted" | "abandoned" | "all";
export type AdminExportOutcome = "all" | "answered" | "correct" | "incorrect" | "unanswered";

export interface AdminExportFilters {
  mockTestId?: string;
  section?: "reading" | "listening";
  mode?: ExamMode;
  status: AdminExportStatus;
  from?: string;
  to?: string;
  itemType?: string;
  minAssignedCount: number;
  outcome: AdminExportOutcome;
  rating: "all" | "none" | "1" | "2" | "3" | "4" | "5";
  resultEmail: "all" | "accepted" | "not_accepted";
}

export interface AdminExportOptions {
  mockTests: Array<{
    mockTestId: string;
    slug: string;
    titleKo: string;
    titleEn: string;
    isPublished: boolean;
  }>;
  itemTypes: string[];
}

export interface AdminExportPreview {
  rowCount: number;
  sessionCount: number;
  filters: AdminExportFilters;
  generatedAt: string;
}
