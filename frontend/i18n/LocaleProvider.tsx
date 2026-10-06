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
export type LocaleStorage = {
  get: () => Promise<string | null>;
  set: (locale: Locale) => Promise<void>;
};
export function LocaleProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage?: LocaleStorage;
}) {
  const [locale, updateLocale] = useState<Locale>("en");
  useEffect(() => {
    if (storage) {
      let live = true;
      storage
        .get()
        .then((value) => {
          if (live && (value === "en" || value === "zh-CN"))
            updateLocale(value);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }
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
  }, [storage]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function setLocale(next: Locale) {
    updateLocale(next);
    if (storage) {
      void storage.set(next);
      return;
    }
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
