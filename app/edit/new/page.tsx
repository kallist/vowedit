"use client";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Upload, ShieldCheck } from "lucide-react";
import MaskEditor, {
  type MaskValue,
  type SeedMasks,
} from "@/frontend/MaskEditor";
import { api, ApiError, jsonPost, upload } from "@/frontend/api";
import type { Stroke } from "@/frontend/masks";
import { assetUrl, type Asset, type Run } from "@/frontend/types";
export default function NewEdit() {
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
    api<Run>("/runs", {
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
      setMasks(null);
      setDraftStrokes([]);
      setDraftMasks({});
      setPrepared(null);
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
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      let saved = prepared;
      if (!saved) {
        saved = {
          key: crypto.randomUUID(),
          change: await upload(masks.change, "mask"),
          keep: masks.keep ? await upload(masks.keep, "mask") : null,
        };
        setPrepared(saved);
      }
      const request = {
        source_image: asset.id,
        request_key: saved.key,
        provider,
        candidate_count: 3,
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
      const run = await api<Run>("/runs", jsonPost(request));
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
  const summary = !!masks;
  if (recoveringSubmission) {
    return (
      <main className="studio-page">
        <p className="eyebrow">RECOVER YOUR EDIT</p>
        <h1>One request. One edit.</h1>
        <p>
          We are checking your previous submission before starting another edit.
        </p>
        {busy ? (
          <p role="status">Recovering the original request…</p>
        ) : (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Retry submission recovery
            </button>
          </>
        )}
      </main>
    );
  }
  return (
    <main className="studio-page">
      <div className="page-intro">
        <div>
          <p className="eyebrow">
            THE STUDIO / {summary ? "02 — CONFIRM" : "01 — DEFINE"}
          </p>
          <h1>
            {summary
              ? "A promise, before the pixels."
              : "Make room for the right change."}
          </h1>
        </div>
        <span className="pill">
          {provider === "mock"
            ? "MOCK · pixel simulation"
            : "Configured provider"}
        </span>
      </div>
      <div className="workspace-grid">
        <aside className="contract-panel">
          <span className="section-number">YOUR INTENTION</span>
          <label htmlFor="instruction">What would you like to change?</label>
          <textarea
            id="instruction"
            value={instruction}
            disabled={summary || busy}
            maxLength={1500}
            placeholder="Change the jacket to white. Keep the character."
            onChange={(e) => setInstruction(e.target.value)}
          />
          <p className="field-note">
            Be specific. Prompt adherence is reviewed by you, not inferred from
            a pixel score.
          </p>
          <hr />
          <label htmlFor="keep-label">Name your KEEP region</label>
          <input
            id="keep-label"
            value={keepLabel}
            disabled={summary || busy}
            maxLength={60}
            onChange={(e) => setKeepLabel(e.target.value)}
          />
          <label htmlFor="threshold">
            Preservation threshold <span>{threshold}%</span>
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
            Protect everything outside CHANGE
          </label>
          <p className="field-note">
            “Background” means outside your painted edit area, not automatic
            scene segmentation.
          </p>
          <hr />
          <label htmlFor="provider">Generation source</label>
          <select
            id="provider"
            value={provider}
            disabled={summary || busy}
            onChange={(e) => setProvider(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {p === "mock" ? "Mock — deterministic demo" : p}
              </option>
            ))}
          </select>
          <p className="field-note">
            {provider === "mock"
              ? "No model call. Controlled edits and deliberate drift let you explore the entire product."
              : "Your image, CHANGE mask and instruction leave this app for the configured provider."}
          </p>
          <div className="quiet-note">
            <ShieldCheck size={20} aria-hidden />
            <p>
              KEEP is a measurable contract.
              <br />
              Not a promise from the model.
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
                Your image.
                <br />
                <em>Your boundaries.</em>
              </h2>
              <p>Drop an image here to begin.</p>
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg"
                hidden
                aria-label="Upload original image"
                onChange={(e) => {
                  if (e.target.files?.[0]) void choose(e.target.files[0]);
                }}
              />
              <button
                className="button primary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                Choose an image <ArrowRight size={17} aria-hidden />
              </button>
              <span className="caption">
                PNG OR JPEG · UP TO 10 MB · 32–1536 PX PER SIDE
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void fixture()}
              >
                Use Demo — image, instruction & masks
              </button>
            </div>
          ) : summary ? (
            <div className="summary-card">
              <div className="summary-heading">
                <span className="eyebrow">
                  EDIT CONTRACT / READY FOR YOUR REVIEW
                </span>
                <ShieldCheck size={25} aria-hidden />
              </div>
              <div className="summary-content">
                <img
                  src={assetUrl(asset.id)}
                  alt="Source image for this edit contract"
                />
                <div>
                  <span className="change-text eyebrow">CHANGE</span>
                  <h2>{instruction}</h2>
                  <p>{masks.changePixels.toLocaleString()} editable pixels</p>
                  <span className="keep-text eyebrow">KEEP</span>
                  <h3>
                    {masks.keepPixels ? keepLabel : "No painted KEEP region"}
                  </h3>
                  <p>
                    {background
                      ? `Outside CHANGE · ${threshold}% minimum preservation`
                      : "Outside CHANGE will be measured, without a hard threshold."}
                  </p>
                  <p>{masks.keepPixels.toLocaleString()} protected pixels</p>
                </div>
              </div>
              <div className="summary-footer">
                <p>
                  <strong>3 candidates</strong> ·{" "}
                  {provider === "mock"
                    ? "Mock simulation, no AI inference"
                    : "Configured generation provider"}
                  <br />
                  <span className="muted">
                    We check preservation. You judge the edit.
                  </span>
                </p>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void generate()}
                >
                  {busy ? "Submitting…" : "Generate 3 candidates"}
                  <ArrowRight size={18} aria-hidden />
                </button>
              </div>
              <button
                className="text-button"
                disabled={busy || !!prepared}
                onClick={() => {
                  setMasks(null);
                  setPrepared(null);
                }}
              >
                <ArrowLeft size={15} aria-hidden />
                Edit the contract
              </button>
            </div>
          ) : (
            <>
              <div className="editor-title">
                <span>DEFINE YOUR BOUNDARIES</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setAsset(null);
                    setPrepared(null);
                  }}
                >
                  Change image
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
              {error}
            </p>
          )}
          {busy && !summary && <p role="status">Preparing your image…</p>}
        </section>
      </div>
    </main>
  );
}
