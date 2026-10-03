import { useI18n } from "../../i18n";
import { Reveal } from "../Reveal";

export function FullVersionSection({ onPreregister }: { onPreregister: () => void }) {
  const { t } = useI18n();
  return (
    <section id="full-version" className="topiq-product-overview scroll-mt-16 py-16 sm:py-24" aria-labelledby="full-version-title">
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <Reveal className="grid items-end gap-8 text-center lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:text-left">
          <div>
            <img src="/logo.png" alt="TOPIQ" className="mx-auto mb-6 h-8 w-auto sm:h-9 lg:mx-0" />
            <h2 id="full-version-title" className="whitespace-pre-line text-balance text-3xl font-semibold leading-[1.18] tracking-[-.04em] text-gray-900 sm:text-5xl">{t("fullVersionTitle")}</h2>
          </div>
          <p className="mx-auto max-w-xl text-pretty text-sm leading-7 text-gray-600 sm:text-base lg:mx-0">{t("fullVersionBody")}</p>
        </Reveal>
        <Reveal className="mt-12 lg:mt-16" delay={100} distance={18}>
          <div className="topiq-engine-flow">
            <article className="topiq-engine-step">
              <h3 className="text-xl font-semibold tracking-[-.025em] text-gray-900 sm:text-2xl">{t("fullVersionGenerationTitle")}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{t("fullVersionGenerationBody")}</p>
            </article>
            <article className="topiq-engine-step topiq-engine-step-adaptive">
              <h3 className="text-xl font-semibold tracking-[-.025em] text-gray-900 sm:text-2xl">{t("fullVersionAdaptiveTitle")}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600">{t("fullVersionAdaptiveBody")}</p>
            </article>
          </div>
        </Reveal>
        <Reveal className="mt-8 flex justify-center" delay={170} distance={14}>
          <button type="button" onClick={onPreregister} className="focus-ring min-h-10 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark">{t("preregistrationTitle")}</button>
        </Reveal>
        <Reveal className="mt-5 text-center" delay={220} distance={10}>
          <p className="whitespace-pre-line text-pretty text-xs leading-5 text-gray-500">{t("fullVersionBetaNote")}</p>
        </Reveal>
      </div>
    </section>
  );
}
