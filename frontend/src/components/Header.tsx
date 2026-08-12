import { Languages } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function Header({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <header className={`sticky top-0 z-20 ${compact ? "border-b border-gray-500/30 bg-white" : "bg-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="focus-ring flex items-center gap-2.5 rounded-lg" aria-label="UNIGATE TOPIK home">
          <img
            src="/logo.svg"
            alt="UNIGATE"
            className="h-5 w-auto sm:h-6"
          />
          <span className="hidden border-l border-gray-300 pl-2.5 text-[9px] font-bold tracking-[0.12em] text-gray-500 sm:block">TOPIK LAB</span>
        </Link>

        {!compact && (
          <nav className="hidden items-center gap-6 text-sm font-semibold text-gray-600 md:flex" aria-label="Main navigation">
            <a className="relative flex h-16 items-center px-1 hover:text-primary" href="#tests">{t("navTests")}</a>
            <a className="relative flex h-16 items-center px-1 hover:text-primary" href="#guide">{t("navGuide")}</a>
          </nav>
        )}

        <div className="flex items-center rounded-full border border-gray-300 bg-white/85 p-0.5 shadow-sm backdrop-blur">
          <Languages className="ml-1.5 size-3.5 text-gray-500" aria-hidden="true" />
          {(["id", "ko"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocale(value)}
              className={`focus-ring ml-0.5 min-h-9 rounded-full px-2.5 py-1 text-[11px] font-bold ${locale === value ? "bg-primary text-white" : "text-gray-500 hover:text-gray-800"}`}
              aria-pressed={locale === value}
            >
              {value === "id" ? "Bahasa Indonesia" : "한국어"}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
