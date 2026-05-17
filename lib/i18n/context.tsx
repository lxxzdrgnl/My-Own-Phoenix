"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
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
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "ko";
    return (localStorage.getItem("locale") as Locale) || "ko";
  });

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
