import { ArrowRight, BookOpen, Clock3, Headphones, RotateCcw } from "lucide-react";
import { getSessionToken } from "../../api";
import type { CompletedExamResult } from "../../completedResults";
import { localizedExamTitle } from "../../examLocalization";
import { groupExamsByRound } from "../../examRounds";
import { useI18n } from "../../i18n";
import type { Exam, ExamMode } from "../../types";
import { ErrorState, LoadingState } from "../States";

export function ExamCatalog({ exams, modes, completedResults, loading, error, starting, onRetry, onModeChange, onStart, onViewResults }: {
  exams: Exam[];
  modes: Record<string, ExamMode>;
  completedResults: Record<string, CompletedExamResult>;
  loading: boolean;
  error: string | null;
  starting: string | null;
  onRetry: () => void;
  onModeChange: (examId: string, mode: ExamMode) => void;
  onStart: (exam: Exam) => void;
  onViewResults: (sessionId: string) => void;
}) {
  const { locale, t } = useI18n();
  const examRounds = groupExamsByRound(exams);

  return (
    <section id="tests" className="bg-gray-100 py-6">
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <div className="max-w-2xl"><h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{t("chooseTest")}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{t("chooseSubtitle")}</p></div>
        {loading ? <LoadingState /> : error && !exams.length ? <ErrorState message={error} retry={onRetry} /> : (
          <div className="mt-4 space-y-4">{examRounds.map((group) => {
            const roundLabel = group.round === null ? t("otherTests") : locale === "ko" ? `${group.round}${t("round")}` : `${t("round")} ${group.round}`;
            return (
              <section key={group.key} data-testid="exam-round" data-round={group.round ?? "other"} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2"><h3 className="inline-block rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700">{roundLabel}</h3></div>
                <div className="grid gap-3 lg:grid-cols-2">{group.exams.map((exam) => {
                  const mode = modes[exam.id] ?? "timed";
                  const completed = completedResults[exam.id];
                  const hasResult = Boolean(completed && getSessionToken(completed.sessionId));
                  return (
                    <article key={exam.id} className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start gap-4"><span className="grid size-10 place-items-center rounded-lg bg-primary text-white">{exam.section === "listening" ? <Headphones className="size-5" /> : <BookOpen className="size-5" />}</span></div>
                      <h4 className="mt-3 text-lg font-semibold text-gray-900">{localizedExamTitle(exam.titleKo, locale, { slug: exam.slug, section: exam.section, titleEn: exam.titleEn })}</h4>
                      {hasResult && completed && <button type="button" onClick={() => onViewResults(completed.sessionId)} className="focus-ring mt-3 flex min-h-11 items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-left text-green-900 hover:bg-green-100"><span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-green-700">{t("recentScore")}</span><strong className="text-lg font-semibold">{completed.score} <span className="text-sm font-medium text-green-700">/ {completed.maxScore}</span></strong></span><span className="flex items-center gap-1 text-xs font-medium text-green-700">{t("viewResults")}<ArrowRight className="size-3.5" /></span></button>}
                      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Exam mode">{(["timed", "practice"] as ExamMode[]).map((value) => <button key={value} onClick={() => onModeChange(exam.id, value)} className={`focus-ring min-h-[60px] rounded-lg border p-2.5 text-left ${mode === value ? "border-primary bg-primary-50" : "border-gray-300 hover:border-primary-200"}`} aria-pressed={mode === value}><span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">{value === "timed" ? <Clock3 className="size-4 text-primary" /> : <RotateCcw className="size-4 text-primary" />}{t(value)}</span><span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-gray-500">{value === "timed" ? `${Math.round(exam.durationSeconds / 60)} ${t("minutes")} · ${t("autoSubmit")}` : t("practiceDesc")}</span></button>)}</div>
                      <button disabled={starting !== null} onClick={() => onStart(exam)} className="focus-ring mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{starting === exam.id ? t("loading") : t("start")} <ArrowRight className="size-4" /></button>
                    </article>
                  );
                })}</div>
              </section>
            );
          })}</div>
        )}
        {error && exams.length > 0 && <p className="mt-5 text-sm font-medium text-red-600">{error}</p>}
      </div>
    </section>
  );
}
