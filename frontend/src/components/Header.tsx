import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function Header({ compact = false, showLanguageSwitch = true }: { compact?: boolean; showLanguageSwitch?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <header className={`sticky top-0 z-20 border-b border-gray-200 bg-white ${compact ? "" : ""}`}>
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="focus-ring flex items-center gap-2.5 rounded-lg" aria-label="UNIGATE TOPIK home">
          <img
            src="/logo.svg"
            alt="UNIGATE"
            className="h-5 w-auto sm:h-6"
          />
          <span className="hidden border-l border-gray-300 pl-2.5 text-[9px] font-semibold tracking-[0.12em] text-gray-500 sm:block">TOPIQ</span>
        </Link>
        {showLanguageSwitch && (
          <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label={t("language")}>
            {(["ko", "en"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                aria-pressed={locale === value}
                className={`focus-ring min-h-7 rounded-md px-2 text-[10px] font-semibold transition ${locale === value ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
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
