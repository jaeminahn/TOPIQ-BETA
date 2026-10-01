import { BriefcaseBusiness, Check, ExternalLink, GraduationCap, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import { Reveal } from "../Reveal";

export function TopikGuide() {
  const { t } = useI18n();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const uses = [
    { icon: GraduationCap, title: t("topikUseStudyTitle"), body: t("topikUseStudyBody") },
    { icon: BriefcaseBusiness, title: t("topikUseWorkTitle"), body: t("topikUseWorkBody") },
    { icon: ShieldCheck, title: t("topikUseVisaTitle"), body: t("topikUseVisaBody") },
  ];
  const faqs = [
    [t("topikFaqWhoQuestion"), t("topikFaqWhoAnswer")],
    [t("topikFaqLevelQuestion"), t("topikFaqLevelAnswer")],
    [t("topikFaqValidityQuestion"), t("topikFaqValidityAnswer")],
    [t("topikFaqUseQuestion"), t("topikFaqUseAnswer")],
    [t("topikFaqMockQuestion"), t("topikFaqMockAnswer")],
  ];

  return (
    <div>
      <section id="topik-guide" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-16 sm:px-8 sm:py-24" aria-labelledby="topik-guide-title">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <h2 id="topik-guide-title" className="text-3xl font-semibold tracking-[-.04em] text-gray-900 sm:text-4xl">{t("topikGuideTitle")}</h2>
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-5" aria-label="TOPIK 주관 기관">
              <img src="/moe-logo.svg" alt="대한민국 교육부" className="h-9 w-auto max-w-[150px] object-contain" />
              <span className="hidden h-7 w-px bg-gray-300 sm:block" aria-hidden="true" />
              <img src="/niied-logo.png" alt="국립국제교육원" className="h-11 w-auto max-w-[180px] object-contain" />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <ul className="divide-y divide-gray-200 border-y border-gray-200">
              {[t("topikFactAudience"), t("topikFactLevels"), t("topikFactValidity"), t("topikFactOrganizer")].map((fact) => (
                <li key={fact} className="topiq-list-item flex gap-3 py-4 text-sm font-medium leading-6 text-gray-700">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />{fact}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <a href="https://www.topik.go.kr/" target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary transition-colors duration-150 hover:text-primary-700 hover:underline underline-offset-4">
                {t("topikOfficialLink")} <ExternalLink className="size-3.5" />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="topik-uses" className="scroll-mt-16 py-16 sm:py-24" aria-labelledby="topik-use-title">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <Reveal className="max-w-2xl">
            <h2 id="topik-use-title" className="text-3xl font-semibold tracking-[-.04em] text-gray-900 sm:text-4xl">{t("topikUseTitle")}</h2>
            <p className="mt-4 leading-7 text-gray-600">{t("topikUseBody")}</p>
          </Reveal>
          <Reveal className="mt-9 grid gap-4 md:grid-cols-3 topiq-reveal-stagger" delay={100} distance={18}>
            {uses.map(({ icon: Icon, title, body }) => (
              <article key={title} className="topiq-use-card">
                <span className="topiq-use-card-icon" aria-hidden="true"><Icon /></span>
                <h3 className="relative mt-12 text-lg font-semibold text-gray-900">{title}</h3>
                <p className="relative mt-2 text-sm leading-6 text-gray-600">{body}</p>
              </article>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="topik-faq" className="scroll-mt-16 border-t border-gray-200/80 py-16 sm:py-24" aria-labelledby="topik-faq-title">
        <div className="mx-auto max-w-3xl px-4 sm:px-8">
          <Reveal><h2 id="topik-faq-title" className="text-3xl font-semibold tracking-[-.04em] text-gray-900 sm:text-4xl">{t("topikFaqTitle")}</h2></Reveal>
          <Reveal className="mt-8 divide-y divide-gray-200 border-y border-gray-200" delay={100} distance={18}>
            {faqs.map(([question, answer], index) => {
              const open = openFaq === index;
              return (
                <div key={question} className="py-1">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : index)}
                    className="focus-ring topiq-faq-trigger flex w-full cursor-pointer items-center justify-between gap-5 rounded-lg py-5 text-left font-semibold text-gray-900"
                  >
                    {question}<span className={`text-xl font-normal text-primary transition-transform duration-200 ${open ? "rotate-45" : ""}`} aria-hidden="true">+</span>
                  </button>
                  <div className={`topiq-faq-answer ${open ? "is-open" : ""}`}>
                    <div>
                      <p className="max-w-2xl pb-5 pr-8 text-sm leading-7 text-gray-600">{answer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </Reveal>
        </div>
      </section>
    </div>
  );
}
