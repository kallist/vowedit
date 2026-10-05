# VowEdit

**Change what you ask. Keep what you don’t.**

## Problem

Ask AI for a new jacket. Get a new face, too.
Generative editing can change more than the creator intended, and a good-looking result can hide it.

## Product idea

VowEdit makes two intentions explicit: **CHANGE** what may be edited, and **KEEP** what must stay.
It generates three candidates, measures preservation and unintended drift, ranks by constraints,
and explains the outcome in an Edit Receipt. The model is replaceable; the contract is the product.

## Demo

Open the studio and choose **Use Demo — image, instruction & masks** to load the project-owned original,
instruction and editable CHANGE/KEEP masks together. Review the contract and Generate. Alternatively,
upload an authorized image and paint your boundaries. Compare A/B/C, move the Before / After slider, inspect
Ghost View and export the receipt. Use the human-review field to judge prompt adherence.

**Mock mode is a deterministic pixel simulation, not AI inference.** It deliberately includes drift
and an incomplete edit. It works offline with no GPU or account. The code includes RunningHub and
local ComfyUI adapters. **RunningHub CN's real generation, download, persistence, evaluation, Ghost
and receipt path is TESTED**, including one smoke and one complete three-candidate run. The user
preferred A but confirmed it did not make the jacket cool blue: this is pipeline validation with a
negative semantic result, not a successful creative demo. Local ComfyUI real generation remains
NOT TESTED. Manual RunningHub web success is separate user-reported evidence.

Why this matters: the result is not only “here is your image,” but “here is what changed, what stayed
protected, and where you should look more closely.” No pixel metric proves subjective quality.

## Screenshots

Captured from the running local Mock app, using project-owned fixtures:

![VowEdit landing](docs/screenshots/final/1440/landing.png)
![Ghost View exposes accidental changes](docs/screenshots/final/1440/ghost-view.png)

The [Mock screenshot directory](docs/screenshots/final) includes 1440, 1024, 768, 430 and 390 pixel views of the landing,
mask editor, contract summary, processing, result, candidate comparison, Ghost View, receipt and failure.
The [import screenshots](docs/screenshots/imported) show the new source choice, result, Ghost and receipt
with explicitly labelled offline fixtures at 1440, 768 and 390 pixels.

## Quick Start

