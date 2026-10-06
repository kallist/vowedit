"use client";
import { localText } from "@/frontend/i18n/format";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Upload, ShieldCheck } from "lucide-react";
import MaskEditor, {
  type MaskValue,
  type SeedMasks,
} from "@/frontend/MaskEditor";
import { api, ApiError, jsonPost, upload } from "@/frontend/api";
import type { Stroke } from "@/frontend/masks";
import { importReady, submissionPath } from "@/frontend/imports";
import PlanDetails from "@/frontend/PlanDetails";
import {
  assetUrl,
  type Asset,
  type Run,
  type PreparedAsset,
  type CandidatePlan,
  type Starter,
} from "@/frontend/types";
export default function NewEdit() {
  const { t } = useLocale();

  const router = useRouter(),
    input = useRef<HTMLInputElement>(null),
    pending = useRef(false);
  const [asset, setAsset] = useState<Asset | null>(null),
    [masks, setMasks] = useState<MaskValue | null>(null);
  const [draftStrokes, setDraftStrokes] = useState<Stroke[]>([]);
  const demoSelected = useRef(false);
  const [draftMasks, setDraftMasks] = useState<SeedMasks>({});
  const [recoveringSubmission, setRecoveringSubmission] = useState(false);
  const [instruction, setInstruction] = useState(""),
    [keepLabel, setKeepLabel] = useState("Face & hair");
  const [threshold, setThreshold] = useState(98),
    [background, setBackground] = useState(true);
  const [provider, setProvider] = useState("mock"),
    [providers, setProviders] = useState(["mock"]);
  const [mode, setMode] = useState<"generate" | "import">("generate");
  const [candidates, setCandidates] = useState<(Asset | null)[]>([
    null,
    null,
    null,
  ]);
  const [sourceLabel, setSourceLabel] = useState("External tool");
  const [plan, setPlan] = useState<CandidatePlan | null>(null);
  const [starter, setStarter] = useState<Starter | null>(null);
  const [loadingStarter, setLoadingStarter] = useState(false);
  useEffect(() => {
    const draftId = new URLSearchParams(window.location.search).get("draft");
    if (!draftId) return;
    setLoadingStarter(true);
    api<Starter>(`/drafts/${encodeURIComponent(draftId)}`)
      .then((draft) => {
        setStarter(draft);
        setAsset({
          id: draft.source_image,
          width: draft.source_size[0],
          height: draft.source_size[1],
          url: assetUrl(draft.source_image),
        });
        setMasks(null);
        setDraftStrokes([]);
        setDraftMasks({});
        setInstruction("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingStarter(false));
  }, []);
  useEffect(() => {
    if (!masks || mode !== "generate") return;
    let live = true;
    api<CandidatePlan>("/candidate-plans", jsonPost({ instruction }))
      .then((value) => {
        if (live) setPlan(value);
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [masks, mode, instruction]);
  const [rawCandidates, setRawCandidates] = useState<(Asset | null)[]>([
    null,
    null,
    null,
  ]);
  const [locked, setLocked] = useState<(PreparedAsset | null)[]>([
    null,
    null,
    null,
  ]);
  const maskAssets = useRef<{ change: Asset; keep: Asset | null } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const [prepared, setPrepared] = useState<{
    key: string;
    change: Asset;
    keep: Asset | null;
  } | null>(null);
  useEffect(() => {
    const saved = sessionStorage.getItem("vowedit.pending-submission");
    if (!saved) return;
    setRecoveringSubmission(true);
    pending.current = true;
    setBusy(true);
    api<Run>(submissionPath(JSON.parse(saved)), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: saved,
    })
      .then((run) => {
        sessionStorage.removeItem("vowedit.pending-submission");
        router.replace(`/edit/${run.id}`);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          sessionStorage.removeItem("vowedit.pending-submission");
          setRecoveringSubmission(false);
        }
        setError(
          "The previous submission could not be recovered. Reload to retry its original request key; check Your edits before starting another edit.",
        );
      })
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  }, [router]);
  useEffect(() => {
    api<{ providers: string[]; default_provider: string }>("/config")
      .then((c) => {
        setProviders(c.providers);
        if (!demoSelected.current) setProvider(c.default_provider);
      })
      .catch(() => setError("Start the local API to upload and generate."));
  }, []);
  async function choose(file: File) {
    if (pending.current) return;
    pending.current = true;
    demoSelected.current = false;
    setBusy(true);
    setError("");
    try {
      setAsset(await upload(file, "original"));
      setStarter(null);
      setPlan(null);
      setMasks(null);
      setDraftStrokes([]);
      setDraftMasks({});
      setPrepared(null);
      setCandidates([null, null, null]);
      setRawCandidates([null, null, null]);
      setLocked([null, null, null]);
      maskAssets.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  async function fixture() {
    if (pending.current) return;
    pending.current = true;
    demoSelected.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/fixtures/original.png");
      if (!response.ok) throw new Error("Demo image unavailable.");
      const source = await upload(
        new File([await response.blob()], "original.png", {
          type: "image/png",
        }),
        "original",
      );
      setAsset(source);
      setStarter(null);
      setPlan(null);
      setCandidates([null, null, null]);
      setRawCandidates([null, null, null]);
      setLocked([null, null, null]);
      maskAssets.current = null;
      setMasks(null);
      setPrepared(null);
      setDraftStrokes([]);
      setDraftMasks({
        change: "/fixtures/change.png",
        keep: "/fixtures/keep.png",
      });
      setInstruction("Change the terracotta jacket to a cool blue jacket.");
      setKeepLabel("Face & hair");
      setProvider("mock");
      setThreshold(98);
      setBackground(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function generate() {
    if (!asset || !masks || pending.current) return;
    if (mode === "generate" && !plan) return;
    if (
      mode === "import" &&
      (!masks.keep || !importReady(candidates, sourceLabel))
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      let saved = prepared;
      if (!saved) {
        saved = {
          key: crypto.randomUUID(),
          ...(await saveMasks()),
        };
        setPrepared(saved);
      }
      const request = {
        source_image: asset.id,
        request_key: saved.key,
        ...(mode === "import"
          ? {
              candidate_images: candidates.map((c) => c!.id),
              source_label: sourceLabel.trim(),
            }
          : {
              provider,
              candidate_count: 3,
              candidate_mode: "strategy-v1",
              preview_fingerprint: plan!.fingerprint,
            }),
        ...(starter ? { continuation_draft_id: starter.id } : {}),
        contract: {
          change: { instruction, mask: saved.change.id },
          keep: saved.keep
            ? [
                {
                  type: "manual_region",
                  label: keepLabel,
                  mask: saved.keep.id,
                  threshold,
                },
              ]
            : [],
          background_threshold: background ? threshold : null,
        },
      };
      sessionStorage.setItem(
        "vowedit.pending-submission",
        JSON.stringify(request),
      );
      const run = await api<Run>(submissionPath(request), jsonPost(request));
      sessionStorage.removeItem("vowedit.pending-submission");
      router.push(`/edit/${run.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem("vowedit.pending-submission");
        setPrepared(null);
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  async function chooseCandidate(index: number, file: File) {
    if (!asset || pending.current || prepared) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const candidate = await upload(file, "candidate");
      setRawCandidates((old) =>
        old.map((c, i) => (i === index ? candidate : c)),
      );
      setLocked((old) => old.map((c, i) => (i === index ? null : c)));
      if (
        candidate.width !== asset.width ||
        candidate.height !== asset.height
      ) {
        setCandidates((old) => old.map((c, i) => (i === index ? null : c)));
        setError("CANDIDATE_SIZE_MISMATCH");
        return;
      }
      setCandidates((old) => old.map((c, i) => (i === index ? candidate : c)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function saveMasks() {
    if (!masks) throw new Error("Review the edit contract first.");
    if (!maskAssets.current)
      maskAssets.current = {
        change: await upload(masks.change, "mask"),
        keep: masks.keep ? await upload(masks.keep, "mask") : null,
      };
    return maskAssets.current;
  }
  async function applyBoundaryLock() {
    if (
      !asset ||
      !masks?.keep ||
      pending.current ||
      !rawCandidates.every(Boolean)
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await saveMasks();
      // Each successful prepared asset survives a partial failure. Retrying prepares
      // only the remaining slots and never creates a generation job.
      for (let index = 0; index < 3; index++) {
        if (locked[index]) continue;
        const candidate = await api<PreparedAsset>(
          "/prepared-candidates",
          jsonPost({
            source_image: asset.id,
            candidate_image: rawCandidates[index]!.id,
            source_label: sourceLabel.trim(),
            contract: {
              change: { instruction, mask: saved.change.id },
              keep: [
                {
                  type: "manual_region",
                  label: keepLabel,
                  mask: saved.keep!.id,
                  threshold,
                },
              ],
              background_threshold: background ? threshold : null,
            },
          }),
        );
        setLocked((old) => old.map((c, i) => (i === index ? candidate : c)));
        setCandidates((old) =>
          old.map((c, i) => (i === index ? candidate : c)),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const summary = !!masks;
  if (recoveringSubmission) {
    return (
      <main className="studio-page">
        <p className="eyebrow">{t("RECOVER YOUR EDIT")}</p>
        <h1>{t("One request. One edit.")}</h1>
        <p>
          {t(
            "We are checking your previous submission before starting another edit.",
          )}
        </p>
        {busy ? (
          <p role="status">{t("Recovering the original request…")}</p>
        ) : (
          <>
            <p role="alert" className="error">
              {localText(error, t)}
            </p>
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              {t("Retry submission recovery")}
            </button>
          </>
        )}
      </main>
    );
  }
  return (
    <main className="studio-page">
      {loadingStarter && (
        <p role="status">{t("Loading continuation starter…")}</p>
      )}
      {starter && (
        <section className="notice">
          <strong>{t("Continue from adopted final image")}</strong>
          <p>
            {t(
              "New original saved. Paint new CHANGE and KEEP boundaries and write a new instruction.",
            )}
          </p>
          <a href={`/edit/${starter.parent_run_id}`}>
            {t("Return to parent edit")}
          </a>
        </section>
      )}
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            {t("THE STUDIO /")} {summary ? t("02 — CONFIRM") : t("01 — DEFINE")}
          </p>
          <h1>
            {summary
              ? t("A promise, before the pixels.")
              : t("Make room for the right change.")}
          </h1>
        </div>
        <span className="pill">
          {mode === "import"
            ? t("IMPORTED · external generation")
            : provider === "mock"
              ? t("MOCK · pixel simulation")
              : t("Configured provider")}
        </span>
      </div>
      <div className="workspace-grid">
        <aside className="contract-panel">
          <span className="section-number">{t("YOUR INTENTION")}</span>
          <label htmlFor="instruction">
            {t("What would you like to change?")}
          </label>
          <textarea
            id="instruction"
            value={instruction}
            disabled={summary || busy}
            maxLength={1500}
            placeholder={t("Change the jacket to white. Keep the character.")}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <p className="field-note">
            {t(
              "Be specific. Prompt adherence is reviewed by you, not inferred from a pixel score.",
            )}
          </p>
          <hr />
          <label htmlFor="keep-label">{t("Name your KEEP region")}</label>
          <input
            id="keep-label"
            value={keepLabel}
            disabled={summary || busy}
            maxLength={60}
            onChange={(e) => setKeepLabel(e.target.value)}
          />
          <label htmlFor="threshold">
            {t("Preservation threshold")}
            <span>{threshold}%</span>
          </label>
          <input
            id="threshold"
            type="range"
            min="80"
            max="100"
            step="0.5"
            value={threshold}
            disabled={summary || busy}
            onChange={(e) => setThreshold(+e.target.value)}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={background}
              disabled={summary || busy}
              onChange={(e) => setBackground(e.target.checked)}
            />
            {t("Protect everything outside CHANGE")}
          </label>
          <p className="field-note">
            {t(
              "“Background” means outside your painted edit area, not automatic scene segmentation.",
            )}
          </p>
          <hr />
          {mode === "generate" && (
            <>
              <label htmlFor="provider">{t("Generation source")}</label>
              <select
                id="provider"
                value={provider}
                disabled={summary || busy}
                onChange={(e) => setProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p === "mock" ? t("Mock — deterministic demo") : p}
                  </option>
                ))}
              </select>
              <p className="field-note">
                {provider === "mock"
                  ? t(
                      "No model call. Controlled edits and deliberate drift let you explore the entire product.",
                    )
                  : t(
                      "Your image, CHANGE mask and instruction leave this app for the configured provider.",
                    )}
              </p>
            </>
          )}
          <div className="quiet-note">
            <ShieldCheck size={20} aria-hidden />
            <p>
              {t("KEEP is a measurable contract.")}
              <br />
              {t("Not a promise from the model.")}
            </p>
          </div>
        </aside>
        <section className="editor-panel">
          {!asset ? (
            <div
              className={`upload-zone ${drag ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files[0])
                  void choose(e.dataTransfer.files[0]);
              }}
            >
              <div className="upload-symbol">
                <Upload size={34} strokeWidth={1} aria-hidden />
              </div>
              <h2>
                {t("Your image.")}
                <br />
                <em>{t("Your boundaries.")}</em>
              </h2>
              <p>{t("Drop an image here to begin.")}</p>
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg"
                hidden
                aria-label={t("Upload original image")}
                onChange={(e) => {
                  if (e.target.files?.[0]) void choose(e.target.files[0]);
                }}
              />
              <button
                className="button primary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {t("Choose an image")}
                <ArrowRight size={17} aria-hidden />
              </button>
              <span className="caption">
                {t("PNG OR JPEG · UP TO 10 MB · 32–1536 PX PER SIDE")}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void fixture()}
              >
                {t("Use Demo — image, instruction & masks")}
              </button>
            </div>
          ) : summary ? (
            <div className="summary-card">
              <div className="summary-heading">
                <span className="eyebrow">
                  {t("EDIT CONTRACT / READY FOR YOUR REVIEW")}
                </span>
                <ShieldCheck size={25} aria-hidden />
              </div>
              <div className="summary-content">
                <img
                  src={assetUrl(asset.id)}
                  alt={t("Source image for this edit contract")}
                />
                <div>
                  <span className="change-text eyebrow">{t("CHANGE")}</span>
                  <h2>{instruction}</h2>
                  <p>
                    {masks.changePixels.toLocaleString()} {t("editable pixels")}
                  </p>
                  <span className="keep-text eyebrow">{t("KEEP")}</span>
                  <h3>
                    {masks.keepPixels ? keepLabel : t("No painted KEEP region")}
                  </h3>
                  <p>
                    {background
                      ? `${t("Outside CHANGE")} · ${threshold}% ${t("minimum preservation")}`
                      : t(
                          "Outside CHANGE will be measured, without a hard threshold.",
                        )}
                  </p>
                  <p>
                    {masks.keepPixels.toLocaleString()} {t("protected pixels")}
                  </p>
                </div>
              </div>
              <fieldset className="import-source" disabled={busy || !!prepared}>
                <legend>{t("Choose candidate source")}</legend>
                <label className="checkbox">
                  <input
                    type="radio"
                    name="candidate-source"
                    checked={mode === "generate"}
                    onChange={() => setMode("generate")}
                  />
                  {t("Generate with configured provider")}
                </label>
                <label className="checkbox">
                  <input
                    type="radio"
                    name="candidate-source"
                    checked={mode === "import"}
                    onChange={() => setMode("import")}
                  />
                  {t("Import 3 candidates")}
                </label>
                {mode === "import" && (
                  <>
                    <p className="field-note">
                      {t(
                        "Generation happened externally. VowEdit imports and evaluates your images. Each must match the original:",
                      )}{" "}
                      {asset.width} {t("×")} {asset.height}
                      {t("px.")}
                    </p>
                    <div className="import-slots">
                      {rawCandidates.map((raw, index) => (
                        <div className="import-slot" key={index}>
                          <label htmlFor={`candidate-${index}`}>
                            {t("Candidate")} {String.fromCharCode(65 + index)}
                          </label>
                          <input
                            id={`candidate-${index}`}
                            type="file"
                            accept="image/png,image/jpeg"
                            aria-label={`${t("Upload Candidate")} ${String.fromCharCode(65 + index)}`}
                            onChange={(e) => {
                              if (e.target.files?.[0])
                                void chooseCandidate(index, e.target.files[0]);
                            }}
                          />
                          {raw && (
                            <>
                              <img
                                src={assetUrl((candidates[index] || raw).id)}
                                alt={`${t("Uploaded Candidate")} ${String.fromCharCode(65 + index)}`}
                              />
                              <p className="field-note">
                                {t("Raw ·")} {raw.width} {t("×")} {raw.height}{" "}
                                px
                                <br />
                                {t("Target ·")} {asset.width} {t("×")}{" "}
                                {asset.height} px
                                <br />
                                {locked[index]
                                  ? t("BOUNDARY LOCKED · prepared asset")
                                  : candidates[index]
                                    ? t("Uploaded · exact source size")
                                    : t("Direct import blocked: size mismatch")}
                              </p>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="field-note">
                      {t(
                        "Boundary Lock uses an aspect-preserving center crop and Lanczos resize, then admits only CHANGE pixels. Outside CHANGE stays exactly original. Raw candidates are retained. This is a separate, explicit preparation step; direct import never resizes.",
                      )}
                    </p>
                    <button
                      type="button"
                      className="button"
                      disabled={
                        !rawCandidates.every(Boolean) ||
                        !masks.keep ||
                        !sourceLabel.trim() ||
                        locked.every(Boolean)
                      }
                      onClick={() => void applyBoundaryLock()}
                    >
                      {busy
                        ? t("Preparing candidates…")
                        : t("Apply VowEdit Boundary Lock")}
                    </button>
                    <label htmlFor="source-label">{t("Source label")}</label>
                    <input
                      id="source-label"
                      value={sourceLabel}
                      maxLength={80}
                      onChange={(e) => {
                        setSourceLabel(e.target.value);
                        setLocked([null, null, null]);
                        setCandidates(
                          rawCandidates.map((c) =>
                            c &&
                            c.width === asset.width &&
                            c.height === asset.height
                              ? c
                              : null,
                          ),
                        );
                      }}
                    />
                    {!sourceLabel.trim() && (
                      <p className="error">
                        {t("Enter a source label (1–80 characters).")}
                      </p>
                    )}
                    <p className="field-note">
                      {t(
                        "Descriptive attribution supplied by you; this does not verify a direct API integration.",
                      )}
                    </p>
                    {!masks.keep && (
                      <p className="error">
                        {t(
                          "Import requires a painted KEEP region. Edit the contract to add one.",
                        )}
                      </p>
                    )}
                  </>
                )}
              </fieldset>
              <div className="summary-footer">
                <p>
                  <strong>{t("3 candidates")}</strong> ·{" "}
                  {mode === "import"
                    ? `Imported · ${sourceLabel.trim() || "External candidates"}`
                    : provider === "mock"
                      ? t("Mock simulation, no AI inference")
                      : t("Configured generation provider")}
                  <br />
                  <span className="muted">
                    {t("We check preservation. You judge the edit.")}
                  </span>
                </p>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    (mode === "generate" && !plan) ||
                    (mode === "import" &&
                      (!masks.keep || !importReady(candidates, sourceLabel)))
                  }
                  onClick={() => void generate()}
                >
                  {busy
                    ? t("Submitting…")
                    : mode === "import"
                      ? t("Evaluate imported candidates")
                      : t("Generate 3 candidates")}
                  <ArrowRight size={18} aria-hidden />
                </button>
              </div>
              {mode === "generate" &&
                (plan ? (
                  <PlanDetails plan={plan} />
                ) : (
                  <p role="status">{t("Preparing execution plan…")}</p>
                ))}
              <button
                className="text-button"
                disabled={busy || !!prepared}
                onClick={() => {
                  setMasks(null);
                  setPrepared(null);
                  maskAssets.current = null;
                  setLocked([null, null, null]);
                  setCandidates(
                    rawCandidates.map((c) =>
                      c && c.width === asset.width && c.height === asset.height
                        ? c
                        : null,
                    ),
                  );
                }}
              >
                <ArrowLeft size={15} aria-hidden />
                {t("Edit the contract")}
              </button>
            </div>
          ) : (
            <>
              <div className="editor-title">
                <span>{t("DEFINE YOUR BOUNDARIES")}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setAsset(null);
                    setPrepared(null);
                  }}
                >
                  {t("Change image")}
                </button>
              </div>
              <MaskEditor
                key={asset.id}
                asset={asset}
                initialStrokes={draftStrokes}
                initialMasks={draftMasks}
                onContinue={(value) => {
                  if (instruction.trim().length < 3) {
                    setError(
                      "Enter an edit instruction of at least 3 characters.",
                    );
                    return;
                  }
                  if (value.keepPixels && !keepLabel.trim()) {
                    setError("Name your KEEP region.");
                    return;
                  }
                  setError("");
                  setDraftStrokes(value.strokes);
                  setDraftMasks(value.seedMasks || {});
                  setMasks(value);
                }}
              />
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {localText(error, t)}
            </p>
          )}
          {busy && !summary && (
            <p role="status">{t("Preparing your image…")}</p>
          )}
        </section>
      </div>
    </main>
  );
}
