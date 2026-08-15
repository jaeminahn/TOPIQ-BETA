import { ArrowLeft, ArrowRight, CheckCircle2, Grid3X3 } from "lucide-react";
import type { RefObject } from "react";
import { useI18n } from "../../i18n";

export function TestNavigation({ firstOrder, lastOrder, total, navigatorButtonRef, onPrevious, onOpenNavigator, onNext, onReview }: {
  firstOrder: number;
  lastOrder: number;
  total: number;
  navigatorButtonRef: RefObject<HTMLButtonElement | null>;
  onPrevious: () => void;
  onOpenNavigator: () => void;
  onNext: () => void;
  onReview: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-500/30 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-8">
        <button disabled={firstOrder === 1} onClick={onPrevious} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-35 sm:px-4"><ArrowLeft className="size-4" /> <span className="hidden sm:inline">{t("previous")}</span></button>
        <button ref={navigatorButtonRef} type="button" onClick={onOpenNavigator} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-primary-100 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary-100 sm:px-5"><Grid3X3 className="size-4" />{t("allQuestions")}</button>
        {lastOrder < total
          ? <button onClick={onNext} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">{t("next")} <ArrowRight className="size-4" /></button>
          : <button onClick={onReview} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"><CheckCircle2 className="size-4" /> {t("review")}</button>}
      </div>
    </div>
  );
}
