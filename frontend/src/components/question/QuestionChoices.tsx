import { Check } from "lucide-react";
import type { Question } from "../../types";

const choiceLabels = ["①", "②", "③", "④"];

export function QuestionChoices({
  question,
  onAnswer,
  disabled,
  correctAnswer,
}: {
  question: Question;
  onAnswer?: (option: number) => void;
  disabled: boolean;
  correctAnswer?: number;
}) {
  const choices = question.visualOptions?.length
    ? question.visualOptions.map((visual) => ({ choice: "", visual }))
    : question.choices.map((choice, index) => ({ choice, visual: { number: index + 1, imageUrl: "" } }));

  return (
    <div className={`grid content-start gap-2 ${question.visualOptions?.length ? "grid-cols-2" : ""}`} role="radiogroup" aria-label="Answer choices">
      {choices.map(({ choice, visual }, index) => {
        const option = visual.number || index + 1;
        const selected = question.selectedOption === option;
        const correct = correctAnswer === option;
        return (
          <button
            key={`${option}-${choice || visual.imageUrl}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onAnswer?.(option)}
            className={`choice-button focus-ring flex min-h-12 min-w-0 items-start gap-3 overflow-hidden rounded-xl border px-3 py-3 text-left sm:px-4 ${correct ? "border-green-500 bg-green-50" : selected ? "border-primary bg-primary-50" : "border-gray-300 bg-white hover:border-primary-200 hover:bg-primary-50/40"} disabled:cursor-default`}
          >
            <span className={`grid size-7 shrink-0 place-items-center rounded-full border text-sm font-semibold ${selected ? "border-primary bg-primary text-white" : correct ? "border-green-500 bg-green-500 text-white" : "border-gray-300 text-gray-500"}`}>
              {correct ? <Check className="size-4" /> : choiceLabels[index]}
            </span>
            {visual.imageUrl
              ? <span className="mx-auto block min-w-0 w-full max-w-[220px] flex-1 overflow-hidden rounded-xl bg-gray-50"><img src={visual.imageUrl} alt={`선택지 ${option}`} className="mx-auto block h-auto max-h-40 w-full max-w-[220px] object-contain sm:max-h-48" /></span>
              : <span className="question-copy min-w-0 flex-1 pt-0.5 text-[15px] font-medium text-gray-800 sm:text-base">{choice}</span>}
          </button>
        );
      })}
    </div>
  );
}
