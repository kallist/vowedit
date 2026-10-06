import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BridgeProvider } from "../frontend/Bridge";
import DraftEditor from "../frontend/DraftEditor";
import ResultPage from "../frontend/ResultPage";
import { LocaleProvider, useLocale } from "../frontend/i18n/LocaleProvider";
import { jsonPost } from "../frontend/api";
import { type EditingDraft } from "../frontend/editingDrafts";
import { type Run, type Starter } from "../frontend/types";
import {
  apiBase,
  compatible,
  extensionOrigin,
  fullURL,
  isUUID,
  makeClient,
  validCredential,
} from "./client";
import { BlobAssets, copyPNG, downloadPNG } from "./assets";
import {
  clearCredential,
  commandStorage,
  initializeStorage,
  localeStorage,
  preferences,
  saveCredential,
  savePointer,
  setPort,
  type Credential,
  type Pointer,
} from "./storage";
import "./panel.css";

function Panel() {
  const { t, locale, setLocale } = useLocale();
  const [port, changePort] = useState(8000);
  const [portInput, setPortInput] = useState("8000");
  const [credential, setCredential] = useState<Credential>();
  const [pointer, setPointer] = useState<Pointer>({});
  const [connection, setConnection] = useState("Connecting…");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportId, setExportId] = useState<string>();
  const [assetEpoch, resetAssets] = useState(0);
  const actionPending = useRef(false);
  const draftFlush = useRef<(() => Promise<void>) | undefined>(undefined);
  const flushReady = useCallback((flush: (() => Promise<void>) | undefined) => {
    draftFlush.current = flush;
  }, []);
  const [, renderAssets] = useState(0);
  const origin = extensionOrigin(chrome.runtime.id);
  const client = useMemo(
    () => makeClient(port, credential),
    [port, credential],
  );
  const assets = useMemo(() => {
    void pointer.draft;
    void pointer.run;
    void assetEpoch;
    return new BlobAssets(client, () => renderAssets((n) => n + 1));
  }, [client, pointer.draft, pointer.run, assetEpoch]);
  useEffect(() => () => assets.dispose(), [assets]);
  const pointTo = useCallback(async (next: Pointer) => {
    await savePointer(next);
    setPointer(next);
  }, []);
  useEffect(() => {
    if (connection !== "Connected") return;
    let live = true;
    void commandStorage
      .get("vowedit.create:pending")
      .then(async (stored) => {
        if (!stored || !live) return;
        const body = JSON.parse(stored) as {
          source_image: string;
          request_key: string;
          data?: { continuation_starter_id: string };
        };
        if (
          !isUUID(body.source_image) ||
          !isUUID(body.request_key) ||
          (body.data && !isUUID(body.data.continuation_starter_id))
        )
          throw new Error("INVALID_COMMAND_POINTER");
        const draft = await client.api<EditingDraft>(
          "/editing-drafts",
          jsonPost(body),
        );
        if (live) {
          await pointTo({ draft: draft.id });
          await commandStorage.remove("vowedit.create:pending");
        }
      })
      .catch(() => {
        if (live)
          setMessage("Action failed. Your saved state remains available.");
      });
    return () => {
      live = false;
    };
  }, [connection, client, pointTo]);
  const openFull = useCallback(async (route: string) => {
    const url = fullURL(route);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 4000);
    try {
      const response = await fetch(url, {
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: timeout.signal,
      });
      if (!response.ok) throw new Error("FULL_UI_OFFLINE");
      await chrome.tabs.create({ url });
    } catch {
      setMessage("Full workbench offline. Start Next on port 3000.");
      throw new Error("FULL_UI_OFFLINE");
    } finally {
      clearTimeout(timer);
    }
  }, []);
  const navigate = useCallback(
    (route: string) => {
      const parsed = new URL(fullURL(route));
      const run = parsed.pathname.match(/^\/edit\/([^/]+)$/)?.[1];
      const starter = parsed.searchParams.get("draft");
      if (run && isUUID(run)) {
        void pointTo({ run });
        return;
      }
      if (starter && isUUID(starter)) {
        void client
          .api<Starter>(`/drafts/${starter}`)
          .then(async (value) => {
            const keyName = `vowedit.create:${value.id}`;
            const key =
              (await commandStorage.get(keyName)) || crypto.randomUUID();
            await commandStorage.set(keyName, key);
            await commandStorage.set(
              "vowedit.create:pending",
              JSON.stringify({
                source_image: value.source_image,
                request_key: key,
                data: { continuation_starter_id: value.id },
              }),
            );
            const draft = await client.api<EditingDraft>(
              "/editing-drafts",
              jsonPost({
                source_image: value.source_image,
                request_key: key,
                data: { continuation_starter_id: value.id },
              }),
            );
            await pointTo({ draft: draft.id });
            await commandStorage.remove(keyName);
            await commandStorage.remove("vowedit.create:pending");
          })
          .catch(() =>
            setMessage("Action failed. Your saved state remains available."),
          );
      } else if (parsed.pathname === "/edit/new") {
        void pointTo({});
      } else {
        void openFull(route).catch(() => {});
      }
    },
    [pointTo, client, openFull],
  );
  const bridge = useMemo(
    () => ({
      ...client,
      assetUrl: (id: string, recipe?: "normalized-raw") =>
        assets.get(id, recipe),
      navigate,
      commands: commandStorage,
    }),
    [client, assets, navigate],
  );
  const reconnect = useCallback(
    async (apiPort: number, paired?: Credential) => {
      setConnection("Connecting…");
      resetAssets((n) => n + 1);
      try {
        const capabilities =
          await makeClient(apiPort).api<unknown>("/capabilities");
        if (!compatible(capabilities)) {
          setConnection("Update local VowEdit");
          return;
        }
        if (!paired) {
          setConnection("Pairing required");
          return;
        }
        await makeClient(apiPort, paired).api("/config");
        setConnection("Connected");
      } catch (error) {
        const status = (error as { status?: number }).status;
        setConnection(
          status === 404
            ? "Update local VowEdit"
            : status === 401 || status === 403
              ? "Pairing required"
              : "Local API offline or blocked",
        );
      }
    },
    [],
  );
  useEffect(() => {
    void preferences()
      .then((values) => {
        const p = values.port || 8000;
        apiBase(p);
        const c =
          validCredential(values.credential) &&
          values.credential.origin === origin &&
          values.credential.expires_at > Date.now() / 1000
            ? values.credential
            : undefined;
        changePort(p);
        setPortInput(String(p));
        setCredential(c);
        const next = values.pointer || {};
        if (
          (!next.draft || isUUID(next.draft)) &&
          (!next.run || isUUID(next.run))
        )
          setPointer(next);
        return reconnect(p, c);
      })
      .catch(() => setConnection("Trusted storage unavailable"));
  }, [origin, reconnect]);
  useEffect(() => {
    setExportId(undefined);
    if (!pointer.run || connection !== "Connected") return;
    let live = true;
    const refresh = async () => {
      if (document.hidden) return;
      const run = await client.api<Run>(`/runs/${pointer.run}`);
      const adopted = run.candidates.find(
        (candidate) => candidate.id === run.user_selected_candidate_id,
      );
      if (live) setExportId(adopted?.image);
    };
    void refresh().catch(() => {});
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pointer.run, client, connection]);
  async function choose(file: File) {
    if (actionPending.current || connection !== "Connected") return;
    actionPending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (
        !["image/png", "image/jpeg"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw new Error("INVALID_IMAGE");
      await draftFlush.current?.();
      const source = await client.upload(file, "original");
      const keyName = `vowedit.create:${source.id}`;
      const key = crypto.randomUUID();
      await commandStorage.set(keyName, key);
      await commandStorage.set(
        "vowedit.create:pending",
        JSON.stringify({ source_image: source.id, request_key: key }),
      );
      const draft = await client.api<EditingDraft>(
        "/editing-drafts",
        jsonPost({ source_image: source.id, request_key: key }),
      );
      await pointTo({ draft: draft.id });
      await commandStorage.remove(keyName);
      await commandStorage.remove("vowedit.create:pending");
    } catch {
      setMessage(
        "Upload PNG or JPEG bytes, up to 10 MB and 1536 pixels per side.",
      );
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  async function pair() {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!/^[0-9a-f]{40}$/.test(code.trim()))
        throw new Error("PAIRING_REFUSED");
      const publicClient = makeClient(port, undefined, (url, init) =>
        fetch(url, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            "X-VowEdit-Extension-Origin": origin,
          },
        }),
      );
      const result = await publicClient.api<Credential>(
        "/browser-pairing/exchange",
        jsonPost({ code: code.trim(), origin }),
      );
      await saveCredential(result);
      setCode("");
      setCredential(result);
      await reconnect(port, result);
    } catch {
      setMessage(
        "Pairing refused or expired. Approve a new code in the full workbench.",
      );
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  async function unpair() {
    let revoked = false;
    try {
      await client.api("/browser-pairing/current", { method: "DELETE" });
      revoked = true;
    } catch {
      /* Explicit offline removal. */
    }
    await clearCredential();
    setCredential(undefined);
    setPointer({});
    setConnection("Pairing required");
    setMessage(
      revoked
        ? "Pairing revoked."
        : "Removed locally. Server authorization remains; revoke it in the full workbench.",
    );
  }
  async function exportFinal(copy: boolean) {
    if (!exportId) return;
    try {
      const blob = await assets.blob(exportId);
      if (copy) {
        await copyPNG(blob);
        setMessage("Adopted final PNG copied.");
      } else {
        downloadPNG(blob, exportId);
        setMessage("Adopted final PNG download started.");
      }
    } catch {
      setMessage("Copy failed. Download the adopted final PNG instead.");
    }
  }
  return (
    <BridgeProvider value={bridge}>
      <div
        onDragOverCapture={(event) => event.preventDefault()}
        onDropCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const file = event.dataTransfer.files[0];
          if (file) void choose(file);
          else
            setMessage(
              "Copy an image, then paste or upload. URLs and HTML are not fetched.",
            );
        }}
        onPasteCapture={(event) => {
          const file = [...event.clipboardData.items]
            .find((item) => item.kind === "file")
            ?.getAsFile();
          if (file) {
            event.preventDefault();
            event.stopPropagation();
            void choose(file);
          }
        }}
      >
        <header className="panel-header">
          <strong>VowEdit</strong>
          <span role="status" aria-live="polite">
            {t(connection as Parameters<typeof t>[0])}
          </span>
          <button
            aria-label={t("Interface language")}
            onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
          >
            {locale === "en" ? "中文" : "English"}
          </button>
          <button onClick={() => void reconnect(port, credential)}>
            {t("Reconnect")}
          </button>
        </header>
        {connection === "Pairing required" && (
          <section>
            <h1>{t("Re-edit beside your AI.")}</h1>
            <p>
              {t("Extension ID")}: <code>{chrome.runtime.id}</code>
            </p>
            <p>
              {t(
                "Approve access to local VowEdit history and editing commands. Real generation uses your configured provider.",
              )}
            </p>
            <button
              onClick={() =>
                void openFull(
                  `/settings/browser?extension_id=${chrome.runtime.id}`,
                ).catch(() => {})
              }
            >
              {t("Open VowEdit Pairing Page")}
            </button>
            <label>
              {t("One-time pairing code")}
              <input
                type="password"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button disabled={busy || !code} onClick={() => void pair()}>
              {t("Pair extension")}
            </button>
          </section>
        )}
        {(connection === "Connected" ||
          (credential && (pointer.draft || pointer.run))) && (
          <fieldset
            className="panel-work"
            disabled={connection !== "Connected"}
          >
            {pointer.draft ? (
              <DraftEditor
                key={pointer.draft}
                id={pointer.draft}
                onFlushReady={flushReady}
                onOpenFull={(id) => openFull(`/edit/new?editing_draft=${id}`)}
              />
            ) : pointer.run ? (
              <>
                <div className="export-actions">
                  <button
                    disabled={!exportId}
                    onClick={() => void exportFinal(true)}
                  >
                    {t("Copy adopted final PNG")}
                  </button>
                  <button
                    disabled={!exportId}
                    onClick={() => void exportFinal(false)}
                  >
                    {t("Download adopted final PNG")}
                  </button>
                  <button
                    onClick={() =>
                      void openFull(`/edit/${pointer.run}#report`).catch(
                        () => {},
                      )
                    }
                  >
                    {t("Open full report")}
                  </button>
                </div>
                <ResultPage key={pointer.run} id={pointer.run} />
              </>
            ) : (
              <section
                className="handoff"
                onPaste={(e) => {
                  const file = [...e.clipboardData.items]
                    .find((item) => item.kind === "file")
                    ?.getAsFile();
                  if (file) {
                    e.preventDefault();
                    void choose(file);
                  } else
                    setMessage(
                      "Copy an image, then paste or upload. URLs and HTML are not fetched.",
                    );
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0])
                    void choose(e.dataTransfer.files[0]);
                  else
                    setMessage(
                      "Copy an image, then paste or upload. URLs and HTML are not fetched.",
                    );
                }}
                tabIndex={0}
              >
                <h1>{t("Your image.")}</h1>
                <p>{t("Paste, drop, or upload a PNG/JPEG image.")}</p>
                <input
                  type="file"
                  aria-label={t("Upload original image")}
                  accept="image/png,image/jpeg"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void choose(e.target.files[0]);
                  }}
                />
                <p>{t("No page collection. File handoff only.")}</p>
              </section>
            )}
            {(pointer.draft || pointer.run) && (
              <label>
                {t("Upload another source")}
                <input
                  aria-label={t("Upload another source")}
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.files?.[0])
                      void choose(event.target.files[0]);
                  }}
                />
              </label>
            )}
            <button disabled={busy} onClick={() => void unpair()}>
              {t("Unpair")}
            </button>
          </fieldset>
        )}
        <details>
          <summary>{t("Advanced connection settings")}</summary>
          <label>
            {t("Local API port")}
            <input
              type="number"
              min={1024}
              max={65535}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            onClick={() => {
              const p = Number(portInput);
              try {
                apiBase(p);
              } catch {
                setMessage("Enter a port from 1024 to 65535.");
                return;
              }
              setBusy(true);
              void setPort(p)
                .then(() => {
                  changePort(p);
                  setCredential(undefined);
                  setPointer({});
                  return reconnect(p);
                })
                .catch(() => setConnection("Trusted storage unavailable"))
                .finally(() => setBusy(false));
            }}
          >
            {t("Change port and pair again")}
          </button>
        </details>
        {message && <p role="alert">{t(message as Parameters<typeof t>[0])}</p>}
      </div>
    </BridgeProvider>
  );
}
initializeStorage()
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <LocaleProvider storage={localeStorage}>
        <Panel />
      </LocaleProvider>,
    );
  })
  .catch(() => {
    document.getElementById("root")!.textContent =
      "Trusted storage unavailable. Update your browser.";
  });
