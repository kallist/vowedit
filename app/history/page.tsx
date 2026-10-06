"use client";
import { localText, sourceText, stateText } from "@/frontend/i18n/format";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/frontend/api";
import { assetUrl, type Run } from "@/frontend/types";
export default function History() {
  const { t, locale } = useLocale();

  const [runs, setRuns] = useState<Run[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Run[]>("/runs")
      .then(setRuns)
      .catch(() => setError("Could not load local history. Check the API."));
  }, []);
  return (
    <main className="studio-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">{t("YOUR LOCAL STUDIO")}</p>
          <h1>{t("Every edit has a story.")}</h1>
          <p className="muted">
            {t(
              "Your latest 50 edits. Images and receipts stay on this machine.",
            )}
          </p>
        </div>
        <Link className="button primary" href="/edit/new">
          {t("New edit →")}
        </Link>
      </div>
      {error && (
        <p role="alert" className="error">
          {localText(error, t)}
        </p>
      )}
      {runs === null && !error && <p>{t("Loading edits…")}</p>}
      {runs?.length === 0 && (
        <div className="empty-state">
          <h2>{t("A fresh canvas.")}</h2>
          <p>{t("Your edits will appear here once you generate.")}</p>
        </div>
      )}
      <div className="history-grid">
        {runs?.map((run) => (
          <article key={run.id} className="history-item">
            <Link href={`/edit/${run.id}`}>
              <img
                src={assetUrl(run.source_image)}
                alt={t("Source of saved edit")}
              />
              <div>
                <span className="eyebrow">
                  {sourceText(run, t)} / {stateText(run.status, t)}
                </span>
                <h2>{run.contract.change.instruction}</h2>
                <span className="caption">
                  {new Date(run.created_at).toLocaleString(locale)}
                </span>
              </div>
            </Link>
            {run.parent_run_id && (
              <p>
                <Link href={`/edit/${run.parent_run_id}`}>
                  {t("Return to parent edit")}
                </Link>{" "}
                · {stateText(run.derivation_kind || "", t)} ·{" "}
                {t("Source candidate")}{" "}
                {run.parent_candidate_id?.slice(0, 8) || "—"}
              </p>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
