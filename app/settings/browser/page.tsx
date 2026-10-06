"use client";
import { useEffect, useState } from "react";
import { api, jsonPost } from "@/frontend/api";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
type Pair = { id: string; origin: string; expires_at: number };
const local = { "X-VowEdit-Local": "1", "Content-Type": "application/json" };
const validId = (value: string) =>
  value.length === 32 && /^[a-p]{32}$/.test(value);
export default function BrowserSettings() {
  const { t } = useLocale();
  const [id, setId] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [code, setCode] = useState("");
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    api<Pair[]>("/browser-pairings", { headers: local })
      .then(setPairs)
      .catch(() => setError(true));
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("extension_id");
    if (
      [...params.keys()].some((key) => key !== "extension_id") ||
      params.getAll("extension_id").length > 1 ||
      (value !== null && !validId(value))
    )
      setInvalid(true);
    else if (value) setId(value);
    void refresh();
  }, []);
  async function approve() {
    if (busy || invalid || !validId(id)) return;
    setBusy(true);
    setError(false);
    setCode("");
    try {
      const result = await api<{ code: string }>("/browser-pairing/bootstrap", {
        ...jsonPost({ origin: `chrome-extension://${id}` }),
        headers: local,
      });
      setCode(result.code);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="studio-page">
      <h1>{t("Browser pairing")}</h1>
      <p>
        {t(
          "Approve access to local VowEdit history and editing commands. Real generation uses your configured provider.",
        )}
      </p>
      <p>{t("No page collection. File handoff only.")}</p>
      {invalid ? (
        <p role="alert">
          {t("Invalid extension ID. Open the pairing page from the extension.")}
        </p>
      ) : (
        <>
          <label>
            {t("Extension ID")}
            <input
              value={id}
              maxLength={32}
              onChange={(e) => {
                setId(e.target.value);
                setCode("");
              }}
            />
          </label>
          {validId(id) && (
            <p>
              {t("Requested extension")}: <code>chrome-extension://{id}</code>
            </p>
          )}
          <p>
            {t(
              "Prefilling an ID does not approve access. Verify it against the side panel.",
            )}
          </p>
          <button
            disabled={busy || !validId(id)}
            onClick={() => void approve()}
          >
            {t("Approve extension")}
          </button>
          {code && (
            <section>
              <p>
                {t(
                  "One-time pairing code — expires in 5 minutes. Copy it manually into the side panel.",
                )}
              </p>
              <code>{code}</code>
              <button onClick={() => setCode("")}>{t("Hide code")}</button>
            </section>
          )}
        </>
      )}
      <h2>{t("Authorized extensions")}</h2>
      {pairs.map((pair) => (
        <section key={pair.id}>
          <p>{pair.origin}</p>
          <p>{new Date(pair.expires_at * 1000).toLocaleString()}</p>
          <button
            onClick={() =>
              void api(`/browser-pairings/${pair.id}`, {
                method: "DELETE",
                headers: local,
              })
                .then(refresh)
                .catch(() => setError(true))
            }
          >
            {t("Revoke")}
          </button>
        </section>
      ))}
      <button onClick={() => void refresh()}>{t("Refresh")}</button>
      {error && (
        <p role="alert">
          {t("Action failed. Your saved state remains available.")}
        </p>
      )}
    </main>
  );
}
