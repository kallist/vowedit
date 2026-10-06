"use client";
import {
  localText,
  sourceText,
  stateText,
  strategyText,
  formatMetric,
} from "@/frontend/i18n/format";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Download,
  ScanLine,
  ShieldCheck,
  AlertTriangle,
  Check,
  LoaderCircle,
} from "lucide-react";
import { api, ApiError, jsonPost } from "./api";
import { safeErrorText } from "./i18n/errors";
import PlanDetails from "./PlanDetails";
import Decisions from "./Decisions";
import ActivityPanel from "./ActivityPanel";
import { assetUrl, label, terminal, type Run, type Candidate } from "./types";
type View = "after" | "before" | "compare" | "ghost" | "raw" | "aligned";
function BoundaryDisclosure({ candidate }: { candidate: Candidate }) {
  const { t } = useLocale();

  const metadata = candidate.generation_metadata!;
  const preparation = metadata.preparation!;
  return (
    <details
      className="boundary-disclosure"
      aria-label={t("Boundary Lock provenance")}
    >
      <summary>{t("BOUNDARY LOCKED · VowEdit Boundary Lock")}</summary>
      <p>
        {t("Generation: external ·")} {metadata.generation_source_label}
        {t(". Model/version unavailable; seed not supplied.")}
      </p>
      <p>
        {t("Raw")} {preparation.source_size.join(" × ")} {t("px → prepared")}{" "}
        {preparation.target_size.join(" × ")}
        {t(
          "px. Aspect-preserving center crop · Lanczos · binary CHANGE boundary.",
        )}
      </p>
      <p>
        {t(
          "The external candidate was normalized to the source canvas. Only pixels permitted by the CHANGE mask were admitted into the evaluated result. Pixels outside CHANGE were preserved from the original image.",
        )}
      </p>
      <p>
        {t(
          "Constraint enforcement: VowEdit Boundary Lock. Evaluation: VowEdit rgb-mae-v1. Preservation reflects boundary enforcement; it does not prove the external model preserved these pixels.",
        )}
      </p>
    </details>
  );
}
export default function ResultPage({ id }: { id: string }) {
  const { t, locale } = useLocale();

  const router = useRouter(),
    [run, setRun] = useState<Run | null>(null),
    [error, setError] = useState("");
  const [chosen, setChosen] = useState<string | null>(null),
    [view, setView] = useState<View>("compare"),
    [split, setSplit] = useState(50);
  const [receipt, setReceipt] = useState(false),
    [busy, setBusy] = useState(false),
    [pollVersion, setPollVersion] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await api<Run>(`/runs/${id}`);
        if (!live) return;
        setRun(next);
        setError("");
        timer = setTimeout(refresh, terminal(next.status) ? 4000 : 600);
      } catch (e) {
        if (live) {
          if (e instanceof ApiError && e.status === 404) {
            setError(
              "This edit was not found. Open Your edits or start a new edit.",
            );
            return;
          }
          setError("Connection interrupted. Your edit is saved. Reconnecting…");
          timer = setTimeout(refresh, 2000);
        }
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [id, pollVersion]);
  async function retry(kind: "generation" | "evaluation") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const keyName = `vowedit.retry:${id}:${kind}`;
    try {
      const requestKey = sessionStorage.getItem(keyName) || crypto.randomUUID();
      sessionStorage.setItem(keyName, requestKey);
      const next = await api<Run>(
        `/runs/${id}/retry-${kind}`,
        jsonPost({ request_key: requestKey }),
      );
      sessionStorage.removeItem(keyName);
      if (next.id !== id) router.push(`/edit/${next.id}`);
      else {
        setRun(next);
        setPollVersion((v) => v + 1);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(keyName);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  if (!run)
    return (
      <main className="studio-page">
        <h1>{t("Opening your edit…")}</h1>
        {error && (
          <p className="error" role="alert">
            {localText(error, t)}
          </p>
        )}
      </main>
    );
  const candidate =
    run.candidates.find((c) => c.id === chosen) ||
    run.candidates.find((c) => c.id === run.user_selected_candidate_id) ||
    run.candidates.find((c) => c.id === run.selected_candidate_id) ||
    run.candidates[0];
  const finished = terminal(run.status),
    failed = run.status.startsWith("failed");
  const hasReceipt = ["completed", "partial"].includes(run.status);
  return (
    <main className="studio-page result-page">
      <ActivityPanel kind="run" id={run.id} onUpdate={() => { void api<Run>(`/runs/${run.id}`).then(setRun); }} />
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            {t("THE STUDIO /")}{" "}
            {finished ? t("03 — INSPECT") : t("02 — PROCESS")}
          </p>
          <h1>
            {finished
              ? t("The edit. And the evidence.")
              : t("A little change, under review.")}
          </h1>
          <details className="run-intent">
            <summary>{t("Original instruction")}</summary>
            <p className="muted">{run.contract.change.instruction}</p>
          </details>
        </div>
        <span className="pill">{sourceText(run, t)}</span>
      </div>
      {run.provider === "imported" && (
        <p className="field-note">
          {t(
            "Candidates were generated externally and imported into VowEdit for evaluation. This is not a direct model API integration.",
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {localText(error, t)}
        </p>
      )}
      {!finished && (
        <section className="processing" aria-live="polite">
          <LoaderCircle className="spin" size={28} />
          <div>
            <h2>
              {run.status === "queued"
                ? t("Preparing your edit")
                : run.status === "generating"
                  ? t("Generating candidates")
                  : t("Checking your boundaries")}
            </h2>
            <p>
              {run.candidates.length}{" "}
              {t(
                "of 3 candidate images saved. You can leave this page and come back.",
              )}
            </p>
            <div className="stage-list">
              {(run.provider === "imported"
                ? ["queued", "evaluating"]
                : ["queued", "generating", "evaluating"]
              ).map((s) => (
                <span
                  key={stateText(s, t)}
                  className={run.status === s ? "current" : ""}
                >
                  {stateText(s, t)}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
      {failed && (
        <section className="failure-state" role="alert">
          <AlertTriangle aria-hidden />
          <div>
            <h2>
              {run.status === "failed_evaluation"
                ? t("Images saved. Evaluation needs another try.")
                : t("Generation could not finish.")}
            </h2>
            <p>{run.error && localText(safeErrorText(run.error.code), t)}</p>
            <p className="caption">{run.error?.code}</p>
            {run.status === "failed_evaluation" ? (
              <button
                disabled={busy}
                className="button primary"
                onClick={() => void retry("evaluation")}
              >
                {t("Retry Evaluation")}
              </button>
            ) : (
              <button
                disabled={busy || !run.generation_retry_safe}
                className="button primary"
                onClick={() => void retry("generation")}
              >
                {t("Retry Generation")}
              </button>
            )}
            {!run.generation_retry_safe && run.provider !== "imported" && (
              <p>
                {t(
                  "Provider state is unknown. Check its queue before creating a new edit; an automatic retry could duplicate work.",
                )}
              </p>
            )}
          </div>
        </section>
      )}
      {run.status === "partial" && (
        <section className="notice">
          <strong>
            {t("Partial success —")}{" "}
            {run.candidates.filter((c) => c.evaluation).length}{" "}
            {t("of 3 candidates evaluated.")}
          </strong>
          <p>{t("Your successful results are preserved.")}</p>
          {run.candidates.some((c) => !c.evaluation) && (
            <button disabled={busy} onClick={() => void retry("evaluation")}>
              {t("Retry Evaluation")}
            </button>
          )}
        </section>
      )}
      {run.no_good_candidate && hasReceipt && (
        <section className="notice">
          <strong>{t("No candidate fully satisfied your constraints.")}</strong>
          <p>
            {t(
              "All candidates remain visible. The first ranked result is not an approved edit.",
            )}
          </p>
        </section>
      )}
      {candidate && (
        <>
          <div className="result-layout">
            <section className="comparison">
              <div className="comparison-header">
                <span>
                  {t("CANDIDATE")} {label(candidate.index)}
                  {candidate.id === run.selected_candidate_id
                    ? ` / ${t("SUGGESTED")}`
                    : ` / ${t("Currently viewing")}`}
                </span>
                <div
                  className="view-tabs"
                  role="group"
                  aria-label={t("Comparison view")}
                >
                  {(
                    [
                      "before",
                      "after",
                      "compare",
                      "ghost",
                      ...(candidate.generation_metadata?.preparation
                        ? ["raw"]
                        : []),
                    ] as View[]
                  ).map((v) => (
                    <button
                      key={v}
                      aria-pressed={view === v}
                      disabled={v === "ghost" && !candidate.ghost}
                      onClick={() => setView(v)}
                    >
                      {v === "ghost" ? (
                        <>
                          <ScanLine size={14} aria-hidden />
                          {t("Ghost View")}
                        </>
                      ) : v === "compare" ? (
                        t("Before / After")
                      ) : v === "before" ? (
                        t("Original")
                      ) : v === "raw" ? (
                        t("Raw external")
                      ) : (
                        t("Result")
                      )}
                    </button>
                  ))}
                </div>
                {candidate.generation_metadata?.preparation && (
                  <button
                    aria-pressed={view === "aligned"}
                    onClick={() => setView("aligned")}
                  >
                    {t("Aligned raw / locked")}
                  </button>
                )}
              </div>
              <div className="comparison-mat">
                <div className="compare-image" data-testid="comparison-image">
                  <img
                    src={assetUrl(
                      view === "before"
                        ? run.source_image
                        : view === "raw"
                          ? candidate.generation_metadata!.raw_candidate_asset!
                          : candidate.image,
                    )}
                    alt={
                      view === "before"
                        ? t("Original image")
                        : view === "raw"
                          ? `${t("Candidate")} ${label(candidate.index)} ${t("raw external image")}`
                          : `${t("Candidate")} ${label(candidate.index)} ${t("result")}`
                    }
                  />
                  {(view === "compare" || view === "aligned") && (
                    <>
                      <img
                        className="before-layer"
                        src={
                          view === "aligned"
                            ? `/api/prepared-candidates/${candidate.image}/normalized-raw`
                            : assetUrl(run.source_image)
                        }
                        alt={
                          view === "aligned"
                            ? t("Aligned raw preview")
                            : t("Original layer in before and after comparison")
                        }
                        onError={
                          view === "aligned"
                            ? () => {
                                setView("raw");
                                setError(
                                  "Aligned raw preview is unavailable. Showing untouched raw separately.",
                                );
                              }
                            : undefined
                        }
                        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                      />
                      <div className="split-line" style={{ left: `${split}%` }}>
                        <span>{t("↔")}</span>
                      </div>
                      <div className="image-tag left">
                        {view === "aligned" ? t("ALIGNED RAW") : t("BEFORE")}
                      </div>
                      <div className="image-tag right">
                        {view === "aligned" ? t("LOCKED") : t("AFTER")}
                      </div>
                    </>
                  )}
                  {view === "ghost" && candidate.ghost && (
                    <>
                      <img
                        className="ghost-layer"
                        data-testid="ghost-overlay"
                        src={assetUrl(candidate.ghost)}
                        alt={t("Orange heatmap of pixel drift outside CHANGE")}
                      />
                      <div
                        className="mask-outline change-outline"
                        style={{
                          maskImage: `url(${assetUrl(run.contract.change.mask)})`,
                          maskMode: "luminance",
                        }}
                      />
                      {run.contract.keep.map((rule) => (
                        <div
                          key={rule.mask}
                          className="mask-outline keep-outline"
                          style={{
                            maskImage: `url(${assetUrl(rule.mask)})`,
                            maskMode: "luminance",
                          }}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
              {(view === "compare" || view === "aligned") && (
                <label className="slider-label">
                  {t("Before / After")}
                  <input
                    aria-label={t("Before after slider")}
                    type="range"
                    min="0"
                    max="100"
                    value={split}
                    onChange={(e) => setSplit(+e.target.value)}
                  />
                </label>
              )}
              {(view === "compare" || view === "aligned") && (
                <div
                  className="split-presets"
                  aria-label={t("Comparison split presets")}
                >
                  {[0, 50, 100].map((value) => (
                    <button key={value} onClick={() => setSplit(value)}>
                      {value}%
                    </button>
                  ))}
                </div>
              )}
              {view === "aligned" && (
                <p className="field-note">
                  {t(
                    "Aligned raw preview uses the saved center crop and Lanczos recipe. It is not the untouched raw image.",
                  )}
                </p>
              )}
              {view === "ghost" && (
                <div className="ghost-legend">
                  <span className="change-dot">{t("Requested CHANGE")}</span>
                  <span className="keep-dot">{t("Protected KEEP")}</span>
                  <span className="drift-dot">
                    {t("Orange = unintended drift")}
                  </span>
                  <p>
                    {t(
                      "Stronger orange means greater pixel difference. No orange inside CHANGE.",
                    )}
                  </p>
                </div>
              )}
              <section className="candidate-section">
                <div className="section-title">
                  <h2>
                    {t("Three takes.")} <em>{t("One intention.")}</em>
                  </h2>
                  <span className="caption">
                    {t("RANKED BY CONSTRAINTS, THEN DRIFT & SCORE")}
                  </span>
                </div>
                <div className="candidate-strip">
                  {run.candidates.map((c) => (
                    <button
                      className={`candidate-card ${candidate.id === c.id ? "selected" : ""}`}
                      key={c.id}
                      aria-label={`${t("Inspect Candidate")} ${label(c.index)}`}
                      aria-pressed={candidate.id === c.id}
                      onClick={() => {
                        setChosen(c.id);
                        setReceipt(false);
                        if (
                          ["raw", "aligned"].includes(view) &&
                          !c.generation_metadata?.preparation
                        )
                          setView("compare");
                      }}
                    >
                      <div className="candidate-thumbnail">
                        <img
                          src={assetUrl(c.image)}
                          alt={`${t("Candidate")} ${label(c.index)} ${t("thumbnail")}`}
                        />
                        <span className="candidate-letter">
                          {label(c.index)}
                        </span>
                        {c.id === run.selected_candidate_id && (
                          <span className="suggested">{t("SUGGESTED")}</span>
                        )}
                      </div>
                      <div className="candidate-info">
                        <strong>
                          {t("Candidate")} {label(c.index)}
                        </strong>
                        <span>
                          {(c.candidate_plan
                            ? strategyText(c.candidate_plan.strategy_id, t)
                            : null) ||
                            (run.provider === "imported"
                              ? t("Strategy unknown")
                              : t("Legacy seed variant"))}
                        </span>
                        <span>
                          {c.evaluation
                            ? c.evaluation.eligible
                              ? t("Eligible")
                              : t("Ineligible")
                            : t("Unscored")}
                        </span>
                      </div>
                      <p>
                        {c.evaluation
                          ? c.evaluation.eligible
                            ? t("Preserved. Ready for your review.")
                            : `${c.evaluation.violations.length} ${t("KEEP violations")}${!c.evaluation.meaningful_change ? ` · ${t("too little change")}` : ""}`
                          : t("Evaluation pending or failed")}
                      </p>
                    </button>
                  ))}
                </div>
                {run.failures.map((f) => (
                  <p className="error" key={f.index}>
                    {t("Candidate")} {label(f.index)}
                    {t(":")} {localText(safeErrorText(f.code), t)}
                  </p>
                ))}
              </section>
            </section>
            <aside className="score-panel">
              <span className="eyebrow">{t("VOWEDIT EVALUATION")}</span>
              <h3
                className={
                  candidate.manual_review.verdict === "fail"
                    ? "semantic-fail"
                    : ""
                }
              >
                {candidate.manual_review.verdict === "fail"
                  ? t("Semantic review failed")
                  : candidate.manual_review.verdict === "pass"
                    ? t("Human review passed")
                    : t("Human review pending")}
              </h3>
              <p className="field-note">
                {candidate.generation_metadata?.preparation
                  ? t(
                      "Boundary Lock: outside pixels retained from the original, not proof of model preservation.",
                    )
                  : run.provider === "mock"
                    ? t("Pixel simulation. Does not prove strategy semantics.")
                    : run.provider === "imported"
                      ? t("External candidate · strategy unknown")
                      : t("Direct provider output")}
              </p>
              {candidate.evaluation ? (
                <>
                  <p
                    className={
                      candidate.evaluation.eligible
                        ? "verdict"
                        : "verdict warning"
                    }
                  >
                    {candidate.evaluation.eligible ? (
                      <Check size={16} aria-hidden />
                    ) : (
                      <AlertTriangle size={16} aria-hidden />
                    )}
                    {candidate.evaluation.eligible
                      ? t("Pixel checks passed")
                      : t("Does not meet the contract")}
                  </p>
                  <ScoreCard candidate={candidate} />
                  <details className="formula">
                    <summary>{t("Preservation summary")}</summary>
                    <p>
                      {formatMetric(
                        candidate.evaluation.overall_score,
                        t,
                        locale,
                      )}{" "}
                      {t("/ 100")}
                    </p>
                    <p>
                      {t("RGB mean absolute difference, normalized to 0–100.")}{" "}
                      {candidate.evaluation.weights.protected * 100}
                      {t("% KEEP preservation +")}{" "}
                      {candidate.evaluation.weights.background * 100}
                      {t("% outside-CHANGE preservation.")}
                    </p>
                    <p>
                      {t(
                        "Eligibility requires every hard threshold and at least",
                      )}{" "}
                      {candidate.evaluation.minimum_change}
                      {t(
                        "% CHANGE difference. Ranking: eligible first, violations, meaningful change, lower drift, then score, then original index to break ties. More pixel change does not mean a better edit.",
                      )}
                    </p>
                  </details>
                  <p className="field-note">
                    {t("Outside CHANGE mean RGB difference:")}{" "}
                    {formatMetric(
                      100 - candidate.evaluation.background_preservation,
                      t,
                      locale,
                    )}
                    {t("%. Small averages can hide important local changes.")}
                  </p>
                  {candidate.evaluation.regions?.map((region) => (
                    <p className="field-note" key={region.label}>
                      {region.label}
                      {t(":")} {formatMetric(region.score, t, locale)}
                      {t("% /")} {region.threshold}%
                    </p>
                  ))}
                  <p className="field-note">
                    {t("Outside threshold:")}{" "}
                    {run.contract.background_threshold ?? t("Not defined")}
                    {t("% · minimum CHANGE:")}{" "}
                    {candidate.evaluation.minimum_change}%
                  </p>
                  <p className="field-note">
                    {t(
                      "The 2% minimum-change rule and an empty Ghost do not prove semantic success or identity.",
                    )}
                  </p>
                </>
              ) : (
                <p>
                  {candidate.error
                    ? localText(safeErrorText(candidate.error.code), t)
                    : t("Human review pending")}
                </p>
              )}
              {hasReceipt && (
                <Decisions run={run} candidate={candidate} onUpdate={setRun} />
              )}
            </aside>
          </div>
          {candidate.generation_metadata?.preparation && (
            <BoundaryDisclosure candidate={candidate} />
          )}
          {run.candidate_plan && (
            <details>
              <summary>{t("Frozen execution plan")}</summary>
              <PlanDetails plan={run.candidate_plan} />
            </details>
          )}
          {run.parent_run_id && (
            <p>
              <Link href={`/edit/${run.parent_run_id}`}>
                {t("Return to parent edit")}
              </Link>{" "}
              · {stateText(run.derivation_kind || "", t)} ·{" "}
              {run.parent_candidate_id?.slice(0, 8)}
            </p>
          )}
          {hasReceipt && (
            <>
              <div className="result-actions">
                <button
                  className="button primary"
                  onClick={() => setReceipt((r) => !r)}
                >
                  <ShieldCheck size={18} aria-hidden />
                  {receipt ? t("Close Edit Receipt") : t("View Edit Receipt")}
                </button>
                {run.provider !== "imported" && (
                  <button
                    className="button"
                    disabled={busy || !run.generation_retry_safe}
                    onClick={() => void retry("generation")}
                  >
                    {t("Retry Generation")}
                  </button>
                )}
                <Link href="/edit/new" className="text-button">
                  {t("New edit")}
                  <ArrowRight size={15} aria-hidden />
                </Link>
              </div>
              {receipt && (
                <Receipt
                  key={candidate.id}
                  run={run}
                  reviewed={candidate}
                  onUpdate={setRun}
                />
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
function ScoreCard({ candidate }: { candidate: Candidate }) {
  const { t, locale } = useLocale();

  const e = candidate.evaluation!;
  return (
    <dl className="scores">
      <div>
        <dt>
          {t("Protected similarity")}
          <small>{t("Higher = more preserved")}</small>
        </dt>
        <dd>
          {formatMetric(e.protected_similarity, t, locale)}
          {e.protected_similarity !== null && "%"}
        </dd>
      </div>
      <div>
        <dt>
          {t("Outside preservation")}
          <small>{t("Everything outside CHANGE")}</small>
        </dt>
        <dd>{formatMetric(e.background_preservation, t, locale)}%</dd>
      </div>
      <div>
        <dt>
          {t("Change difference")}
          <small>{t("Pixel change, not prompt accuracy")}</small>
        </dt>
        <dd>{formatMetric(e.change_difference, t, locale)}%</dd>
      </div>
      <div>
        <dt>
          {t("Unexpected drift")}
          <small>{t("Lower = less accidental change")}</small>
        </dt>
        <dd>{formatMetric(e.unexpected_drift, t, locale)}%</dd>
      </div>
    </dl>
  );
}
function Receipt({
  run,
  reviewed,
  onUpdate,
}: {
  run: Run;
  reviewed: Candidate;
  onUpdate: (run: Run) => void;
}) {
  const { t, locale } = useLocale();

  const selected = run.candidates.find(
    (c) => c.id === run.selected_candidate_id,
  );
  const [notes, setNotes] = useState(reviewed.manual_review.notes || ""),
    [verdict, setVerdict] = useState(
      reviewed.manual_review.verdict || "pending",
    );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      onUpdate(
        await api<Run>(`/runs/${run.id}/candidates/${reviewed.id}/review`, {
          ...jsonPost({ verdict, notes }),
          method: "PUT",
        }),
      );
      setMessage("Human review saved.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="receipt" aria-label={t("Edit Receipt")}>
      <div className="receipt-top">
        <div>
          <p className="eyebrow">{t("THE PROMISE, IN PIXELS")}</p>
          <h2>
            {t("Edit Receipt")}
            <span> {t("/ 01")}</span>
          </h2>
        </div>
        <ShieldCheck size={36} strokeWidth={1} aria-hidden />
      </div>
      <div className="receipt-grid">
        <div>
          <span className="eyebrow">{t("EDIT REQUEST")}</span>
          <h3>{run.contract.change.instruction}</h3>
          <span className="eyebrow keep-text">{t("KEEP CONTRACT")}</span>
          <p>
            {run.contract.keep.map((r) => r.label).join(" · ") ||
              t("No manually protected region")}
            {run.contract.background_threshold !== null &&
              ` · ${t("Outside CHANGE")}`}
          </p>
          <span className="eyebrow">{t("SUGGESTED RESULT")}</span>
          <h3>
            {selected
              ? `${t("Candidate")} ${label(selected.index)}`
              : t("No qualifying candidate")}
          </h3>
          <p>
            {run.candidates.length} {t("/ 3")}{" "}
            {run.provider === "imported" ? t("imported") : t("generated")} ·{" "}
            {sourceText(run, t)}
            {run.provider !== "imported" &&
              ` · ${run.generation_seconds ?? "—"}s`}
          </p>
          {run.provider === "imported" && (
            <p className="field-note">
              {t(
                "Generation source: external-import. Candidates were generated externally and imported into VowEdit for evaluation.",
              )}
            </p>
          )}
          {reviewed.generation_metadata?.preparation && (
            <BoundaryDisclosure candidate={reviewed} />
          )}
          <p className="field-note">
            {t("CHANGE ·")} {run.contract.change.mask.slice(0, 8)}{" "}
            {t("· Evaluation")}{" "}
            {selected?.evaluation?.metric_version ||
              run.candidates.find((c) => c.evaluation)?.evaluation
                ?.metric_version ||
              "pending"}
          </p>
        </div>
        <div>
          {selected ? (
            <ScoreCard candidate={selected} />
          ) : (
            <p>
              {t(
                "No candidate met every hard threshold and the minimum-change check. Review each candidate’s warnings above.",
              )}
            </p>
          )}
          <p className="receipt-disclaimer">
            {t(
              "Pixel preservation is not semantic correctness, identity preservation or subjective quality.",
            )}
          </p>
        </div>
      </div>
      {
        <div className="human-review">
          <span className="eyebrow">{t("EDIT ADHERENCE / HUMAN REVIEW")}</span>
          <p>
            {t("Reviewing Candidate")} {label(reviewed.index)}
            {t(". System suggestion remains unchanged.")}
          </p>
          <p>
            {t(
              "The score does not answer whether the instruction was followed.",
            )}
          </p>
          <label htmlFor="human-verdict">{t("Your verdict")}</label>
          <select
            id="human-verdict"
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as typeof verdict)}
          >
            <option value="pending">{t("Not reviewed")}</option>
            <option value="pass">{t("Instruction followed")}</option>
            <option value="fail">{t("Instruction not followed")}</option>
          </select>
          <label htmlFor="human-notes">{t("Human notes")}</label>
          <textarea
            id="human-notes"
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("What worked? What changed accidentally?")}
          />
          <button disabled={busy} onClick={() => void save()}>
            {t("Save human review")}
          </button>
          {message && <p role="status">{localText(message, t)}</p>}
        </div>
      }
      <div className="receipt-bottom">
        <span className="caption">
          {run.id.slice(0, 8).toUpperCase()} ·{" "}
          {new Date(run.created_at).toLocaleDateString(locale)}
        </span>
        <a href={`/api/runs/${run.id}/receipt`} className="button" download>
          <Download size={16} aria-hidden />
          {t("Export JSON")}
        </a>
      </div>
    </section>
  );
}
