import type { Question } from "../types";
import { HighlightFallback, QuestionBody, SharedQuestionMaterial, TranscriptBlock, type TranscriptMode } from "./question/QuestionContent";
import { QuestionChoices } from "./question/QuestionChoices";
import { getQuestionPresentation } from "./questionPresentation";

export { SharedQuestionMaterial };
export type { TranscriptMode };

export function QuestionCard({
  question,
  onAnswer,
  disabled = false,
  showResult,
  variant = "standalone",
  sharedText = "",
  transcriptMode = "visible",
}: {
  question: Question;
  onAnswer?: (option: number) => void;
  disabled?: boolean;
  showResult?: { correctAnswer: number };
  variant?: "standalone" | "group-item";
  sharedText?: string;
  transcriptMode?: TranscriptMode;
}) {
  const presentation = getQuestionPresentation(question);
  const grouped = variant === "group-item";
  const unmatchedHighlight = grouped && question.highlightText && !sharedText.includes(question.highlightText) ? question.highlightText : "";

  return (
    <article data-question-variant={variant} className="rounded-2xl border border-gray-300 bg-white p-6">
      <div className={`${grouped ? "mb-3 pb-3" : "mb-4 pb-4"} flex items-start gap-3 border-b border-gray-100`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-white">{question.testPosition}</span>
        <h1 className="pt-0.5 text-base font-semibold text-gray-900 sm:text-lg">{presentation.instruction}</h1>
      </div>

      <div
        data-testid="question-layout"
        data-question-layout={presentation.layout}
        data-two-column={presentation.twoColumn}
        className={!grouped && presentation.twoColumn ? "grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(280px,.88fr)] lg:items-start" : "space-y-4"}
      >
        {!grouped && <div><QuestionBody presentation={presentation} highlights={[question.highlightText]} materialVisual={question.materialVisual} /><TranscriptBlock question={question} mode={transcriptMode} /></div>}
        {grouped && unmatchedHighlight && <HighlightFallback highlight={unmatchedHighlight} />}
        <QuestionChoices question={question} onAnswer={onAnswer} disabled={disabled} correctAnswer={showResult?.correctAnswer} />
      </div>
    </article>
  );
}
