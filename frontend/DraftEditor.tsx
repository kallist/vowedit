"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, jsonPost, upload } from './api';
import type { EditingDraft, AgentAction } from './agentTypes';
import type { Contract } from './types';
import MaskEditor, { type MaskValue } from './MaskEditor';
import PlanDetails from './PlanDetails';
import AgentActions from './AgentActions';
import ActivityPanel from './ActivityPanel';
import { useLocale } from './i18n/LocaleProvider';

export default function DraftEditor({ id }: { id: string }) {
  const { t } = useLocale(); const router = useRouter();
  const [draft, setDraft] = useState<EditingDraft | null>(null), [instruction, setInstruction] = useState('');
  const [provider, setProvider] = useState('mock'), [dirty, setDirty] = useState(false), [painting, setPainting] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [conflict, setConflict] = useState(false);
  const [contractDraft, setContractDraft] = useState<Contract | null>(null);
  const [keepIndex, setKeepIndex] = useState(0);
  const [providers, setProviders] = useState<string[]>(['mock']);
  const savedRevision = useRef<number | null>(null), localDirty = useRef(false), pending = useRef(false);
  const presentedRevision = useRef('');
  const draftForPresentation = useRef<EditingDraft | null>(null); draftForPresentation.current=draft;
  const [presented, setPresented] = useState(false), [retrySave, setRetrySave] = useState(false);
  const acceptSnapshot = useCallback((value: EditingDraft) => {
    setDraft(value); savedRevision.current = value.revision;
    setInstruction(value.instruction || value.contract?.change.instruction || ''); setProvider(value.provider); setContractDraft(value.contract);
    localDirty.current = false; setDirty(false); setConflict(false); setRetrySave(Boolean(sessionStorage.getItem(`vowedit.draft-save:${id}`))); setPresented(presentedRevision.current === `${id}:${value.revision}`);
  }, [id]);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const value = await api<EditingDraft>(`/agent/editing-drafts/${id}`);
        if (!live || pending.current) return;
        if (localDirty.current && savedRevision.current !== value.revision) setConflict(true);
        else if (!localDirty.current && savedRevision.current !== value.revision) acceptSnapshot(value);
        else setDraft(previous => previous ? {...previous, pending_requests: value.pending_requests, submitted_run_id: value.submitted_run_id} : value);
      } catch (e) { if (live) setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); }
    }
    setRetrySave(Boolean(sessionStorage.getItem(`vowedit.draft-save:${id}`)));
    void load(); void api<{providers: string[]}>('/config')
      .then(c => { if (live) setProviders(c.providers); })
      .catch(e => { if (live) setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); });
    const timer = setInterval(() => void load(), 1500);
    return () => { live = false; clearInterval(timer); };
  }, [id, acceptSnapshot, t]);
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) { if (localDirty.current) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    const draft = draftForPresentation.current;
    if (!draft || localDirty.current || presentedRevision.current === `${id}:${draft.revision}`) return;
    let live = true;
    const assets = [draft.source_asset_id, draft.contract?.change.mask, ...(draft.contract?.keep.map(k => k.mask) || [])].filter(Boolean);
    void Promise.all(assets.map(async asset => { const image = new Image(); image.src = `/api/assets/${asset}`; await image.decode(); }))
      .then(async () => { if (live && document.visibilityState === 'visible') {
        await api(`/editing-drafts/${id}/presented`, jsonPost({expected_revision: draft.revision}));
        if (live) {presentedRevision.current = `${id}:${draft.revision}`; setPresented(true);}
      }}).catch(() => { if (live) setPresented(false); });
    return () => { live = false; };
  }, [draft?.revision, id]);
  function changeLocal() { localDirty.current = true; setDirty(true); }
  async function save(contract = contractDraft, source = draft?.source_asset_id || null, masks?: MaskValue) {
    if (!draft || pending.current) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const body = { expected_revision: draft.revision, request_key: crypto.randomUUID(), source_asset_id: source,
        contract, instruction, provider, strokes: masks?.strokes || draft.strokes };
      // Keep the exact key/payload for a lost response; retry uses this saved request.
      const key = `vowedit.draft-save:${id}`;
      const previous = sessionStorage.getItem(key);
      const request = previous ? JSON.parse(previous) : body;
      sessionStorage.setItem(key, JSON.stringify(request));
      const value = await api<EditingDraft>(`/editing-drafts/${id}`, {...jsonPost(request), method: 'PUT'});
      sessionStorage.removeItem(key); acceptSnapshot(value); setPainting(false); setMessage(t('Saved'));
      if (value.id !== id) router.push(`/drafts/${value.id}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); setRetrySave(true); }
    finally { pending.current = false; setBusy(false); }
  }
  async function attach(file: File) {
    if (busy || pending.current) return;
    setBusy(true);
    try { const asset = await upload(file, 'original'); await save(null, asset.id); }
    catch (e) { setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); }
    finally { setBusy(false); }
  }
  async function paint(value: MaskValue) {
    if (!draft || busy || pending.current) return;
    setBusy(true);
    try {
      const change = await upload(value.change, 'mask'), keep = value.keep ? await upload(value.keep, 'mask') : null;
      const contract: Contract = {change: {instruction: instruction || 'Change this region', mask: change.id},
        keep: contractDraft?.keep.length ? contractDraft.keep.flatMap((rule, index) => index === keepIndex ? (keep ? [{...rule, mask:keep.id}] : []) : [rule]) : (keep ? [{type: 'manual_region', label: 'KEEP', mask: keep.id, threshold: 98}] : []), background_threshold: contractDraft?.background_threshold ?? 98};
      await save(contract, draft.source_asset_id, value);
    } catch (e) { setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); } finally { setBusy(false); }
  }
  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const value = await api<EditingDraft>(`/agent/editing-drafts/${id}`);
      sessionStorage.removeItem(`vowedit.draft-save:${id}`);
      acceptSnapshot(value); setPainting(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.')); }
    finally { pending.current = false; setBusy(false); }
  }
  function applied(action: AgentAction) {
    if (action.result_ids.run_id) router.push(`/edit/${action.result_ids.run_id}`);
    else void reload();
  }
  async function reviewGeneration() {
    if (!draft?.plan || dirty || busy || conflict) return;
    setBusy(true);
    try {
      await api(`/editing-drafts/${id}/generation-request`, jsonPost({action: 'generate',
        draft_id:id, expected_revision:draft.revision, plan_fingerprint:draft.plan.fingerprint,
        provider:draft.provider, request_key:crypto.randomUUID()}));
      await reload();
    } catch(e) {setMessage(e instanceof Error ? e.message : t('Unable to save. Reload or try again.'));}
    finally {setBusy(false);}
  }
  if (!draft) return <main className="studio-page"><h1>{t('Recoverable editing draft')}</h1><p role="status">{message || t('Loading…')}</p></main>;
  const asset = draft.source_asset_id && draft.source_dimensions ? {id: draft.source_asset_id,
    ...draft.source_dimensions, url: `/api/assets/${draft.source_asset_id}`} : null;
  return (
    <main className="studio-page draft-page">
      <div className="draft-heading">
        <h1>{t("Recoverable editing draft")}</h1>
        <p className="draft-save-state" role="status">
          {dirty
            ? t("Unsaved; closing may lose unacknowledged changes.")
            : t("Saved")}{" "}
          · revision {draft.revision}
        </p>
      </div>
      <p>
        {t(
          "Agent suggestions are pending. You control the saved contract and every execution.",
        )}
      </p>
      {message && <p role="alert">{message}</p>}
      {retrySave && (
        <section role="alert">
          <p>
            {t(
              "Save acknowledgement missing. Retry the same request or reload saved state.",
            )}
          </p>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void save()}
          >
            {t("Retry pending save")}
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void reload()}
          >
            {t("Reload and discard local edits")}
          </button>
        </section>
      )}
      {conflict && (
        <section role="alert">
          <p>
            {t(
              "Saved state changed. Local edits are preserved; reload discards them.",
            )}
          </p>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void reload()}
          >
            {t("Reload and discard local edits")}
          </button>
        </section>
      )}
      {draft.submitted_run_id ? (
        <Link
          className="primary-button"
          href={`/edit/${draft.submitted_run_id}`}
        >
          {t("Open submitted edit")}
        </Link>
      ) : (
        <>
          <div className="draft-workspace">
            <section className="draft-source">
              <label>
                {asset
                  ? t("Replace original in a new draft")
                  : t("Attach original image")}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy || retrySave}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void attach(e.target.files[0]);
                  }}
                />
              </label>
              {asset && (
                <figure className="draft-original">
                  <img src={asset.url} alt={t("Original")} />
                  <figcaption>
                    {t("Original")} · {asset.width} × {asset.height}
                  </figcaption>
                </figure>
              )}
              {draft.contract && (
                <div className="draft-previews">
                  <figure>
                    <img
                      src={`/api/assets/${draft.contract.change.mask}`}
                      alt={t("Saved CHANGE mask")}
                    />
                    <figcaption>CHANGE</figcaption>
                  </figure>
                  {draft.contract.keep.map((k) => (
                    <figure key={k.mask}>
                      <img src={`/api/assets/${k.mask}`} alt={k.label} />
                      <figcaption>
                        KEEP · {k.label} · {k.threshold}%
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
            <section className="draft-contract">
              <label>
                {t("Original instruction")}
                <textarea
                  value={instruction}
                  maxLength={1500}
                  onChange={(e) => {
                    setInstruction(e.target.value);
                    changeLocal();
                  }}
                  disabled={busy || retrySave}
                />
              </label>
              <label>
                {t("Provider")}
                <select
                  value={provider}
                  disabled={busy || retrySave}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    changeLocal();
                  }}
                >
                  {providers.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {contractDraft && (
                <>
                  <label>
                    {t("Background threshold")}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={contractDraft.background_threshold ?? 98}
                      disabled={busy || retrySave}
                      onChange={(e) => {
                        setContractDraft({
                          ...contractDraft,
                          background_threshold: Number(e.target.value),
                        });
                        changeLocal();
                      }}
                    />
                  </label>
                  {contractDraft.keep.map((rule, index) => (
                    <label key={rule.mask}>
                      KEEP · {rule.label}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={rule.threshold}
                        disabled={busy || retrySave}
                        onChange={(e) => {
                          setContractDraft({
                            ...contractDraft,
                            keep: contractDraft.keep.map((r, i) =>
                              i === index
                                ? { ...r, threshold: Number(e.target.value) }
                                : r,
                            ),
                          });
                          changeLocal();
                        }}
                      />
                    </label>
                  ))}
                </>
              )}
              <div className="draft-controls">
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    conflict ||
                    retrySave ||
                    (contractDraft !== null && instruction.trim().length < 3)
                  }
                  onClick={() =>
                    void save(
                      contractDraft
                        ? {
                            ...contractDraft,
                            change: { ...contractDraft.change, instruction },
                          }
                        : null,
                    )
                  }
                >
                  {t("Save contract")}
                </button>
                {asset && (
                  <button
                    className="secondary-button"
                    disabled={busy || retrySave}
                    onClick={() => {
                      setPainting(true);
                      changeLocal();
                    }}
                  >
                    {t("Paint or refine boundaries")}
                  </button>
                )}
              </div>
              {contractDraft && contractDraft.keep.length > 1 && (
                <label>
                  {t("KEEP region to refine")}
                  <select
                    value={keepIndex}
                    disabled={busy || retrySave}
                    onChange={(e) => {
                      setKeepIndex(Number(e.target.value));
                      setPainting(false);
                    }}
                  >
                    {contractDraft.keep.map((k, i) => (
                      <option key={k.mask} value={i}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {draft.plan && <PlanDetails plan={draft.plan} />}
              {draft.plan && (
                <button
                  className="secondary-button"
                  disabled={
                    busy || dirty || conflict || retrySave || !presented
                  }
                  onClick={() => void reviewGeneration()}
                >
                  {t("Review generation")}
                </button>
              )}
            </section>
          </div>
          {painting && asset && (
            <MaskEditor
              key={`${id}:${draft.revision}:${keepIndex}`}
              asset={asset}
              initialStrokes={[]}
              initialMasks={{
                change: draft.contract
                  ? `/api/assets/${draft.contract.change.mask}`
                  : undefined,
                keep: contractDraft?.keep[keepIndex]
                  ? `/api/assets/${contractDraft.keep[keepIndex].mask}`
                  : undefined,
              }}
              onContinue={(value) => void paint(value)}
            />
          )}
          <AgentActions
            actions={draft.pending_requests}
            disabled={busy || dirty || conflict || retrySave || !presented}
            onApplied={applied}
          />
        </>
      )}
      {draft.parent_run_id && (
        <Link href={`/edit/${draft.parent_run_id}`}>{t("Parent edit")}</Link>
      )}
      <ActivityPanel kind="draft" id={id} />
      <Link
        href="/"
        onClick={(e) => {
          if (localDirty.current) {
            e.preventDefault();
            setMessage(t("Save or discard local edits before leaving."));
          }
        }}
      >
        {t("Back to studio")}
      </Link>
    </main>
  );
}
