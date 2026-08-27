import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { groupExamsByRound } from "../../examRounds";
import { useI18n } from "../../i18n";
import type { Exam, ExamMode } from "../../types";
import { ErrorState } from "../States";

type SupportedSection = Extract<Exam["section"], "reading" | "listening">;

const sectionOrder: SupportedSection[] = ["reading", "listening"];

export function ExamCatalog({ exams, mode, loading, error, starting, onRetry, onModeChange, onStart }: {
  exams: Exam[];
  mode: ExamMode;
  loading: boolean;
  error: string | null;
  starting: string | null;
  onRetry: () => void;
  onModeChange: (mode: ExamMode) => void;
  onStart: (exam: Exam) => void;
}) {
  const { locale, t } = useI18n();
  const [roundKey, setRoundKey] = useState("");
  const [section, setSection] = useState<SupportedSection>("reading");
  const examRounds = groupExamsByRound(exams.filter((exam) => exam.section === "reading" || exam.section === "listening"));
  const selectedRound = examRounds.find((group) => group.key === roundKey) ?? examRounds[0];
  const availableSections = sectionOrder.filter((value) => selectedRound?.exams.some((exam) => exam.section === value));
  const selectedSection = availableSections.includes(section) ? section : availableSections[0];
  const selectedExam = selectedRound?.exams.find((exam) => exam.section === selectedSection);

  const changeRound = (nextRoundKey: string) => {
    setRoundKey(nextRoundKey);
    const nextRound = examRounds.find((group) => group.key === nextRoundKey);
    if (!nextRound?.exams.some((exam) => exam.section === section)) {
      const nextSection = sectionOrder.find((value) => nextRound?.exams.some((exam) => exam.section === value));
      if (nextSection) setSection(nextSection);
    }
  };

  return (
    <section id="tests" className="bg-gray-100 py-6">
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <div className="max-w-2xl"><h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{t("chooseTest")}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{t("chooseSubtitle")}</p></div>
        {error && !exams.length ? <ErrorState message={error} retry={onRetry} /> : (
          <form
            className="mt-5 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:p-5 lg:flex-nowrap lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedExam) onStart(selectedExam);
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:basis-[calc(50%-0.375rem)] lg:basis-0">
              <span className="text-sm font-medium text-gray-700">{t("roundSelectLabel")}</span>
              <select value={selectedRound?.key ?? ""} onChange={(event) => changeRound(event.target.value)} disabled={loading || !examRounds.length} className="focus-ring min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400">
                {!examRounds.length && <option value="">—</option>}
                {examRounds.map((group) => <option key={group.key} value={group.key}>{group.round === null ? t("otherTests") : locale === "ko" ? `${group.round}${t("round")}` : `${t("round")} ${group.round}`}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:basis-[calc(50%-0.375rem)] lg:basis-0">
              <span className="text-sm font-medium text-gray-700">{t("sectionSelectLabel")}</span>
              <select value={selectedSection ?? ""} onChange={(event) => setSection(event.target.value as SupportedSection)} disabled={loading || !availableSections.length} className="focus-ring min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400">
                {!availableSections.length && <option value="">—</option>}
                {availableSections.map((value) => <option key={value} value={value}>{t(value)}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:basis-[calc(50%-0.375rem)] lg:basis-0">
              <span className="text-sm font-medium text-gray-700">{t("modeSelectLabel")}</span>
              <select value={mode} onChange={(event) => onModeChange(event.target.value as ExamMode)} disabled={loading || !selectedExam} className="focus-ring min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400">
                <option value="timed">{t("timed")}</option>
                <option value="practice">{t("practice")}</option>
              </select>
            </label>
            <button type="submit" disabled={loading || starting !== null || !selectedExam} className="focus-ring flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 sm:min-w-[calc(50%-0.375rem)] sm:flex-1 lg:min-w-fit lg:flex-none">{starting === selectedExam?.id || loading ? t("loading") : t("start")} <ArrowRight className="size-4" /></button>
          </form>
        )}
        {error && exams.length > 0 && <p className="mt-5 text-sm font-medium text-red-600">{error}</p>}
      </div>
    </section>
  );
}
