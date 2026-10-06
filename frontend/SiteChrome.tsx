"use client";
import Link from "next/link";
import { Aperture, ArrowUpRight } from "lucide-react";
import { useLocale } from "./i18n/LocaleProvider";
export function SiteHeader() {
  const { locale, setLocale, t } = useLocale();
  return (
    <header className="site-header">
      <Link href="/" className="wordmark">
        <Aperture aria-hidden size={26} />
        VowEdit<span className="version">/ 0.2</span>
      </Link>
      <nav aria-label={t("Main navigation")}>
        <Link href="/history">{t("Your edits")}</Link>
        <Link href="/edit/new">
          {t("Open studio")} <ArrowUpRight aria-hidden size={16} />
        </Link>
        <button
          className="locale-switch"
          aria-label={t("Interface language")}
          onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
        >
          {locale === "en" ? "中文" : "English"}
        </button>
      </nav>
    </header>
  );
}
export function SiteFooter() {
  const { t } = useLocale();
  return (
    <footer className="site-footer">
      <span>{t("VowEdit — an experiment in intentional editing.")}</span>
      <span>{t("CHANGE WITH CARE. KEEP WITH CONFIDENCE.")}</span>
    </footer>
  );
}