Requires Node 22.14–24.x and Python 3.10+ (local validation used Node 24 and Python 3.10).
Run from the repository root. Mock is the default; no `.env` is required.

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.lock
.\.venv\Scripts\python -m pip install --no-deps -e .
npm ci
.\.venv\Scripts\python -m uvicorn backend.api:create_app --factory --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
npm run dev
```

Visit [the local studio](http://127.0.0.1:3000). On macOS/Linux use `python3 -m venv .venv`
and `.venv/bin/python` in place of the Windows Python command. These platforms have not been
locally exercised in this delivery. For a production frontend, `npm run build -- --webpack`, then
`npm start`; keep the FastAPI process running separately. Do not use multiple API workers.

Use `.env.example` for server-only settings. Never prefix provider keys with `NEXT_PUBLIC_`.
The generated `data/` directory holds the SQLite database and PNGs. Do not commit it.
This is a trusted-machine local prototype, not a public network service.

## Architecture

Next.js/React UI → FastAPI → ImageEditService → replaceable ImageEditProvider.
Independent evaluation → SQLite records + local PNG storage. Async jobs use one bounded worker,
unique request keys, transactional state changes and explicit retry domains. Refresh resumes polling;
an ambiguous submission retains its request key. Generation retries preserve the old run and reuse
the contract; evaluation retries preserve generated images and never call the provider.

See [repository audit](docs/REPOSITORY_AUDIT.md), [architecture decision](docs/ADR-001-VOWEDIT-ARCHITECTURE.md)
and the interviewer-oriented [Product Case](docs/PRODUCT_CASE.md).

## Provider model

| Provider | Code | Verification |
| --- | --- | --- |
| Mock | Implemented; default | Local unit, integration and real-browser tests |
| RunningHub | Implemented, supplied fixed Z-Image graph, opt-in | Real same-task smoke and three-candidate API flow PASS; human-selected A failed color adherence |
| Local ComfyUI | Implemented, loopback-only | Offline HTTP transport tests; real generation NOT TESTED |
| Imported external candidates | Implemented; independent upload/evaluation with explicit optional Boundary Lock | Real imagegen A/B/C prepared, imported, evaluated; original mismatched direct import remains rejected |

In Constraint Summary choose **Import 3 candidates**, upload A/B/C and enter a descriptive source
label, then **Evaluate imported candidates**. Imported candidates allow VowEdit to evaluate results
generated by tools outside the application. **Imported does not mean VowEdit generated them.**
This path requires a painted KEEP mask and three PNG/JPEG candidate assets with exactly the source
dimensions; direct import never resizes, calls a provider or invents seeds. Source labels are user-supplied
attribution, not verified model identities. Import works without any provider API key.
See [import API and persistence design](docs/IMPORTED_CANDIDATES.md) and
[delivery checks](docs/IMPORTED_VALIDATION.md).

[External navy-jacket outputs](docs/evidence/imported/blue-jacket-gpt-image) were genuinely produced
by Codex's built-in imagegen and user-reviewed: A/B/C visually satisfy the intent, preferred A.
Their untouched 1195×1316 outputs do not match the 640×704 original. All were uploaded, safely decoded
and retained; direct creation still rejects `CANDIDATE_SIZE_MISMATCH`. An explicitly selected
**Apply VowEdit Boundary Lock** operation now creates separate 640×704 candidates: aspect-preserving
minimal center crop, Lanczos resize, then generated pixels inside CHANGE and original pixels outside.
All three locked candidates completed real import/evaluation/ranking/Ghost/receipt with unchanged
rgb-mae-v1. KEEP/outside preservation 100%, outside drift 0%; rank A → B → C, suggested A.
This preservation comes from VowEdit's composite, not the external model alone. Raw files and the
previous rejection remain intact. After separately viewing the locked results in VowEdit, the user
confirmed **A/B/C PASS, preferred A**; all three new verdicts are persisted in the reviewed receipt.
See [Boundary Lock evidence and checks](docs/BOUNDARY_LOCK_VALIDATION.md). No direct OpenAI integration.

See [RunningHub setup and official API references](docs/RUNNINGHUB_INTEGRATION.md),
[workflow requirements](workflows/README.md) and [model experiment boundary](docs/MODEL_BOUNDARIES.md).
The supplied Z-Image API graph is bundled with a fixed UNET/CLIP/VAE stack; no model weights are bundled.
No model downloads or automatic paid retries. [Real execution record](docs/REAL_PROVIDER_VALIDATION.md)
preserves failures and distinguishes API, Mock and manual web evidence. The exact -tos CDN was added
only after explicit authorization; no wildcard. [All real A/B/C and reviewed receipt](docs/evidence/runninghub/2026-10-05)
are retained without cherry-picking. The follow-up
[Blue Jacket Proof](docs/evidence/runninghub/2026-10-05-blue-jacket-proof) completed two bounded real
case rounds with corrected full-jacket masks and seeds 5100–5102 / 5200–5202. All six candidates
received explicit human **FAIL** for navy-color adherence. Real provider execution is verified;
semantic success still requires human review. **No successful RunningHub showcase was obtained.**
The user-approved mask preview is labelled as a visual reference,
never as model output.

[Object Replacement Proof](docs/evidence/runninghub/2026-10-05-object-replacement-proof) then used
the user's supplied teapot image and confirmed target, red ceramic mug. One real round at seeds
6100/6101/6102 completed the engineering loop; all three received human **FAIL** because the teapot
remained and no clear mug replaced it. System rank B → C → A is preserved. Both real failed cases
remain visible; neither failed RunningHub case is reclassified by the later external Boundary Lock case.

## Evaluation

`rgb-mae-v1` compares normalized mean absolute RGB differences in aligned images. Protected similarity
and outside preservation are higher-is-better; unexpected drift is lower-is-better. CHANGE difference
measures pixels, not semantic success. At least 2% mean change is required to reject near-noops.

Score: 60% manual KEEP preservation + 40% outside preservation; outside preservation gets 100% if
there is no painted KEEP. Each hard threshold is tested before rounding. Rank by eligibility,
violation count, meaningful change, lower drift, score, then original candidate index. If nothing
qualifies, nothing is selected. All candidates and warnings remain available.

Ghost View colors only outside-CHANGE drift. Face identity, semantic adherence and artifact quality
are **not** automatically assessed. Receipts expose the formula and accept a saved human verdict.

## Testing

```powershell
.\.venv\Scripts\python -m ruff check backend scripts
.\.venv\Scripts\python -m mypy backend --exclude backend/tests
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python scripts/check_secrets.py
npm run lint
npm run typecheck
npm test
npm run build -- --webpack
npx playwright install chromium
npm run e2e
```

E2E starts an isolated test API with deterministic provider faults and a production Next.js server;
stop other services on 3000/8000 first. It writes required screenshots to `docs/screenshots` and ignored
temporary runtime data under `.local/`. Optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed
Chrome executable. In restricted environments use `pytest --basetemp=.local/pytest-run` for writable
temporary storage. Current test results and remaining checks are in [HARDENING_VALIDATION.md](docs/HARDENING_VALIDATION.md).
The earlier [VALIDATION.md](docs/VALIDATION.md) is the dated initial-delivery record.

The public [repository](https://github.com/kallist/vowedit) uses `feat/vowedit-v0.1` as its existing default
branch. The GPU-free [GitHub workflow](https://github.com/kallist/vowedit/actions/workflows/ci.yml) runs
lint, types, tests, build and browser acceptance. Its initial browser failure and hardening are recorded
in [HARDENING_AUDIT.md](docs/HARDENING_AUDIT.md). Hosted status must be checked against the actual PR head;
local success does not establish hosted CI success.

## Limitations

Single-user local process, no auth. PNG/JPEG only, 10 MB, each side 32–1536 pixels. One painted KEEP
region in the UI (multiple regions supported in the API). Mean pixel similarity can dilute small
important edits and penalize harmless shifts. The default 98 threshold and 2% change gate are heuristics.
Real RunningHub generation is **TESTED** with retained semantic failures. Local ComfyUI generation
and the three broader creative demo slots remain **NOT TESTED**. Portfolio-ready **YES** for the one
controlled, human-approved external Boundary Lock case; broader validation remains pending. See
[real-provider validation](docs/REAL_PROVIDER_VALIDATION.md) and [pending cases](docs/DEMO_CASES.md).
No automatic cloud task reconciliation; unknown provider states require console inspection. Latest
50 edits shown, but assets persist until the owner removes their local data; automatic cleanup/deletion
UI is not implemented. Receipt PNG export is not implemented. This one controlled, human-reviewed
external jacket case does not establish success on the three broader creative demo slots.

## Roadmap

Validate the three [demo slots](demo-assets/README.md) with consented creative assets and real model
runs, collect human notes, and compare heuristics against that evidence. Video/Motion is future-only.
Docker is not applicable to this delivery; no GPU stack or extra infrastructure was introduced.

## Security

Mock sends images nowhere. Selecting a real provider sends source pixels, CHANGE mask and instruction
to that configured provider; RunningHub is cloud processing. KEEP masks, scores and human notes remain
local. Provider retention and privacy policies are separate from local storage and have not been audited.

Uploads validate body size, MIME, extension, dimensions and decode. Original names are discarded,
metadata is stripped, output files get UUID names, and filesystem assets stay outside the public tree.
Host/Origin checks restrict browser access. Keys remain server-side; raw provider errors are never
returned or logged. Cloud image downloads use an allowlisted HTTPS host with no credential forwarding
or redirects. The secret-pattern CI check is a small hygiene gate, not a complete security scanner.
