# VowEdit Browser Side Panel V0.2.1

Generate anywhere. Re-edit beside your AI. This is a packaged, human-operated MV3 browser Side Panel,
using file handoff supported by the source application. It is not an official ChatGPT plugin or Codex
native extension. It neither reads the active page nor captures conversations, images or context.

## Build and start

Use the repository's Node 22.14–24.x and Python 3.10+ setup in the README. From the repository root:

```powershell
npm ci
npm run extension:typecheck
npm run extension:build
```

The unpacked package is `extension/dist`; it includes its HTML, bundled React JavaScript, CSS,
service worker, manifest and icons. Rebuild after changes, then reload it in the browser extension
manager. Source files alone are not the package. No remote script, CDN, iframe or runtime Next code
is loaded. The declared minimum Chrome version is 116; this is an API requirement, not a tested matrix.

For isolated Mock QA, set these **before importing/starting the API** in its terminal:

```powershell
$env:PYTHON_DOTENV_DISABLED = '1'
$env:VOWEDIT_DATA_DIR = (Join-Path (Get-Location) '.local/v021-validation-data')
$env:VOWEDIT_PROVIDER = 'mock'
Remove-Item Env:RUNNINGHUB_API_KEY, Env:RUNNINGHUB_WORKFLOW_ID, Env:COMFYUI_BASE_URL, Env:COMFYUI_CHECKPOINT -ErrorAction SilentlyContinue
.\.venv\Scripts\python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000
```

In a second terminal, run `npm run dev` (or `npm run build -- --webpack` then `npm run start`).
The full UI is fixed at `http://127.0.0.1:3000`; the default API is `http://127.0.0.1:8000`.
Advanced connection settings accept only a numeric port 1024–65535. Set `VOWEDIT_API_PORT` to the
same port for Next startup/build and API startup. Changing the extension port clears its credential,
active pointer and command keys before assigning the endpoint, and preserves language preference.
The extension cannot start either local process. Check service ownership before stopping a port.

For normal provider setup follow the existing README/provider documents separately. Pairing grants
editing authority for the whole local history and configured generation providers, not just Mock.
This delivery made no paid/provider requests and did not read a real `.env` or workflow.

## Install and pair

Use a separate temporary browser profile for validation. In Chrome `chrome://extensions` or Edge
`edge://extensions`, enable Developer mode and **Load unpacked**, selecting the built `extension/dist`.
Click the extension's toolbar action to open its browser Side Panel. If the sidePanel API is unavailable,
the service worker exposes a safe toolbar badge/title; it does not switch to a privileged webpage bridge.

1. Start the API and full UI. The extension checks `/api/capabilities` before enabling edits.
2. Select **Open VowEdit Pairing Page**. Verify the displayed runtime extension ID and access warning.
3. Explicitly select **Approve extension** in the local full UI. Merely opening the link grants nothing.
4. Manually copy the displayed code into **One-time pairing code** in the panel, then select **Pair extension**.
5. Hide the code in the full UI. It expires after five minutes, is bound to the exact extension origin,
   is used once, and is not transferred through any webpage messaging/storage/URL bridge.

At most eight active pairings and sixteen pending codes are allowed. The bearer expires thirty days
after exchange; there is no refresh mechanism. Backend restart restores the digest registry, while
pending codes do not survive restart. Extension reload/browser restart reuse trusted local storage.
An ID change/reinstall needs a new approval. If exchange succeeds but its response is lost, approve
a new code and revoke the unused record in the full UI; raw bearer responses cannot be replayed.

Compatibility requires API version `side-panel-v1` and all five flags: `editing-drafts-v1`,
`candidate-plans-v1`, `browser-pairing-v1`, `report-v2`, `continuations-v1`. Informational product
versions do not decide compatibility. Offline/blocked and old-backend states block editing, use
bounded request timeouts and offer manual Reconnect. Full UI navigation has its own four-second check.

## Editing and recovery

Paste image File items, drop a PNG/JPEG file or upload it. URI, HTML and text handoff never fetch a URL.
Uploads share server decode/MIME/size guards: 10 MB, 32–1536 pixels per side. Invalid replacement
preserves the old saved edit. Source replacement first acknowledges pending draft writes and creates
a new draft; the old source is immutable. Fit-image painting uses source-pixel brush sizes. Keyboard
dabs, CHANGE/KEEP, erase, undo and reset remain available; fine editing opens the same saved draft.

The interface leads from material to boundaries/intent, explicit generation/import, then inspection.
Only configured generation providers are selectable; Mock and provider-free import remain available.
Paint/paste/pair/adopt/continue never start generation. Three strategy directives remain fixed English;
switching interface language does not translate canonical user intent. Mask/intent changes clear old
checkpoint/plan/prepared bindings. Review the contract again before submitting.

Draft writes debounce at 600 ms with one writer per view. **Saved** means server-acknowledged,
**Not saved** includes pending/failed writes, and **Conflict** retains local edits until the user
chooses Reload saved state. No automatic merge or overwrite occurs. Opening full UI, preparing
Boundary Lock and submitting require flush + acknowledgment. Browser close can lose unacknowledged
input; there is no second full draft stored in Chrome storage. Submitted drafts only point to their
immutable Run. A lost successful submit response recovers that Run on reload and cannot create a
second job for the draft. Existing retry/continuation request keys retain their prior semantics.

