"use client";
import { strategyText } from "@/frontend/i18n/format";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
import type { CandidatePlan } from "./types";

export default function PlanDetails({ plan }: { plan: CandidatePlan }) {
  const { t } = useLocale();

  return (
    <section
      className="plan-details"
      aria-label={t("Candidate execution plan")}
    >
      <h3>{t("Three modification strategies")}</h3>
      <p className="field-note">
        {t(
          "Same boundaries, three instructions. Strategies are not guarantees or art styles.",
        )}
      </p>
      <p className="field-note">
        {t(
          "UI language does not translate your instruction. Strategy directives use fixed English.",
        )}
      </p>
      {plan.slots.map((slot) => (
        <details key={slot.index}>
          <summary>
            {strategyText(slot.strategy_id, t)} {t("· Candidate")}{" "}
            {String.fromCharCode(65 + slot.index)} {t("· seed")} {slot.seed}
          </summary>
          <dl>
            <dt>{t("Original instruction")}</dt>
            <dd>{slot.base_instruction}</dd>
            <dt>{t("Strategy directive")}</dt>
            <dd>{slot.strategy_directive}</dd>
            <dt>{t("Effective instruction")}</dt>
            <dd>{slot.effective_instruction}</dd>
          </dl>
        </details>
      ))}
      <p className="caption">
        {plan.template_version} · {plan.fingerprint.slice(0, 12)}
      </p>
    </section>
  );
}
