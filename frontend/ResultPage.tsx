"use client";
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
import {
  assetUrl,
  label,
  metric,
  terminal,
  type Run,
  type Candidate,
} from "./types";
type View = "after" | "before" | "compare" | "ghost";
export default function ResultPage({ id }: { id: string }) {
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
        if (!terminal(next.status)) timer = setTimeout(refresh, 600);
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
        <h1>Opening your edit…</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  const candidate =
    run.candidates.find((c) => c.id === chosen) ||
    run.candidates.find((c) => c.id === run.selected_candidate_id) ||
    run.candidates[0];
  const finished = terminal(run.status),
    failed = run.status.startsWith("failed");
  const hasReceipt = ["completed", "partial"].includes(run.status);
  return (
    <main className="studio-page result-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            THE STUDIO / {finished ? "03 — INSPECT" : "02 — PROCESS"}
          </p>
          <h1>
            {finished
              ? "The edit. And the evidence."
              : "A little change, under review."}
          </h1>
          <p className="muted">{run.contract.change.instruction}</p>
        </div>
        <span className="pill">
          {run.provider === "mock" ? "MOCK · pixel simulation" : run.provider}
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!finished && (
        <section className="processing" aria-live="polite">
          <LoaderCircle className="spin" size={28} />
          <div>
            <h2>
              {run.status === "queued"
                ? "Preparing your edit"
                : run.status === "generating"
                  ? "Generating candidates"
                  : "Checking your boundaries"}
            </h2>
            <p>
              {run.candidates.length} of 3 candidate images saved. You can leave
              this page and come back.
            </p>
            <div className="stage-list">
              {["queued", "generating", "evaluating"].map((s) => (
                <span key={s} className={run.status === s ? "current" : ""}>
                  {s}
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
                ? "Images saved. Evaluation needs another try."
                : "Generation could not finish."}
            </h2>
            <p>{run.error?.message}</p>
            <p className="caption">{run.error?.code}</p>
            {run.status === "failed_evaluation" ? (
              <button
                disabled={busy}
                className="button primary"
                onClick={() => void retry("evaluation")}
              >
                Retry Evaluation
              </button>
            ) : (
              <button
                disabled={busy || !run.generation_retry_safe}
                className="button primary"
                onClick={() => void retry("generation")}
              >
                Retry Generation
              </button>
            )}
            {!run.generation_retry_safe && (
              <p>
                Provider state is unknown. Check its queue before creating a new
                edit; an automatic retry could duplicate work.
              </p>
            )}
          </div>
        </section>
      )}
      {run.status === "partial" && (
        <section className="notice">
          <strong>
            Partial success —{" "}
            {run.candidates.filter((c) => c.evaluation).length} of 3 candidates
            evaluated.
          </strong>
          <p>Your successful results are preserved.</p>
          {run.candidates.some((c) => !c.evaluation) && (
            <button disabled={busy} onClick={() => void retry("evaluation")}>
              Retry Evaluation
            </button>
          )}
        </section>
      )}
      {run.no_good_candidate && hasReceipt && (
        <section className="notice">
          <strong>No candidate fully satisfied your constraints.</strong>
          <p>
            All candidates remain visible. The first ranked result is not an
            approved edit.
          </p>
        </section>
      )}
      {candidate && (
        <>
          <div className="result-layout">
            <section className="comparison">
              <div className="comparison-header">
                <span>
                  CANDIDATE {label(candidate.index)}
                  {candidate.id === run.selected_candidate_id
                    ? " / SUGGESTED"
                    : " / INSPECTING"}
                </span>
                <div
                  className="view-tabs"
                  role="group"
                  aria-label="Comparison view"
                >
                  {(["before", "after", "compare", "ghost"] as View[]).map(
                    (v) => (
                      <button
                        key={v}
                        aria-pressed={view === v}
                        disabled={v === "ghost" && !candidate.ghost}
                        onClick={() => setView(v)}
                      >
                        {v === "ghost" ? (
                          <>
                            <ScanLine size={14} aria-hidden />
                            Ghost View
                          </>
                        ) : v === "compare" ? (
                          "Before / After"
                        ) : v === "before" ? (
                          "Original"
                        ) : (
                          "Result"
                        )}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="comparison-mat">
                <div className="compare-image" data-testid="comparison-image">
                  <img
                    src={assetUrl(
                      view === "before" ? run.source_image : candidate.image,
                    )}
                    alt={
                      view === "before"
                        ? "Original image"
                        : `Candidate ${label(candidate.index)} result`
                    }
                  />
                  {view === "compare" && (
                    <>
                      <img
                        className="before-layer"
                        src={assetUrl(run.source_image)}
                        alt="Original layer in before and after comparison"
                        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                      />
                      <div className="split-line" style={{ left: `${split}%` }}>
                        <span>↔</span>
                      </div>
                      <div className="image-tag left">BEFORE</div>
                      <div className="image-tag right">AFTER</div>
                    </>
                  )}
                  {view === "ghost" && candidate.ghost && (
                    <>
                      <img
                        className="ghost-layer"
                        data-testid="ghost-overlay"
                        src={assetUrl(candidate.ghost)}
                        alt="Orange heatmap of pixel drift outside CHANGE"
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
              {view === "compare" && (
                <label className="slider-label">
                  Before / After
                  <input
                    aria-label="Before after slider"
                    type="range"
                    min="0"
                    max="100"
                    value={split}
                    onChange={(e) => setSplit(+e.target.value)}
                  />
                </label>
              )}
              {view === "ghost" && (
                <div className="ghost-legend">
                  <span className="change-dot">Requested CHANGE</span>
                  <span className="keep-dot">Protected KEEP</span>
                  <span className="drift-dot">Orange = unintended drift</span>
                  <p>
                    Stronger orange means greater pixel difference. No orange
                    inside CHANGE.
                  </p>
                </div>
              )}
            </section>
            <aside className="score-panel">
              <span className="eyebrow">VOWEDIT EVALUATION</span>
              {candidate.evaluation ? (
                <>
                  <div className="big-score">
                    {metric(candidate.evaluation.overall_score)}
                    <span>/ 100</span>
                  </div>
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
                      ? "Pixel checks passed"
                      : "Does not meet the contract"}
                  </p>
                  <ScoreCard candidate={candidate} />
                  <details className="formula">
                    <summary>How this score works</summary>
                    <p>
                      RGB mean absolute difference, normalized to 0–100.{" "}
                      {candidate.evaluation.weights.protected * 100}% KEEP
                      preservation +{" "}
                      {candidate.evaluation.weights.background * 100}%
                      outside-CHANGE preservation.
                    </p>
                    <p>
                      Eligibility requires every hard threshold and at least{" "}
                      {candidate.evaluation.minimum_change}% CHANGE difference.
                      Ranking: eligible first, violations, meaningful change,
                      lower drift, then score. More pixel change does not mean a
                      better edit.
                    </p>
                  </details>
                  <div className="warnings">
                    {candidate.evaluation.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </div>
                </>
              ) : (
                <p>{candidate.error?.message || "Waiting for evaluation."}</p>
              )}
            </aside>
          </div>
          <section className="candidate-section">
            <div className="section-title">
              <h2>
                Three takes. <em>One intention.</em>
              </h2>
              <span className="caption">
                RANKED BY CONSTRAINTS, THEN DRIFT & SCORE
              </span>
            </div>
            <div className="candidate-strip">
              {run.candidates.map((c) => (
                <button
                  className={`candidate-card ${candidate.id === c.id ? "selected" : ""}`}
                  key={c.id}
                  aria-label={`Inspect Candidate ${label(c.index)}`}
                  aria-pressed={candidate.id === c.id}
                  onClick={() => {
                    setChosen(c.id);
                    setReceipt(false);
                  }}
                >
                  <div className="candidate-thumbnail">
                    <img
                      src={assetUrl(c.image)}
                      alt={`Candidate ${label(c.index)} thumbnail`}
                    />
                    <span className="candidate-letter">{label(c.index)}</span>
                    {c.id === run.selected_candidate_id && (
                      <span className="suggested">SUGGESTED</span>
                    )}
                  </div>
                  <div className="candidate-info">
                    <strong>Candidate {label(c.index)}</strong>
                    <span>
                      {c.evaluation
                        ? metric(c.evaluation.overall_score)
                        : "Unscored"}
                    </span>
                  </div>
                  <p>
                    {c.evaluation
                      ? c.evaluation.eligible
                        ? "Preserved. Ready for your review."
                        : `${c.evaluation.violations.length} KEEP violations${!c.evaluation.meaningful_change ? " · too little change" : ""}`
                      : "Evaluation pending or failed"}
                  </p>
                </button>
              ))}
            </div>
            {run.failures.map((f) => (
              <p className="error" key={f.index}>
                Candidate {label(f.index)}: {f.message}
              </p>
            ))}
          </section>
          {hasReceipt && (
            <>
              <div className="result-actions">
                <button
                  className="button primary"
                  onClick={() => setReceipt((r) => !r)}
                >
                  <ShieldCheck size={18} aria-hidden />
                  {receipt ? "Close Edit Receipt" : "View Edit Receipt"}
                </button>
                <button
                  className="button"
                  disabled={busy || !run.generation_retry_safe}
                  onClick={() => void retry("generation")}
                >
                  Retry Generation
                </button>
                <Link href="/edit/new" className="text-button">
                  New edit <ArrowRight size={15} aria-hidden />
                </Link>
              </div>
              {receipt && <Receipt run={run} onUpdate={setRun} />}
            </>
          )}
        </>
      )}
    </main>
  );
}
function ScoreCard({ candidate }: { candidate: Candidate }) {
  const e = candidate.evaluation!;
  return (
    <dl className="scores">
      <div>
        <dt>
          Protected similarity <small>Higher = more preserved</small>
        </dt>
        <dd>
          {metric(e.protected_similarity)}
          {e.protected_similarity !== null && "%"}
        </dd>
      </div>
      <div>
        <dt>
          Outside preservation <small>Everything outside CHANGE</small>
        </dt>
        <dd>{metric(e.background_preservation)}%</dd>
      </div>
      <div>
        <dt>
          Change difference <small>Pixel change, not prompt accuracy</small>
        </dt>
        <dd>{metric(e.change_difference)}%</dd>
      </div>
      <div>
        <dt>
          Unexpected drift <small>Lower = less accidental change</small>
        </dt>
        <dd>{metric(e.unexpected_drift)}%</dd>
      </div>
    </dl>
  );
}
function Receipt({
  run,
  onUpdate,
}: {
  run: Run;
  onUpdate: (run: Run) => void;
}) {
  const selected = run.candidates.find(
    (c) => c.id === run.selected_candidate_id,
  );
  const [notes, setNotes] = useState(selected?.manual_review.notes || ""),
    [verdict, setVerdict] = useState(
      selected?.manual_review.verdict || "pending",
    );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      onUpdate(
        await api<Run>(`/runs/${run.id}/candidates/${selected.id}/review`, {
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
    <section className="receipt" aria-label="Edit Receipt">
      <div className="receipt-top">
        <div>
          <p className="eyebrow">THE PROMISE, IN PIXELS</p>
          <h2>
            Edit Receipt<span> / 01</span>
          </h2>
        </div>
        <ShieldCheck size={36} strokeWidth={1} aria-hidden />
      </div>
      <div className="receipt-grid">
        <div>
          <span className="eyebrow">EDIT REQUEST</span>
          <h3>{run.contract.change.instruction}</h3>
          <span className="eyebrow keep-text">KEEP CONTRACT</span>
          <p>
            {run.contract.keep.map((r) => r.label).join(" · ") ||
              "No manually protected region"}
            {run.contract.background_threshold !== null && " · Outside CHANGE"}
          </p>
          <span className="eyebrow">SUGGESTED RESULT</span>
          <h3>
            {selected
              ? `Candidate ${label(selected.index)}`
              : "No qualifying candidate"}
          </h3>
          <p>
            {run.candidates.length} / 3 generated ·{" "}
            {run.provider === "mock" ? "Mock simulation" : run.provider} ·{" "}
            {run.generation_seconds ?? "—"}s
          </p>
        </div>
        <div>
          {selected ? (
            <ScoreCard candidate={selected} />
          ) : (
            <p>
              No candidate met every hard threshold and the minimum-change
              check. Review each candidate’s warnings above.
            </p>
          )}
          <p className="receipt-disclaimer">
            Pixel preservation is not semantic correctness, identity
            preservation or subjective quality.
          </p>
        </div>
      </div>
      {selected && (
        <div className="human-review">
          <span className="eyebrow">EDIT ADHERENCE / HUMAN REVIEW</span>
          <p>The score does not answer whether the instruction was followed.</p>
          <label htmlFor="human-verdict">Your verdict</label>
          <select
            id="human-verdict"
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as typeof verdict)}
          >
            <option value="pending">Not reviewed</option>
            <option value="pass">Instruction followed</option>
            <option value="fail">Instruction not followed</option>
          </select>
          <label htmlFor="human-notes">Human notes</label>
          <textarea
            id="human-notes"
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What worked? What changed accidentally?"
          />
          <button disabled={busy} onClick={() => void save()}>
            Save human review
          </button>
          {message && <p role="status">{message}</p>}
        </div>
      )}
      <div className="receipt-bottom">
        <span className="caption">
          {run.id.slice(0, 8).toUpperCase()} ·{" "}
          {new Date(run.created_at).toLocaleDateString()}
        </span>
        <a href={`/api/runs/${run.id}/receipt`} className="button" download>
          <Download size={16} aria-hidden />
          Export JSON
        </a>
      </div>
    </section>
  );
}
