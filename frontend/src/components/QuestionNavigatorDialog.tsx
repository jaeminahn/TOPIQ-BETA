import { CheckCircle2, Circle, Grid3X3, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { useI18n } from "../i18n";
import type { Question } from "../types";

export function QuestionNavigatorDialog({
  open,
  questions,
  currentOrders,
  returnFocusRef,
  onClose,
  onSelect,
}: {
  open: boolean;
  questions: Question[];
  currentOrders: number[];
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSelect: (itemOrder: number) => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const answered = questions.filter((question) => question.selectedOption !== null).length;
  const currentSet = new Set(currentOrders);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      returnFocusRef.current?.focus();
    };
  }, [onClose, open, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      data-testid="question-dialog-backdrop"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="question-dialog-title" aria-describedby="question-dialog-summary" className="flex max-h-[min(720px,calc(100dvh-24px))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-300 px-4 py-4 sm:px-6">
          <div>
            <h2 id="question-dialog-title" className="flex items-center gap-2 text-lg font-extrabold text-gray-900"><Grid3X3 className="size-5 text-primary" />{t("allQuestions")}</h2>
            <p id="question-dialog-summary" className="mt-1 text-sm font-bold text-gray-500">{t("answered")} {answered} · {t("unanswered")} {questions.length - answered}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("close")} className="focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-gray-500 hover:bg-gray-100"><X className="size-5" /></button>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {questions.map((question) => {
              const current = currentSet.has(question.itemOrder);
              const complete = question.selectedOption !== null;
              return (
                <button
                  key={question.itemOrder}
                  type="button"
                  aria-current={current ? "step" : undefined}
                  aria-label={`${t("question")} ${question.itemOrder}, ${current ? t("currentQuestion") : complete ? t("answered") : t("unanswered")}`}
                  onClick={() => { onSelect(question.itemOrder); onClose(); }}
                  className={`focus-ring grid aspect-square min-h-11 place-items-center rounded-xl border text-sm font-black transition ${current ? "border-primary bg-primary text-white shadow-sm" : complete ? "border-primary-100 bg-primary-50 text-primary" : "border-gray-300 bg-white text-gray-500 hover:border-primary-200 hover:bg-primary-50/50"}`}
                >
                  {question.itemOrder}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-300 bg-gray-50 px-4 py-3 text-xs font-bold text-gray-600 sm:px-6">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-primary" />{t("currentQuestion")}</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" />{t("answered")}</span>
          <span className="flex items-center gap-1.5"><Circle className="size-3.5 text-gray-400" />{t("unanswered")}</span>
          <button type="button" onClick={onClose} className="focus-ring ml-auto min-h-11 rounded-xl border border-gray-300 bg-white px-4 text-sm font-extrabold text-gray-700 hover:bg-gray-100">{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