Preview, pixel-rule recommendation, human review and adoption are separate. Explicit issue
confirmations are required for adopting/continuing repair material. Human FAIL remains FAIL.
Preservation is not model quality; Boundary Lock 100% comes from compositing outside CHANGE.
Raw provenance is available in the full report. Continue creates a new empty-intent/boundary draft
from the adopted final pixels, preserving the parent and its original evidence.

Copy and Download use the **adopted final image**, including a locked output, independently of preview.
Copy uses the panel's PNG ClipboardItem API after a user click; failure offers Download and does not
claim success. Download uses authenticated bytes through a Blob anchor with a generated filename.
Reconnect recreates the Blob scope to retry failed image loads. Active Run polling is 600 ms,
terminal polling four seconds, failure retry two seconds; hidden views pause. This is fit-image
editing with basic keyboard access, not a complete WCAG or pixel-precision editor certification.

## Privacy and permissions

Manifest permissions are exactly `sidePanel`, `storage`, `clipboardWrite`; host permission is
`http://127.0.0.1/*` because Chromium host patterns cannot restrict the port. Application code only
constructs numeric-port loopback URLs and allowlisted API/deep-link routes. No `tabs`, `activeTab`,
`scripting`, `downloads`, `contextMenus`, `nativeMessaging`, content scripts, externally_connectable,
web-accessible resources, sync storage, telemetry or analytics are installed.

Local/session storage access is restricted to TRUSTED_CONTEXTS before use, failing closed on error.
Only local bearer/id/origin/expiry, locale, port, small draft/Run pointers and bounded command keys
persist. No provider keys, full images, full Runs, reports, DB copies or persistent image history.
Bearer authority is sent in Authorization plus bound origin metadata, never an asset URL/DOM/query.
Images use authenticated fetch → Blob URLs scoped to the current open draft/Run. They are revoked
on replacement/unpair/dispose; no unauthenticated fallback or cache-header relaxation is used.

Backend registry: `data/.security/browser-pairings.json` under the **selected data root**, separate
from domain DB/receipts. It stores only SHA-256 digests of fixed-format random secret bytes and
nonsecret metadata, uses constant-time comparison and atomic replacement. POSIX temp files use
0600; Windows uses inherited ACLs, with no claim that chmod establishes Windows ACL protection.
This remains a trusted local OS user, single-worker application; an already compromised local
process can forge HTTP headers/read files and is outside this boundary. No multi-process registry
coordination or asset garbage collection was added.

Private anonymous no-Origin/no-Fetch-Metadata requests are intentionally rejected. Legacy local
non-browser clients must now supply a trusted loopback Web Origin or paired bearer. Public
capabilities expose no provider/config/history data. Any declared extension identity goes through
authentication; invalid authority cannot fall back. Exact-origin preflight grants only approved
routes/methods/headers and never performs business commands. Other pairing administration remains
full-UI-only. Provider keys remain exclusively in the existing server runtime-secret mechanism.

## Unpair and rollback

Online **Unpair** revokes this credential then clears local authority/pointers. Offline unpair removes
local state and explicitly reports that server authorization remains: use `/settings/browser` in the
full UI to revoke the record later. Full UI can list/revoke all local pairings but displays no digest
or token. Explicit revoke + new approval performs rotation. New requests after completed revocation
are rejected; already accepted jobs are not falsely claimed cancelled. A corrupt registry fails closed.
Stop services and restore a known-good registry backup to repair it; no automatic reset grants access.

Schema validation used only controlled old-schema databases and isolated copies. Before upgrading
real data, separately authorize that operation, stop services and back up DB/WAL/SHM plus assets.
Rollback restores the matching old backup after stopping services; do not destructively drop the new
table or assume old binaries understand new metadata. Real user data migration is NOT TESTED.

## Browser evidence matrix — 2026-10-06

| Environment | Status | Evidence boundary |
| --- | --- | --- |
| Packaged extension in bundled Playwright Chromium | TESTED IN AUTOMATED CHROMIUM EXTENSION | Real service worker/runtime ID, isolated profile, extension page, pairing, Mock/import, shared draft, width/layout and export bytes |
| Google Chrome 154.0.8037.98 installed | NOT TESTED | No observable Load unpacked/toolbar/native-panel/paste/clipboard/download/close-reopen QA |
| Microsoft Edge 154.0.4258.53 installed | NOT TESTED | Same independent native-browser QA gap |
| Real external generation providers in this version | NOT TESTED | Offline/Mock only; historical experiments remain their dated evidence |
| Docker / browser store | N/A / STORE READY: NO | No Docker, publication, signing or store submission |

Observable Windows QA tooling returned execution timing without inspectable app/window/image output;
the native Node fallback could not initialize the required trusted computer-use service. This is a
tooling evidence limitation, not evidence that either browser rejects the extension. Do not infer
toolbar/native Side Panel success from the extension-page screenshots. Actual Chrome acceptance
is required before READY YES. No context capture, host adapter, MCP or automatic local launch exists.

References: [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel),
[Edge sidebar extension guidance](https://learn.microsoft.com/microsoft-edge/extensions-chromium/developer-guide/sidebar).
