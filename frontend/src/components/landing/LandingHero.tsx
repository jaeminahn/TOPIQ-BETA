import { Clock3 } from "lucide-react";
import { useI18n } from "../../i18n";

export function LandingHero() {
  const { t } = useI18n();
  return (
    <section className="bg-gray-50">
      <div className="mx-auto grid max-w-5xl items-center gap-6 px-4 pb-8 pt-6 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
        <div>
          <h1 className="max-w-3xl whitespace-pre-line text-[28px] font-semibold leading-[1.2] tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">{t("heroTitle")}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">{t("heroBody")}</p>
        </div>
        <div className="mx-auto hidden w-full max-w-md lg:block">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mt-4 border-y border-gray-100 py-4">
              <p className="text-xs font-medium text-gray-400">QUESTION 25</p>
              <p className="mt-2 text-base font-semibold leading-6 text-gray-900">{t("demoInstruction")}</p>
              <div className="mt-3 space-y-2">{["①", "②", "③", "④"].map((number, index) => <div key={number} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium ${index === 1 ? "border-primary bg-primary-50 text-primary" : "border-gray-300 text-gray-500"}`}><span>{number}</span><span className="h-2 rounded-full bg-current opacity-25" style={{ width: `${54 + index * 8}%` }} /></div>)}</div>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs font-medium"><span className="text-gray-500">24 / 50</span><span className="flex items-center gap-2 text-primary"><Clock3 className="size-4" /> 38:24</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
