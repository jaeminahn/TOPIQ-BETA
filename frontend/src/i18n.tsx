import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { messages, type MessageKey } from "./i18n/messages";

export type Locale = "ko" | "en";

const LOCALE_STORAGE_KEY = "unigate.topik.locale";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function storedLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  return window.localStorage.getItem(LOCALE_STORAGE_KEY) === "en" ? "en" : "ko";
}

export function I18nProvider({ children, locale: fixedLocale }: { children: ReactNode; locale?: Locale }) {
  const [selectedLocale, setSelectedLocale] = useState<Locale>(storedLocale);
  const locale = fixedLocale ?? selectedLocale;
  const setLocale = useCallback((nextLocale: Locale) => {
    if (fixedLocale) return;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    setSelectedLocale(nextLocale);
  }, [fixedLocale]);

  useEffect(() => {
    const previousLocale = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => { document.documentElement.lang = previousLocale; };
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key) => messages[locale][key],
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
