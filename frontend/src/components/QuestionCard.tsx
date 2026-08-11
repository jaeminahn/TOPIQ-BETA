import { Check, ChevronDown, ChevronUp, FileText, Quote } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import type { Question } from "../types";
import { getQuestionPresentation, type QuestionPresentation } from "./questionPresentation";

const choiceLabels = ["①", "②", "③", "④"];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function RichQuestionText({ text, highlights }: { text: string; highlights: string[] }) {
  const inlineHighlights = highlights.filter((highlight) => highlight && text.includes(highlight));
  const tokens = ["\\(\\s*\\)"];
  tokens.unshift(...inlineHighlights.sort((a, b) => b.length - a.length).map(escapeRegExp));
  const parts = text.split(new RegExp(`(${tokens.join("|")})`, "g"));

  return parts.map((part, index) => {
    if (inlineHighlights.includes(part)) {
      return (
        <mark
          key={`${part}-${index}`}
          data-testid="inline-highlight"
          className="rounded bg-amber-100 px-1 font-bold text-amber-950 underline decoration-2 decoration-amber-500 underline-offset-4"
        >
          {part}
        </mark>
      );
    }
    if (/^\(\s*\)$/.test(part)) {
      return (
        <span
          key={`blank-${index}`}
          data-testid="blank-marker"
          className="mx-1 inline-flex min-w-16 items-center justify-center rounded-lg border-2 border-dashed border-[#155fcc]/45 bg-blue-50 px-3 py-0.5 font-extrabold text-[#155fcc]"
        >
          ( )
        </span>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

function HighlightFallback({ highlight }: { highlight: string }) {
  if (!highlight) return null;
  return (
    <div data-testid="highlight-fallback" className="mt-3 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-950">
      <Quote className="mt-1 size-4 shrink-0 text-amber-600" />
      <span>{highlight}</span>
    </div>
  );
}

function BodyText({
  presentation,
  highlights,
  showFallback = true,
}: {
  presentation: QuestionPresentation;
  highlights: string[];
  showFallback?: boolean;
}) {
  const { body, layout, auxiliary, groupLabel } = presentation;
  if (!body && !auxiliary) return groupLabel ? <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#155fcc]"><FileText className="size-3.5" />{groupLabel}</div> : null;
  const unmatchedHighlights = highlights.filter((highlight) => highlight && !body.includes(highlight));
  let content: ReactNode;

  if (layout === "headline") {
    content = (
      <div data-testid="headline-body" className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-5 py-6 text-center shadow-sm sm:px-7">
        <p className="question-copy text-lg font-black leading-8 text-slate-900 sm:text-xl">{body}</p>
      </div>
    );
  } else if (layout === "sequence") {
    const rows = body.split(/\n+/).map((row) => row.trim()).filter(Boolean);
    content = (
      <div data-testid="sequence-body" className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        {rows.map((row, index) => (
          <div key={`${row}-${index}`} className="question-copy rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[15px] font-medium text-slate-800 shadow-sm sm:text-base">
            <RichQuestionText text={row} highlights={highlights} />
          </div>
        ))}
      </div>
    );
  } else if (layout === "insertion") {
    content = (
      <div data-testid="insertion-body" className="space-y-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
          <p className="mb-2 text-xs font-black tracking-[0.12em] text-[#155fcc]">주어진 문장</p>
          <p className="question-copy font-bold text-slate-900">{auxiliary}</p>
        </div>
        <div className="question-copy rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-[15px] text-slate-800 sm:p-5 sm:text-base">
          <RichQuestionText text={body} highlights={highlights} />
        </div>
      </div>
    );
  } else if (layout === "material") {
    content = (
      <div data-testid="material-body" className="question-copy rounded-2xl border border-blue-100 bg-[linear-gradient(135deg,#f5f9ff,#fff)] p-4 text-[15px] font-semibold text-slate-800 shadow-sm sm:p-5 sm:text-base">
        <RichQuestionText text={body} highlights={highlights} />
      </div>
    );
  } else if (layout === "inline") {
    content = (
      <div data-testid="inline-body" className="question-copy rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-5 text-center text-lg font-bold leading-8 text-slate-900 sm:px-6 sm:py-6 sm:text-xl">
        <RichQuestionText text={body} highlights={highlights} />
      </div>
    );
  } else {
    content = (
      <div data-testid="passage-body" className="question-copy rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-[15px] text-slate-800 sm:p-5 sm:text-base">
        <RichQuestionText text={body} highlights={highlights} />
      </div>
    );
  }

  return (
    <div>
      {groupLabel && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-[#155fcc]">
          <FileText className="size-3.5" />
          {groupLabel}
        </div>
      )}
      {content}
      {showFallback && unmatchedHighlights.map((highlight) => <HighlightFallback key={highlight} highlight={highlight} />)}
    </div>
  );
}

export type TranscriptMode = "visible" | "collapsible" | "hidden";

function TranscriptBlock({ question, mode }: { question: Question; mode: TranscriptMode }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(mode === "visible");
  if (!question.transcript?.length || mode === "hidden") return null;

  if (mode === "collapsible" && !expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} className="focus-ring mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm font-extrabold text-[#155fcc]">
        {t("showTranscript")}<ChevronDown className="size-4" />
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-black tracking-[.12em] text-[#155fcc]">{t("transcript")}</p>
        {mode === "collapsible" && <button type="button" onClick={() => setExpanded(false)} className="focus-ring flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-[#155fcc]">{t("hideTranscript")}<ChevronUp className="size-4" /></button>}
      </div>
      <div className="space-y-1.5">{question.transcript.map((turn, index) => <p key={index} className="question-copy text-sm text-slate-700"><b className={turn.speaker === "여자" ? "text-rose-600" : "text-blue-700"}>{turn.speaker}</b> {turn.text}</p>)}</div>
    </div>
  );
}

export function SharedQuestionMaterial({
  question,
  highlights,
  transcriptMode = "hidden",
}: {
  question: Question;
  highlights: string[];
  transcriptMode?: TranscriptMode;
}) {
  const presentation = getQuestionPresentation(question);
  return (
    <div data-testid="shared-question-material" className="min-w-0">
      <BodyText presentation={presentation} highlights={highlights} showFallback={false} />
      <TranscriptBlock question={question} mode={transcriptMode} />
    </div>
  );
}

function ChoiceList({
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
  return (
    <div className={`grid content-start gap-2 ${question.visualOptions?.length ? "grid-cols-2" : ""}`} role="radiogroup" aria-label="Answer choices">
      {((question.visualOptions?.length ?? 0) ? question.visualOptions!.map((visual) => ({ choice: "", visual })) : question.choices.map((choice, index) => ({ choice, visual: { number: index + 1, imageUrl: "" } }))).map(({ choice, visual }, index) => {
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
            className={`choice-button focus-ring flex min-h-12 min-w-0 items-start gap-3 overflow-hidden rounded-xl border px-3 py-3 text-left sm:px-4 ${
              correct
                ? "border-emerald-400 bg-emerald-50"
                : selected
                  ? "border-[#155fcc] bg-blue-50 shadow-[0_0_0_1px_#155fcc]"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
            } disabled:cursor-default`}
          >
            <span className={`grid size-7 shrink-0 place-items-center rounded-full border text-sm font-bold ${selected ? "border-[#155fcc] bg-[#155fcc] text-white" : correct ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-500"}`}>
              {correct ? <Check className="size-4" /> : choiceLabels[index]}
            </span>
            {visual.imageUrl ? <span className="mx-auto block min-w-0 w-full max-w-[220px] flex-1 overflow-hidden rounded-xl bg-slate-50"><img src={visual.imageUrl} alt={`선택지 ${option}`} className="mx-auto block h-auto max-h-40 w-full max-w-[220px] object-contain sm:max-h-48" /></span> : <span className="question-copy min-w-0 flex-1 pt-0.5 text-[15px] font-medium text-slate-800 sm:text-base">{choice}</span>}
          </button>
        );
      })}
    </div>
  );
}

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
    <article data-question-variant={variant} className={`rounded-2xl border border-slate-200 bg-white p-4 ${grouped ? "shadow-sm sm:p-5" : "shadow-[0_12px_36px_rgba(31,48,77,0.06)] sm:p-5 lg:p-6"}`}>
      <div className={`${grouped ? "mb-3 pb-3" : "mb-4 pb-4"} flex items-start gap-3 border-b border-slate-100`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#155fcc] text-xs font-extrabold text-white">
          {question.testPosition}
        </span>
        <h1 className="question-copy pt-0.5 text-base font-extrabold text-slate-900 sm:text-lg">
          {presentation.instruction}
        </h1>
      </div>

      <div
        data-testid="question-layout"
        data-question-layout={presentation.layout}
        data-two-column={presentation.twoColumn}
        className={!grouped && presentation.twoColumn ? "grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(280px,.88fr)] lg:items-start" : "space-y-4"}
      >
        {!grouped && <div><BodyText presentation={presentation} highlights={[question.highlightText]} /><TranscriptBlock question={question} mode={transcriptMode} /></div>}
        {grouped && unmatchedHighlight && <HighlightFallback highlight={unmatchedHighlight} />}
        <ChoiceList
          question={question}
          onAnswer={onAnswer}
          disabled={disabled}
          correctAnswer={showResult?.correctAnswer}
        />
      </div>
    </article>
  );
}
