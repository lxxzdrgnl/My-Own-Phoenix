"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { en } from "./en";
import { ko } from "./ko";

export type Locale = "en" | "ko";
/** Deep string type — replaces literal string types with generic string */
type DeepString<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
    ? readonly string[]
    : DeepString<T[K]>;
};
export type Translations = DeepString<typeof en>;

const TRANSLATIONS: Record<Locale, Translations> = { en, ko };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: en,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  // 서버 렌더 및 클라이언트 첫 렌더는 항상 "ko"로 고정 → 하이드레이션 일치.
  // 저장된 로케일은 마운트 후 적용(하이드레이션 이후 전환은 허용).
  const [locale, setLocaleState] = useState<Locale>("ko");

  useEffect(() => {
    const stored = localStorage.getItem("locale") as Locale | null;
    if (stored && stored !== locale) setLocaleState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: TRANSLATIONS[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}
