"use client";
import { useRef, useState } from 'react';
import { useLocale } from './i18n/LocaleProvider';
import { api, jsonPost } from './api';
import type { AgentAction } from './agentTypes';
import PlanDetails from './PlanDetails';

export default function AgentActions({ actions, disabled = false, onApplied }: {
  actions: AgentAction[]; disabled?: boolean; onApplied: (action: AgentAction) => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const lock = useRef(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  function shown(id: string) {setLoadedImages(current => ({...current,[id]:true}));}
  function visible(action:AgentAction) {return [action.frozen.candidate_asset, action.frozen.contract?.change.mask, ...(action.frozen.contract?.keep.map(k=>k.mask)||[])].filter(Boolean).every(id=>loadedImages[id!]);}
  const keys = useRef<Record<string, { decision_key: string; accept: boolean; confirmations: string[] }>>({});
  async function decide(action: AgentAction, accept: boolean) {
    if (lock.current || (disabled && accept)) return;
    lock.current = true; setBusy(true); setError('');
    const identity = `${action.id}:${accept}`;
    keys.current[identity] ||= { decision_key: crypto.randomUUID(), accept,
      confirmations: (action.frozen.required_confirmations || [])
        .filter(issue => confirmations[`${action.id}:${issue}`]) };
    try {
      const result = await api<AgentAction>(`/agent-actions/${action.id}/decision`, jsonPost(keys.current[identity]));
      onApplied(result);
    } catch (e) { setError(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!actions.length) return null;
  return (
    <section className="agent-actions" aria-label={t("Agent requests")}>
      <h2>{t("Agent requests")}</h2>
      <p>{t("Pending requests do not execute until you confirm here.")}</p>
      {actions.map((action) => (
        <article
          className="agent-card"
          data-state={action.state}
          key={action.id}
        >
          <h3>
            {action.request_actor === "user"
              ? t("Your request")
              : t("Agent request")}
            : {action.action}
          </h3>
          <p className="agent-state">
            {t("Status")}: {action.state} · {t("Expires")}:{" "}
            {new Date(action.expires_at).toLocaleTimeString()}
          </p>
          {action.frozen.candidate_asset && (
            <figure className="draft-original">
              <img
                src={`/api/assets/${action.frozen.candidate_asset}`}
                alt={t("Requested candidate final pixels")}
                onLoad={() => shown(action.frozen.candidate_asset!)}
              />
              <figcaption>
                {t("Requested candidate final pixels")} ·{" "}
                {String.fromCharCode(65 + (action.frozen.candidate_index ?? 0))}{" "}
                · {t("Pixel eligible")}:{" "}
                {String(action.frozen.evaluation?.eligible ?? false)} ·{" "}
                {t("Human verdict")}:{" "}
                {action.frozen.manual_review?.verdict || "pending"}
              </figcaption>
            </figure>
          )}
          {action.frozen.contract && (
            <>
              <p>
                {t("Proposed instruction")}:{" "}
                {action.frozen.contract.change.instruction}
              </p>
              <div className="draft-previews">
                <figure>
                  <img
                    src={`/api/assets/${action.frozen.contract.change.mask}`}
                    alt={t("Proposed CHANGE mask")}
                    onLoad={() => shown(action.frozen.contract!.change.mask)}
                  />
                  <figcaption>CHANGE</figcaption>
                </figure>
                {action.frozen.contract.keep.map((rule) => (
                  <figure key={rule.mask}>
                    <img
                      src={`/api/assets/${rule.mask}`}
                      alt={rule.label}
                      onLoad={() => shown(rule.mask)}
                    />
                    <figcaption>
                      KEEP: {rule.label} · {rule.threshold}%
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
          {action.frozen.plan && <PlanDetails plan={action.frozen.plan} />}
          {action.frozen.provider && (
            <p>
              {t("Provider")}: {action.frozen.provider} ·{" "}
              {t("Three candidates")} · {t("Cost")}:{" "}
              {action.frozen.cost === "none"
                ? t("No external charge")
                : t("Unknown; provider may charge")}
              <br />
              {t("Data sent to")}: {action.frozen.recipient}
              <br />
              {t("Outgoing data")}:{" "}
              {action.frozen.outbound?.join(", ") || t("None; local Mock")}
            </p>
          )}
          {action.action === "retry_evaluation" && (
            <p>
              {t("Evaluation retry uses saved pixels and does not regenerate.")}
            </p>
          )}
          {(action.frozen.required_confirmations || []).map((issue) => (
            <label className="agent-confirm" key={issue}>
              <input
                type="checkbox"
                checked={!!confirmations[`${action.id}:${issue}`]}
                onChange={(e) =>
                  setConfirmations({
                    ...confirmations,
                    [`${action.id}:${issue}`]: e.target.checked,
                  })
                }
              />
              {t("I acknowledge this candidate issue")}: {issue}
            </label>
          ))}
          {action.state === "pending" && (
            <div className="button-row">
              <button
                className="primary-button"
                disabled={
                  busy ||
                  disabled ||
                  !visible(action) ||
                  (action.frozen.required_confirmations || []).some(
                    (issue) => !confirmations[`${action.id}:${issue}`],
                  )
                }
                onClick={() => void decide(action, true)}
              >
                {action.action === "generate"
                  ? t("Confirm saved contract and generate three candidates")
                  : t("Accept request")}
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void decide(action, false)}
              >
                {t("Reject request")}
              </button>
            </div>
          )}
          {action.state === "applied" && action.result_ids.draft_id && (
            <a href={`/drafts/${action.result_ids.draft_id}`}>
              {t("Open resulting draft")}
            </a>
          )}
          {action.state === "applied" && action.result_ids.run_id && (
            <a href={`/edit/${action.result_ids.run_id}`}>
              {t("Open resulting edit")}
            </a>
          )}
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
