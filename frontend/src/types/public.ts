export type ExamMode = "timed" | "practice";

export interface Exam {
  id: string;
  slug: string;
  titleEn?: string;
  titleKo: string;
  descriptionEn?: string;
  descriptionKo: string;
  durationSeconds: number;
  questionCount: number;
  maxScore: number;
  section: "reading" | "listening" | "writing";
}

export interface VisualOption { number: number; imageUrl: string }
export interface MaterialVisual { imageUrl: string; description: string }
export interface TranscriptTurn { speaker: string; text: string }

export interface Question {
  itemOrder: number;
  section: string;
  testPosition: number;
  itemId: string;
  itemVersion: number;
  itemType: string;
  stem: string;
  passage: string;
  auxiliaryText: string;
  questionPrompt: string;
  highlightText: string;
  choices: string[];
  visualOptions?: VisualOption[];
  materialVisual?: MaterialVisual | null;
  audioAssetId?: string | null;
  repeatCount?: number;
  transcript?: TranscriptTurn[];
  selectedOption: number | null;
}

export interface TestSession {
  sessionId: string;
  userId: string;
  mode: ExamMode;
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  resultsUnlocked: boolean;
  serverTime: string;
  exam: { id?: string; slug: string; titleEn?: string; titleKo: string };
  questions: Question[];
}

export interface IncorrectQuestion extends Question {
  correctAnswer: number;
  explanation: string;
}

export interface Results {
  examId: string;
  sessionId: string;
  titleKo: string;
  titleEn?: string;
  score: number;
  maxScore: number;
  submittedAt: string | null;
  incorrectCount: number;
  incorrect: IncorrectQuestion[];
}
