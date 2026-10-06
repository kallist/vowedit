"use client";
import { useEffect, useState } from "react";
import { useBridge } from "./Bridge";
import { useLocale } from "./i18n/LocaleProvider";
import type { Candidate } from "./types";
type Facts = {
  candidates: {
    candidate_id: string;
    semantic_status: string;
    reasons: string[];
  }[];
};
export default function CompactReport({
  runId,
  candidate,
}: {
  runId: string;
  candidate: Candidate;
}) {
  const { api } = useBridge();
  const { t } = useLocale();
  const [facts, setFacts] = useState<Facts>();
  const evaluationVersion = JSON.stringify(candidate.evaluation);
  useEffect(() => {
    let live = true;
    api<Facts>(`/runs/${runId}/report`)
      .then((next) => {
        if (live) setFacts(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [
    runId,
    candidate.id,
    candidate.manual_review.verdict,
    evaluationVersion,
    api,
  ]);
  const item = facts?.candidates.find(
    (entry) => entry.candidate_id === candidate.id,
  );
  return (
    <section aria-label={t("Compact preservation report")}>
      <strong>{t("Compact preservation report")}</strong>
      {item?.reasons.includes("keep_undefined") && (
        <p>{t("KEEP is undefined.")}</p>
      )}
      {item?.reasons.includes("boundary_enforced") && (
        <p>{t("Boundary Lock preservation comes from compositing.")}</p>
      )}
      {item?.semantic_status === "fail" && (
        <p className="error">
          {t("Human FAIL remains FAIL after adoption.")}
        </p>
      )}
    </section>
  );
}
