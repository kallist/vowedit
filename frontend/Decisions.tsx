"use client";
import { localText } from "@/frontend/i18n/format";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
import { useEffect, useRef, useState } from "react";
import { useBridge } from "./Bridge";
import { ApiError, jsonPost } from "./api";
import { label, type Candidate, type Run, type Starter } from "./types";

export function candidateIssues(candidate: Candidate) {
  const issues: string[] = [];
  if (candidate.manual_review.verdict === "pending")
    issues.push("review_pending");
  if (candidate.manual_review.verdict === "fail") issues.push("semantic_fail");
  if (!candidate.evaluation) issues.push("evaluation_missing");
  else if (!candidate.evaluation.eligible) issues.push("pixel_ineligible");
  return issues;
}
const issueLabels: Record<string, string> = {
  review_pending: "Human review is pending",
  semantic_fail: "Human review failed",
  evaluation_missing: "Evaluation is missing",
  pixel_ineligible: "Pixel constraints are not met",
};
export default function Decisions({
  run,
  candidate,
  onUpdate,
}: {
  run: Run;
  candidate: Candidate;
  onUpdate: (run: Run) => void;
}) {
  const { t } = useLocale();

  const { api, commands, navigate } = useBridge();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recovering, setRecovering] = useState(false);
  useEffect(() => {
    let live = true;
    commands.get(`vowedit.continuation:${run.id}`).then((value) => {
      if (live) setRecovering(!!value);
    });
    return () => {
      live = false;
    };
  }, [run.id, commands]);
  const pending = useRef(false);
  const issues = candidateIssues(candidate);
  const ready = issues.every((issue) => confirmed[`${candidate.id}:${issue}`]);
  const adopted = run.user_selected_candidate_id === candidate.id;
  async function command(continuing: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const storageKey = `vowedit.continuation:${run.id}`;
    try {
      let body = {
        candidate_id: candidate.id,
        expected_selection_revision: run.selection_revision || 0,
        confirmations: issues,
      };
      if (continuing) {
        const saved = await commands.get(storageKey);
        body = saved
          ? JSON.parse(saved)
          : ({ ...body, request_key: crypto.randomUUID() } as typeof body);
        await commands.set(storageKey, JSON.stringify(body));
        const draft = await api<Starter>(
          `/runs/${run.id}/continuations`,
          jsonPost(body),
        );
        await commands.remove(storageKey);
        setRecovering(false);
        navigate(`/edit/new?draft=${draft.id}`);
      } else {
        onUpdate(
          await api<Run>(`/runs/${run.id}/selection`, {
            ...jsonPost(body),
            method: "PUT",
          }),
        );
        setMessage(
          "Adoption saved. Human review and pixel recommendation are unchanged.",
        );
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        if (continuing) {
          await commands.remove(storageKey);
          setRecovering(false);
        }
        const current = await api<Run>(`/runs/${run.id}`).catch(() => null);
        if (current) onUpdate(current);
      }
      setMessage((error as Error).message);
      if (
        continuing &&
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        )
      )
        setRecovering(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="decisions" aria-label={t("Adoption and continuation")}>
      <p>
        <strong>{t("Currently viewing")}</strong>
        {t(": Candidate")} {label(candidate.index)}
      </p>
      <p>
        <strong>{t("Pixel rule recommendation")}</strong>
        {t(":")}{" "}
        {run.selected_candidate_id
          ? label(
              run.candidates.find((c) => c.id === run.selected_candidate_id)!
                .index,
            )
          : t("None")}
      </p>
      <p>
        <strong>{t("User adoption")}</strong>
        {t(":")}{" "}
        {run.user_selected_candidate_id
          ? label(
              run.candidates.find(
                (c) => c.id === run.user_selected_candidate_id,
              )!.index,
            )
          : t("None")}
      </p>
      {issues.length > 0 && (
        <fieldset>
          <legend>{t("Confirm repair material issues")}</legend>
          <p className="field-note">
            {t(
              "Use this candidate as repair material. This does not mark it successful.",
            )}
          </p>
          {issues.map((issue) => (
            <label className="checkbox" key={`${candidate.id}:${issue}`}>
              <input
                type="checkbox"
                checked={!!confirmed[`${candidate.id}:${issue}`]}
                onChange={(event) =>
                  setConfirmed((previous) => ({
                    ...previous,
                    [`${candidate.id}:${issue}`]: event.target.checked,
                  }))
                }
              />
              {localText(issueLabels[issue], t)}
            </label>
          ))}
        </fieldset>
      )}
      <button
        className="button"
        disabled={busy || (!adopted && !ready)}
        onClick={() => void command(false)}
      >
        {adopted ? t("Adopted candidate") : t("Adopt this candidate")}
      </button>
      <button
        className="button primary"
        disabled={busy || !adopted || !ready}
        onClick={() => void command(true)}
      >
        {t("Continue Editing")}
      </button>
      {message && <p role="status">{localText(message, t)}</p>}
      {recovering && (
        <button disabled={busy} onClick={() => void command(true)}>
          {t("Recover continuation")}
        </button>
      )}
    </section>
  );
}
