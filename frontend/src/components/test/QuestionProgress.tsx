import { Save } from "lucide-react";
import { useI18n } from "../../i18n";

export function QuestionProgress({ firstOrder, lastOrder, total, answered }: { firstOrder: number; lastOrder: number; total: number; answered: number }) {
  const { t } = useI18n();
  const orderLabel = firstOrder === lastOrder ? firstOrder : `${firstOrder}~${lastOrder}`;
  return (
    <div className="mb-3 flex items-center justify-between px-1 text-xs font-semibold text-gray-500 sm:text-sm">
      <span>{t("question")} {orderLabel} / {total}</span>
      <span className="flex items-center gap-2"><Save className="size-4 text-green-500" /> {t("answered")} {answered}</span>
    </div>
  );
}
