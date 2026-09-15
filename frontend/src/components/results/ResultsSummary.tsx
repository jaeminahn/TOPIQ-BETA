import { CheckCircle2, CircleX, Info, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { localizedExamTitle } from "../../examLocalization";
import { useI18n } from "../../i18n";
import { predictTopikGrade } from "../../topikGrade";
import type { Results } from "../../types";

export function ResultsSummary({ results }: { results: Results }) {
  const { locale, t } = useI18n();
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const criteriaRef = useRef<HTMLDivElement>(null);
  const percentage = Math.round((results.score / results.maxScore) * 100);
  const showsPredictedGrade = results.section === "reading" || results.section === "listening";
  const predictedGrade = predictTopikGrade(results.score);
  const predictedGradeLabel = predictedGrade === "below-3"
    ? t("belowTopikGrade3")
    : t(`topikGrade${predictedGrade}`);
  const criteria = [
    t("topikGradeBelow3Criteria"),
    t("topikGrade3Criteria"),
    t("topikGrade4Criteria"),
    t("topikGrade5Criteria"),
    t("topikGrade6Criteria"),
  ];

  useEffect(() => {
    if (!criteriaOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!criteriaRef.current?.contains(event.target as Node)) setCriteriaOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCriteriaOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [criteriaOpen]);

  return (
    <section className="rounded-2xl border border-gray-300 bg-white p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-primary">{localizedExamTitle(results.titleKo, locale, { titleEn: results.titleEn })}</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 sm:text-3xl">{t("resultTitle")}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-600"><span className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-green-700"><CheckCircle2 className="size-4 text-green-500" /> {50 - results.incorrectCount} / 50</span><span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-red-700"><CircleX className="size-4 text-red-500" /> {results.incorrectCount} {t("incorrect")}</span></div>
        </div>
        <div className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><Trophy className="size-6" /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400">{t("score")}</p>
            <p className="text-3xl font-semibold text-gray-900"><span className="text-primary">{results.score}</span><span className="text-lg text-gray-400"> / {results.maxScore}</span></p>
            <p className="text-[11px] font-medium text-gray-500">{percentage}%</p>
            {showsPredictedGrade && (
              <div className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3">
                <p className="text-xs font-semibold text-gray-600">
                  {t("predictedTopikGrade")} <span className="ml-1 rounded-full bg-primary-50 px-2.5 py-1 text-primary-dark">{predictedGradeLabel}</span>
                </p>
                <div
                  ref={criteriaRef}
                  className="relative"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCriteriaOpen(false);
                  }}
                >
                  <button
                    type="button"
                    aria-label={t("topikGradeInfoLabel")}
                    aria-expanded={criteriaOpen}
                    aria-controls="topik-grade-criteria"
                    aria-describedby={criteriaOpen ? "topik-grade-criteria" : undefined}
                    onFocus={() => setCriteriaOpen(true)}
                    onClick={() => setCriteriaOpen(true)}
                    className="focus-ring grid size-8 place-items-center rounded-full text-gray-400 hover:bg-white hover:text-primary"
                  >
                    <Info className="size-4" />
                  </button>
                  {criteriaOpen && (
                    <div id="topik-grade-criteria" role="tooltip" className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-gray-200 bg-white p-4 text-left shadow-xl">
                      <p className="text-sm font-semibold text-gray-900">{t("topikGradeCriteriaTitle")}</p>
                      <ul className="mt-2 space-y-1 text-xs font-medium text-gray-600">
                        {criteria.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                      <p className="mt-3 border-t border-gray-100 pt-3 text-xs leading-5 text-gray-500">{t("topikGradeDisclaimer")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
