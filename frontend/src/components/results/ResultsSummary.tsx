import { CheckCircle2, CircleX, Trophy } from "lucide-react";
import { localizedExamTitle } from "../../examLocalization";
import { useI18n } from "../../i18n";
import type { Results } from "../../types";

export function ResultsSummary({ results }: { results: Results }) {
  const { locale, t } = useI18n();
  const percentage = Math.round((results.score / results.maxScore) * 100);
  return (
    <section className="rounded-2xl border border-gray-300 bg-white p-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-primary">{localizedExamTitle(results.titleKo, locale, { titleEn: results.titleEn })}</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 sm:text-3xl">{t("resultTitle")}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-600"><span className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-green-700"><CheckCircle2 className="size-4 text-green-500" /> {50 - results.incorrectCount} / 50</span><span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-red-700"><CircleX className="size-4 text-red-500" /> {results.incorrectCount} {t("incorrect")}</span></div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4"><span className="grid size-11 place-items-center rounded-xl bg-primary-50 text-primary"><Trophy className="size-6" /></span><div><p className="text-[11px] font-semibold text-gray-400">{t("score")}</p><p className="text-3xl font-semibold text-gray-900"><span className="text-primary">{results.score}</span><span className="text-lg text-gray-400"> / {results.maxScore}</span></p><p className="text-[11px] font-medium text-gray-500">{percentage}%</p></div></div>
      </div>
    </section>
  );
}
