import { useI18n } from "../../i18n";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="py-8 pb-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <div className="border-t border-gray-200/80 pt-5 text-xs text-gray-500">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row"><span className="font-medium text-gray-700">UNIGATE TOPIQ</span><span>© 2026 UNIGATE. All rights reserved.</span></div>
          <p className="mt-4 text-center leading-5 sm:text-left">{t("footerTrademark")}</p>
        </div>
      </div>
    </footer>
  );
}
