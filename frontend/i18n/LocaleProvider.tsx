"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { en, type MessageKey } from "./en";
import { zhCN } from "./zh-CN";
export type Locale = "en" | "zh-CN";
export type Translate = (key: MessageKey) => string;
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}>({ locale: "en", setLocale: () => {}, t: (key) => en[key] });
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("en");
  useEffect(() => {
    let preference: string | null = null;
    try {
      preference = localStorage.getItem("vowedit.locale");
    } catch {
      /* Browser storage is optional. */
    }
    updateLocale(
      preference === "en" || preference === "zh-CN"
        ? preference
        : navigator.language.toLowerCase().startsWith("zh")
          ? "zh-CN"
          : "en",
    );
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function setLocale(next: Locale) {
    updateLocale(next);
    try {
      localStorage.setItem("vowedit.locale", next);
    } catch {
      /* Keep in-memory preference. */
    }
  }
  const catalog = locale === "zh-CN" ? zhCN : en;
  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, t: (key) => catalog[key] }}
    >
      {children}
    </LocaleContext.Provider>
  );
}
export const useLocale = () => useContext(LocaleContext);
