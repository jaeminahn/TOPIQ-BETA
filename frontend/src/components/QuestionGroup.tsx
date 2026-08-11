import type { Question } from "../types";
import { QuestionCard, SharedQuestionMaterial, type TranscriptMode } from "./QuestionCard";

export function QuestionGroup({
  questions,
  onAnswer,
  onActivate,
  transcriptMode,
}: {
  questions: Question[];
  onAnswer: (itemOrder: number, option: number) => void;
  onActivate?: (itemOrder: number) => void;
  transcriptMode: TranscriptMode;
}) {
  const first = questions[0];
  if (!first) return null;

  const passageQuestion = questions.find((question) => question.passage.trim()) ?? first;
  const transcriptQuestion = questions.find((question) => question.transcript?.length) ?? passageQuestion;
  const sharedQuestion: Question = {
    ...passageQuestion,
    transcript: transcriptQuestion.transcript,
  };
  const sharedText = sharedQuestion.passage;
  const highlights = [...new Set(questions.map((question) => question.highlightText.trim()).filter(Boolean))];
  const isReading = first.section === "reading";

  return (
    <section
      data-testid="question-group"
      className={isReading ? "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)] lg:items-start" : "min-w-0 space-y-3"}
    >
      <div className={isReading ? "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-16" : "min-w-0 px-1 py-0.5"}>
        <SharedQuestionMaterial question={sharedQuestion} highlights={highlights} transcriptMode={transcriptMode} />
      </div>
      <div className="min-w-0 space-y-3">
        {questions.map((question) => (
          <div
            key={question.itemOrder}
            onFocus={() => onActivate?.(question.itemOrder)}
            onPointerDown={() => onActivate?.(question.itemOrder)}
          >
            <QuestionCard
              question={question}
              variant="group-item"
              sharedText={sharedText}
              transcriptMode="hidden"
              onAnswer={(option) => onAnswer(question.itemOrder, option)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
