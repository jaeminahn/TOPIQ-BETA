import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function Header({ compact = false, showLanguageSwitch = true, children }: { compact?: boolean; showLanguageSwitch?: boolean; children?: ReactNode }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <header className={`topiq-header sticky top-0 z-30 border-b ${compact ? "" : ""}`}>
      <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-5 px-4 py-3 sm:px-6 md:flex-nowrap md:py-0 lg:px-8">
        <Link to="/" className="focus-ring flex items-center gap-2.5 rounded-lg" aria-label="UNIGATE TOPIK home">
          <img
            src="/logo.png"
            alt="UNIGATE"
            className="h-8 w-auto sm:h-9"
          />
          <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-accent">BETA</span>
        </Link>
        {children}
        {showLanguageSwitch && (
          <div className="topiq-language-switch relative grid grid-cols-2 items-center rounded-full border border-gray-200/80 bg-gray-50/80 p-1" data-locale={locale} role="group" aria-label={t("language")}>
            <span className="topiq-language-indicator" aria-hidden="true" />
            {(["en", "ko"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                aria-pressed={locale === value}
                className={`focus-ring relative z-10 min-h-6 min-w-[56px] rounded-full px-2.5 text-[10px] font-semibold transition-colors duration-200 ${locale === value ? "text-primary" : "text-gray-500 hover:text-gray-800"}`}
              >
                {value === "ko" ? t("korean") : t("english")}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
