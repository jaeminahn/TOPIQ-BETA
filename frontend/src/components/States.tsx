import { AlertCircle, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[42vh] flex-col items-center justify-center gap-3 text-slate-500">
      <LoaderCircle className="size-7 animate-spin text-[#155fcc]" />
      <p className="text-sm font-semibold">{t("loading")}</p>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-[42vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-red-50 text-red-600">
        <AlertCircle className="size-6" />
      </span>
      <p className="text-lg font-bold text-slate-900">{message}</p>
      <div className="mt-5 flex gap-2">
        {retry && <button onClick={retry} className="min-h-11 rounded-xl bg-[#155fcc] px-5 py-2.5 text-sm font-bold text-white">{t("retry")}</button>}
        <Link to="/" className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700">{t("home")}</Link>
      </div>
    </div>
  );
}
