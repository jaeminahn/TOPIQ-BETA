import { ArrowDown, Clock3 } from "lucide-react";
import { useI18n } from "../../i18n";

export function LandingHero() {
  const { t } = useI18n();
  return (
    <section className="topiq-stage">
      <div className="topiq-page-enter mx-auto grid min-h-[520px] max-w-5xl items-center gap-10 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
        <div>
          <p className="topiq-eyebrow mb-4 text-xs font-bold text-primary">UNIGATE TOPIQ · BETA</p>
          <h1 className="max-w-3xl whitespace-pre-line text-[34px] font-semibold leading-[1.12] tracking-[-.045em] text-gray-900 sm:text-5xl lg:text-[56px]">{t("heroTitle")}</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-gray-600 sm:text-lg">{t("heroBody")}</p>
          <button type="button" onClick={() => document.getElementById("tests")?.scrollIntoView({ behavior: "smooth" })} className="focus-ring topiq-action mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">{t("chooseTest")} <ArrowDown className="size-4" /></button>
        </div>
        <div className="mx-auto hidden w-full max-w-md lg:block" aria-hidden="true">
          <div className="topiq-demo-card rounded-[20px] border border-primary-100 bg-white/90 p-6">
            <div className="flex items-center justify-between"><span className="text-xs font-bold tracking-[.14em] text-primary">READING</span><span className="size-2 rounded-full bg-primary" /></div>
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
