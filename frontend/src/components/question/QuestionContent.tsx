import { ChevronDown, ChevronUp, FileText, Quote } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "../../i18n";
import type { Question } from "../../types";
import { getQuestionPresentation, type QuestionPresentation } from "../questionPresentation";

export type TranscriptMode = "visible" | "collapsible" | "hidden";

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
      return <mark key={`${part}-${index}`} data-testid="inline-highlight" className="rounded bg-primary-50 px-1 font-semibold text-primary-dark">{part}</mark>;
    }
    if (/^\(\s*\)$/.test(part)) {
      return (
        <span key={`blank-${index}`} data-testid="blank-marker" className="mx-1 inline-flex min-w-16 items-center justify-center rounded-lg border-2 border-dashed border-gray-400 bg-gray-50 px-3 py-0.5 font-medium text-gray-700">
          ( )
        </span>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

export function HighlightFallback({ highlight }: { highlight: string }) {
  if (!highlight) return null;
  return (
    <div data-testid="highlight-fallback" className="mt-3 flex gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-medium leading-6 text-gray-700">
      <Quote className="mt-1 size-4 shrink-0 text-gray-500" />
      <span>{highlight}</span>
    </div>
  );
}

export function QuestionBody({
  presentation,
  highlights,
  showFallback = true,
}: {
  presentation: QuestionPresentation;
  highlights: string[];
  showFallback?: boolean;
}) {
  const { body, layout, auxiliary, groupLabel } = presentation;
  if (!body && !auxiliary) {
    return groupLabel ? <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700"><FileText className="size-3.5" />{groupLabel}</div> : null;
  }
  const unmatchedHighlights = highlights.filter((highlight) => highlight && !body.includes(highlight));
  let content: ReactNode;

  if (layout === "headline") {
    content = <div data-testid="headline-body" className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-6 text-center sm:px-7"><p className="question-copy text-lg font-semibold leading-8 text-gray-900 sm:text-xl">{body}</p></div>;
  } else if (layout === "sequence") {
    const rows = body.split(/\n+/).map((row) => row.trim()).filter(Boolean);
    content = (
      <div data-testid="sequence-body" className="space-y-2 rounded-2xl border border-gray-300 bg-gray-50 p-3 sm:p-4">
        {rows.map((row, index) => <div key={`${row}-${index}`} className="question-copy rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-[15px] font-medium text-gray-800 sm:text-base"><RichQuestionText text={row} highlights={highlights} /></div>)}
      </div>
    );
  } else if (layout === "insertion") {
    content = (
      <div data-testid="insertion-body" className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5"><p className="mb-2 text-xs font-semibold tracking-[0.12em] text-gray-700">주어진 문장</p><p className="question-copy font-medium text-gray-900">{auxiliary}</p></div>
        <div className="question-copy rounded-2xl border border-gray-300 bg-gray-50 p-4 text-[15px] text-gray-800 sm:p-5 sm:text-base"><RichQuestionText text={body} highlights={highlights} /></div>
      </div>
    );
  } else if (layout === "material") {
    content = <div data-testid="material-body" className="question-copy rounded-2xl border border-gray-200 bg-gray-50 p-4 text-[15px] font-medium text-gray-800 sm:p-5 sm:text-base"><RichQuestionText text={body} highlights={highlights} /></div>;
  } else if (layout === "inline") {
    content = <div data-testid="inline-body" className="question-copy rounded-2xl border border-gray-300 bg-gray-50 px-5 py-5 text-center text-lg font-semibold leading-8 text-gray-900 sm:px-6 sm:py-6 sm:text-xl"><RichQuestionText text={body} highlights={highlights} /></div>;
  } else {
    content = <div data-testid="passage-body" className="question-copy rounded-2xl border border-gray-300 bg-gray-50 p-4 text-[15px] text-gray-800 sm:p-5 sm:text-base"><RichQuestionText text={body} highlights={highlights} /></div>;
  }

  return (
    <div>
      {groupLabel && <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700"><FileText className="size-3.5" />{groupLabel}</div>}
      {content}
      {showFallback && unmatchedHighlights.map((highlight) => <HighlightFallback key={highlight} highlight={highlight} />)}
    </div>
  );
}

export function TranscriptBlock({ question, mode }: { question: Question; mode: TranscriptMode }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(mode === "visible");
  if (!question.transcript?.length || mode === "hidden") return null;

  if (mode === "collapsible" && !expanded) {
    return <button type="button" onClick={() => setExpanded(true)} className="focus-ring mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100">{t("showTranscript")}<ChevronDown className="size-4" /></button>;
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[.12em] text-gray-700">{t("transcript")}</p>
        {mode === "collapsible" && <button type="button" onClick={() => setExpanded(false)} className="focus-ring flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">{t("hideTranscript")}<ChevronUp className="size-4" /></button>}
      </div>
      <div className="space-y-1.5">{question.transcript.map((turn, index) => <p key={index} className="question-copy text-sm text-gray-700"><b className="text-gray-700">{turn.speaker}</b> {turn.text}</p>)}</div>
    </div>
  );
}

export function SharedQuestionMaterial({ question, highlights, transcriptMode = "hidden" }: { question: Question; highlights: string[]; transcriptMode?: TranscriptMode }) {
  const presentation = getQuestionPresentation(question);
  return (
    <div data-testid="shared-question-material" className="min-w-0">
      <QuestionBody presentation={presentation} highlights={highlights} showFallback={false} />
      <TranscriptBlock question={question} mode={transcriptMode} />
    </div>
  );
}
