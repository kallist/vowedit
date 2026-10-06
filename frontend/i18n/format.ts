import { en, type MessageKey } from "./en";
import type { Translate } from "./LocaleProvider";
import type { Run } from "../types";

export function localText(value: string, t: Translate): string {
  return Object.hasOwn(en, value) ? t(value as MessageKey) : value;
}
export function sourceText(
  run: Pick<Run, "provider" | "source_label">,
  t: Translate,
) {
  return run.provider === "mock"
    ? t("MOCK · pixel simulation")
    : run.provider === "imported"
      ? `${t("IMPORTED")} · ${run.source_label || t("External candidates")}`
      : run.provider;
}
export function stateText(value: string, t: Translate) {
  const map: Record<string, MessageKey> = {
    queued: "Queued",
    generating: "Generating",
    evaluating: "Evaluating",
    completed: "Completed",
    partial: "Partial",
    failed_generation: "Generation failed",
    failed_evaluation: "Evaluation failed",
    generation_retry: "Generation retry",
    continuation: "Continuation",
  };
  return map[value] ? t(map[value]) : t("Unknown state");
}
export function strategyText(value: string, t: Translate) {
  const map: Record<string, MessageKey> = {
    safe: "Restrained change",
    balanced: "Balanced change",
    bold: "Stronger change",
  };
  return map[value] ? t(map[value]) : t("Strategy unknown");
}
export function formatMetric(
  value: number | null | undefined,
  t: Translate,
  locale: string,
) {
  return value == null
    ? t("Not defined")
    : new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
}
