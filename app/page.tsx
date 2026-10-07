"use client";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
import Link from "next/link";
import { ArrowRight, Scan, ShieldCheck, ScanLine } from "lucide-react";
export default function Landing() {
  const { t } = useLocale();

  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-square" />
            {t("A LITTLE MORE INTENTION. A LOT LESS DRIFT.")}
          </p>
          <h1>
            {t("Change what")}
            <br />
            {t("you ask.")}
            <br />
            <em>
              {t("Keep what")}
              <br />
              {t("you don’t.")}
            </em>
          </h1>
          <p className="hero-description">
            {t("An edit should change your image.")}
            <br />
            {t("Not your intention.")}
          </p>
          <p className="muted">
            {t("Tell AI what to change and what to leave alone.")}
            <br />
            {t("Then see how well it kept its promise.")}
          </p>
          <Link className="button primary hero-cta" href="/edit/new">
            {t("Try VowEdit")}
            <ArrowRight size={18} aria-hidden />
          </Link>
          <span className="caption">
            {t("LOCAL STUDIO · MOCK DEMO INCLUDED · NO ACCOUNT")}
          </span>
        </div>
        <div className="hero-art">
          <div className="art-orbit" aria-hidden="true" />
          <div className="art-edition" aria-hidden="true">
            V / 01
          </div>
          <div className="art-heading">
            <span>{t("01 / THE EDIT CONTRACT")}</span>
            <span className="pill">{t("Illustrative fixture")}</span>
          </div>
          <div className="art-image">
            <div className="art-mount">
              <img
                src="/fixtures/illustration.svg"
                alt={t(
                  "Original geometric illustration of a person in a terracotta jacket",
                )}
              />
            </div>
            <div className="keep-callout">
              <ShieldCheck size={15} aria-hidden />
              {t("KEEP / face & hair")}
            </div>
            <div className="change-callout">
              <Scan size={15} aria-hidden />
              {t("CHANGE / jacket")}
            </div>
            <div className="art-corner top-left" />
            <div className="art-corner bottom-right" />
          </div>
          <div className="art-bottom">
            <div>
              <span className="eyebrow">{t("THE REQUEST")}</span>
              <p>{t("“Change the jacket. Keep the character.”")}</p>
            </div>
            <ArrowUp />
          </div>
          <div className="floating-note">
            <ScanLine aria-hidden size={19} />
            <div>
              {t("Every edit leaves a trace.")}
              <span>{t("Ghost View makes it visible.")}</span>
            </div>
          </div>
        </div>
      </section>
      <section className="story-strip">
        <p className="eyebrow">
          {t("A BETTER QUESTION THAN")}
          <br />
          {t("“DOES IT LOOK GOOD?”")}
        </p>
        <h2>
          {t("Did it change")}
          <br />
          <em>{t("only what you asked?")}</em>
        </h2>
        <p>
          {t(
            "Make your boundaries visible. Compare three candidates. Inspect accidental changes. Leave with an Edit Receipt, not just another image.",
          )}
        </p>
      </section>
      <section className="steps">
        <article>
          <span>{t("01 / DEFINE")}</span>
          <h3>
            {t("Two intentions.")}
            <br />
            {t("One clear contract.")}
          </h3>
          <p>
            {t(
              "Brush over what may change. Protect what matters. Review the contract before you generate.",
            )}
          </p>
        </article>
        <article>
          <span>{t("02 / INSPECT")}</span>
          <h3>
            {t("Good edits.")}
            <br />
            {t("Visible mistakes.")}
          </h3>
          <p>
            {t(
              "See all three candidates. Ghost View reveals drift outside the area you asked to edit.",
            )}
          </p>
        </article>
        <article>
          <span>{t("03 / UNDERSTAND")}</span>
          <h3>
            {t("A result.")}
            <br />
            {t("And its receipt.")}
          </h3>
          <p>
            {t(
              "Transparent pixel metrics, explicit warnings, and a place for your judgment. No invented accuracy.",
            )}
          </p>
        </article>
      </section>
    </main>
  );
}
function ArrowUp() {
  return <ArrowRight size={28} strokeWidth={1} aria-hidden />;
}
