"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, jsonPost } from "./api";
import { localText } from "./i18n/format";
import { useBridge } from "./Bridge";
import {
  DraftSaver,
  draftContract,
  submitDraft,
  type DraftData,
  type EditingDraft,
  type SaveStatus,
} from "./editingDrafts";
import MaskEditor, { type MaskValue, type SeedMasks } from "./MaskEditor";
import type { Stroke } from "./masks";
import PlanDetails from "./PlanDetails";
import type { Asset, CandidatePlan } from "./types";
import { useLocale } from "./i18n/LocaleProvider";

export default function DraftEditor({
  id,
  onOpenFull,
  onLoaded,
  onFlushReady,
}: {
  id: string;
  onOpenFull?: (id: string) => Promise<void>;
  onLoaded?: (draft: EditingDraft) => void;
  onFlushReady?: (flush: (() => Promise<void>) | undefined) => void;
}) {
  const bridge = useBridge();
  const { api, navigate } = bridge;
  const { t } = useLocale();
  const [draft, setDraft] = useState<EditingDraft>();
  const [data, setData] = useState<DraftData>();
  const [status, setStatus] = useState<SaveStatus>("Saved");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<CandidatePlan>();
  const [providers, setProviders] = useState<string[]>(["mock"]);
  const saver = useRef<DraftSaver | undefined>(undefined);
  const latest = useRef<DraftData | undefined>(undefined);
  const pending = useRef(false);
  useEffect(() => {
    onFlushReady?.(async () => {
      await saver.current?.flush();
    });
    return () => {
      onFlushReady?.(undefined);
    };
  }, [onFlushReady]);
  useEffect(() => {
    let live = true;
    api<EditingDraft>(`/editing-drafts/${id}`)
      .then((value) => {
        if (!live) return;
        if (value.submitted_run_id) {
          navigate(`/edit/${value.submitted_run_id}`);
          return;
        }
        latest.current = value.data;
        setDraft(value);
        setData(value.data);
        saver.current = new DraftSaver(value, api, (state, saved) => {
          if (live) {
            setStatus(state);
            setDraft(saved);
            if (state === "Saved") {
              latest.current = saved.data;
              setData(saved.data);
            }
          }
        });
        onLoaded?.(value);
        if (value.data.plan_fingerprint)
          void api<CandidatePlan>(
            "/candidate-plans",
            jsonPost({ instruction: value.data.instruction }),
          ).then(setPlan);
      })
      .catch(() => {
        if (live) setError("Connection failed. Reconnect to local VowEdit.");
      });
    void api<{ providers: string[] }>("/config")
      .then((config) => {
        if (live) setProviders(config.providers);
      })
      .catch(() => {});
    return () => {
      live = false;
      saver.current?.dispose();
    };
  }, [id, api, navigate, onLoaded]);
  const change = useCallback((patch: Partial<DraftData>, invalidate = true) => {
    const current = latest.current;
    if (!current) return;
    const next = { ...current, ...patch };
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    if (invalidate) {
      next.checkpoint = { change: null, keep: null };
      next.plan_fingerprint = null;
      next.effective_candidates = next.raw_candidates.map(() => null);
      setPlan(undefined);
    }
    latest.current = next;
    setData(next);
    saver.current?.set(next);
  }, []);
  const snapshot = useCallback(
    (strokes: Stroke[], seeds: SeedMasks) => {
      const current = latest.current;
      if (!current) return;
      const keepSeed = seeds.keep ? current.seed_masks.keep : null;
      const changeSeed = seeds.change ? current.seed_masks.change : null;
      change({ strokes, seed_masks: { change: changeSeed, keep: keepSeed } });
    },
    [change],
  );
  async function guarded(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof ApiError && error.status !== 409
          ? error.message
          : "Action failed. Your saved state remains available.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function checkpoint(value: MaskValue) {
    await guarded(async () => {
      const current = await saver.current!.flush();
      if (current.data.instruction.trim().length < 3)
        throw new Error("INTENT_REQUIRED");
      const c = await bridge.upload(value.change, "mask");
      const k = value.keep ? await bridge.upload(value.keep, "mask") : null;
      const compiled = await bridge.api<CandidatePlan>(
        "/candidate-plans",
        jsonPost({ instruction: current.data.instruction }),
      );
      change(
        {
          checkpoint: { change: c.id, keep: k?.id || null },
          plan_fingerprint: compiled.fingerprint,
        },
        false,
      );
      await saver.current!.flush();
      setPlan(compiled);
    });
  }
  async function importFile(index: number, file: File) {
    await guarded(async () => {
      const asset = await bridge.upload(file, "candidate");
      const d = latest.current!;
      const raw = [...d.raw_candidates];
      raw[index] = asset.id;
      const effective = [...d.effective_candidates];
      effective[index] =
        draft &&
        asset.width === draft.source_size[0] &&
        asset.height === draft.source_size[1]
          ? asset.id
          : null;
      change({ raw_candidates: raw, effective_candidates: effective }, false);
      await saver.current!.flush();
    });
  }
  async function prepare() {
    await guarded(async () => {
      const saved = await saver.current!.flush();
      const ids = [];
      for (const raw of saved.data.raw_candidates) {
        const prepared = await bridge.api<Asset>(
          "/prepared-candidates",
          jsonPost({
            source_image: saved.source_image,
            candidate_image: raw,
            source_label: saved.data.source_label,
            contract: draftContract(saved.data),
          }),
        );
        ids.push(prepared.id);
      }
      change({ effective_candidates: ids }, false);
      await saver.current!.flush();
    });
  }
  async function generate() {
    await guarded(async () => {
      const saved = await saver.current!.flush();
      const storageKey = `vowedit.submit:${id}`;
      const key =
        (await bridge.commands.get(storageKey)) || crypto.randomUUID();
      await bridge.commands.set(storageKey, key);
      const run = await submitDraft(bridge.api, saved, key);
      await bridge.commands.remove(storageKey);
      bridge.navigate(`/edit/${run.id}`);
    });
  }
  if (!draft || !data)
    return (
      <p role="status">
        {error
          ? t("Connection failed. Reconnect to local VowEdit.")
          : t("Loading saved edit…")}
      </p>
    );
  const asset: Asset = {
    id: draft.source_image,
    width: draft.source_size[0],
    height: draft.source_size[1],
    url: "",
  };
  const seeds: SeedMasks = {};
  if (data.seed_masks.change)
    seeds.change = bridge.assetUrl(data.seed_masks.change);
  if (data.seed_masks.keep) seeds.keep = bridge.assetUrl(data.seed_masks.keep);
  if (
    (data.seed_masks.change && !seeds.change) ||
    (data.seed_masks.keep && !seeds.keep)
  )
    return <p role="status">{t("Loading saved edit…")}</p>;
  return (
    <main className="draft-editor">
      <p className="eyebrow">{t("Material → Define → Re-edit → Inspect")}</p>
      <p role="status" aria-live="polite">
        {t(status)} · {t("Only server-acknowledged changes are restored.")}
      </p>
      {status === "Conflict" && (
        <p role="alert">
          {t(
            "Another view changed this draft. Local edits are retained. Reload to discard them and read the saved state.",
          )}
        </p>
      )}
      <button disabled={busy} onClick={() => window.location.reload()}>
        {t("Reload saved state")}
      </button>
      <fieldset disabled={busy || status === "Conflict"}>
        <MaskEditor
          key={draft.id}
          asset={asset}
          initialStrokes={data.strokes}
          initialMasks={seeds}
          onSnapshot={snapshot}
          onContinue={(value) => void checkpoint(value)}
        />
        <label>
          {t("What would you like to change?")}
          <textarea
            aria-label={t("What would you like to change?")}
            value={data.instruction}
            maxLength={1500}
            onChange={(e) => change({ instruction: e.target.value })}
          />
        </label>
        <label>
          {t("Name your KEEP region")}
          <input
            aria-label={t("Name your KEEP region")}
            value={data.keep_label}
            maxLength={60}
            onChange={(e) => change({ keep_label: e.target.value })}
          />
        </label>
        <label>
          {t("Preservation threshold")}
          <input
            type="number"
            aria-label={t("Preservation threshold")}
            min={0}
            max={100}
            value={data.threshold}
            onChange={(e) => change({ threshold: +e.target.value })}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={data.background}
            onChange={(e) => change({ background: e.target.checked })}
          />
          {t("Protect everything outside CHANGE")}
        </label>
        <label>
          {t("Choose candidate source")}
          <select
            aria-label={t("Choose candidate source")}
            value={data.mode}
            onChange={(e) =>
              change({ mode: e.target.value as DraftData["mode"] }, false)
            }
          >
            <option value="generate">
              {t("Generate with configured provider")}
            </option>
            <option value="import">{t("Import 3 candidates")}</option>
          </select>
        </label>
        {data.mode === "generate" ? (
          <label>
            {t("Generation source")}
            <select
              aria-label={t("Generation source")}
              value={data.provider}
              onChange={(e) =>
                change(
                  { provider: e.target.value as DraftData["provider"] },
                  false,
                )
              }
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p === "mock" ? t("Mock — deterministic demo") : p}
                </option>
              ))}
            </select>
            {!providers.includes(data.provider) && (
              <p role="alert">
                {t("This provider is not configured or cannot be reached.")}
              </p>
            )}
          </label>
        ) : (
          <>
            <label>
              {t("Source label")}
              <input
                aria-label={t("Source label")}
                value={data.source_label}
                maxLength={80}
                onChange={(e) => change({ source_label: e.target.value })}
              />
            </label>
            {[0, 1, 2].map((index) => (
              <label key={index}>
                {t("Upload Candidate")} {String.fromCharCode(65 + index)}
                <input
                  aria-label={`${t("Upload Candidate")} ${String.fromCharCode(65 + index)}`}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      void importFile(index, e.target.files[0]);
                  }}
                />
                {data.raw_candidates[index] && (
                  <img
                    alt={`${t("Candidate")} ${String.fromCharCode(65 + index)}`}
                    src={bridge.assetUrl(
                      data.effective_candidates[index] ||
                        data.raw_candidates[index]!,
                    )}
                  />
                )}
                {data.raw_candidates[index] &&
                  !data.effective_candidates[index] && (
                    <span>{t("Direct import blocked: size mismatch")}</span>
                  )}
              </label>
            ))}
            <button
              disabled={
                !data.raw_candidates.every(Boolean) || !data.checkpoint.keep
              }
              onClick={() => void prepare()}
            >
              {t("Apply VowEdit Boundary Lock")}
            </button>
            <p>
              {t("Outside CHANGE stays exactly original.")}{" "}
              {t(
                "Preservation reflects boundary enforcement, not model quality.",
              )}
            </p>
          </>
        )}
        {plan && <PlanDetails plan={plan} />}
        <button
          className="button primary wide"
          disabled={
            !data.checkpoint.change ||
            (data.mode === "generate"
              ? !data.plan_fingerprint || !providers.includes(data.provider)
              : !data.checkpoint.keep ||
                !data.effective_candidates.every(Boolean) ||
                !data.source_label.trim())
          }
          onClick={() => void generate()}
        >
          {data.mode === "generate"
            ? t("Generate 3 candidates")
            : t("Evaluate imported candidates")}
        </button>
        {onOpenFull && (
          <button
            onClick={() =>
              void guarded(async () => {
                await saver.current!.flush();
                await onOpenFull(id);
              })
            }
          >
            {t("Fine editing in full workbench")}
          </button>
        )}
      </fieldset>
      {error && <p role="alert">{localText(error, t)}</p>}
    </main>
  );
}
