# ADR 001 — Explicit change, measurable preservation

Accepted for V0.1, 2026-09-28.

## Problem and product boundary

An image edit can satisfy a prompt while changing something the creator wanted to keep.
VowEdit makes CHANGE and KEEP explicit before generation, compares outputs with the source,
and produces an inspectable Edit Receipt. Preservation scores are decision support, not image
quality, semantic correctness, face identity, accuracy, or a guarantee of unchanged content.

## Architecture

```text
Next.js / React / TypeScript
        ↓ same-origin /api proxy
FastAPI routes → ImageEditService → ImageEditProvider
                      │                 ├ Mock
                      │                 ├ RunningHub
                      │                 └ Local ComfyUI
                      ├ independent pixel evaluator
                      ├ SQLite repository
                      └ local PNG asset store
```

The empty repository allowed the requested Next.js default. No application code was migrated.
No provider SDK types enter schemas. Providers return image pixels; a narrow callback records
accepted provider task IDs without exposing credentials or raw provider responses. Evaluation
has no generation dependencies. Routes delegate business decisions to services.

## Explicit contract

CHANGE stores instruction and binary PNG mask reference. KEEP stores mask references, labels,
types and thresholds, plus an optional hard threshold for everything outside CHANGE. Brush
strokes use original-image coordinates at any viewport size. The server thresholds mask luminance
at 128, validates image dimensions and rejects overlaps. The frontend uses the same boundary
when exporting canvas alpha as black/white pixels. A missing KEEP region is allowed, but named
empty regions are rejected. Full-image CHANGE is rejected because outside-change drift is undefined.
Source images are EXIF-corrected and metadata-stripped before masking.

## Generation and evaluation

Mock is mandatory: deterministic pixel edits and deliberately failed candidates exercise the
product without GPUs, accounts or paid calls. Its color inversion ignores semantic instructions.
The production API contains no test-failure switches; browser fault injection lives in tests.

Local ComfyUI uses the repository-owned SD/SDXL core-node latent inpainting template.
RunningHub uses its separately fingerprinted Z-Image workflow, not the ComfyUI graph.
Runtime configuration supplies model names and, for RunningHub, a saved workflow ID and API key.
No arbitrary browser-supplied graphs. CHANGE is inverted into source alpha for LoadImage's mask output.
ComfyUI inputs are padded to multiples of eight and outputs cropped back; dimensional changes fail.
KEEP is primarily a post-generation check. Provider outputs are not silently composited over the
source to hide drift. The 2026-10-06 opt-in imported preparation below explicitly enforces boundaries
and records that intervention separately from generation and evaluation.

### Explicit imported Boundary Lock — 2026-10-06

Raw imported assets remain immutable and must still match dimensions for direct evaluation.
`POST /api/prepared-candidates` is a separate command: validate the original/CHANGE/KEEP contract,
center-crop the raw candidate in continuous coordinates to the target aspect ratio, then Lanczos
resize; admit generated pixels only inside binary CHANGE and original pixels everywhere else.
The original and masks are never resampled. No feather, new model call or scoring change.

Each new PNG and atomic provenance sidecar is written before an existing asset row registers kind
`prepared_candidate`; no schema migration. Import reads server provenance and binds the derived asset
to original, CHANGE mask and source label. Missing provenance fails closed. Concurrent preparations
produce independent UUIDs with deterministic pixels; repeating preparation may leave an extra asset,
but cannot mutate originals or submit a paid job. A crash before registration leaves an orphan;
after registration both files already exist. Evaluation retries load the same prepared assets.

Both exact-size direct imports and explicit prepared imports enter the unchanged evaluator/worker.
Receipts distinguish external generation, VowEdit Boundary Lock enforcement and rgb-mae-v1 evaluation.
Zero drift after enforcement proves the composite boundary, not the external model's preservation.

`rgb-mae-v1`: let d(x,y) = mean absolute RGB difference / 255. Report:

- protected similarity = 100 × (1 − mean d inside KEEP); average named regions equally;
- change difference = 100 × mean d inside CHANGE;
- unexpected drift = 100 × mean d outside CHANGE;
- outside preservation = 100 − unexpected drift;
- overall score = 0.6 × protected similarity + 0.4 × outside preservation;
- without painted KEEP, outside preservation has weight 1.0.

Adherence and artifact quality remain manual review, with numeric weight zero. Eligibility requires
every individual hard threshold plus at least 2% mean CHANGE difference. The 2% is a declared heuristic,
not calibrated semantic evidence. Ranking: eligible first, fewer violations, meaningful pixel change,
lower drift, higher score, original candidate index. Compare unrounded values. Ineligible candidates
remain visible. If none qualify, selected ID is null and the UI says so; it does not approve the least bad.
Ghost alpha = min(3 × d, 0.85) × 255 outside CHANGE, zero inside it. Hats/skin/identity are not recognized.

## Async jobs, transactions and concurrency

Single bounded worker thread; API submission commits queued work before returning 202. The worker
polls SQLite and serves at most eight outstanding jobs. A process-owned file lock excludes a second
worker process on the same data directory. SQLite WAL, foreign keys and BEGIN IMMEDIATE serialize
submissions and writes. Unique request keys and payload hashes deduplicate identical requests and
reject conflicting reuse. The browser retains ambiguous submissions in sessionStorage and replays
the same key after refresh. It never retries paid submissions with a new key automatically.

Run documents hold immutable contracts and candidate/evaluation records. Jobs are separate rows
with unique request keys; asset rows hold generated UUIDs, kinds and dimensions. Images are files,
not blobs. Each candidate persists independently. Final ranking, suggested candidate and terminal
job/run state commit together. Job ownership guards reject stale attempts. State transitions are
explicit and completed jobs cannot regress. A generation retry creates a linked new run and reuses
the original assets/contract, preserving the old evidence. Evaluation retries use existing candidates.

On restart queued work resumes. Interrupted active work becomes failed-generation or failed-evaluation;
saved candidates remain. Re-evaluation can finish ranking even if all metrics were already saved before
the crash. Real-provider interruptions are marked ambiguous and cannot blindly generate again.
Known provider IDs are retained. V0.1 has no automatic cloud reconciliation or callbacks.

## Storage and security

PNG atomic rename precedes DB references. A crash can leave an unreferenced asset but not a
half-written referenced file. Filesystem + SQLite do not form a distributed transaction; automatic
garbage collection is deferred. The 50-item history display is not a storage retention policy.

Loopback-only documented startup, Host/Origin checks, bounded request bodies (including chunked
uploads), MIME/extension/decode checks, dimensions 32–1536, random filenames, metadata stripping,
and fixed output-host rules bound input risks. Responses and logs contain safe error categories.
Provider keys stay in environment memory, never in browser, DB, assets or receipts. Cloud downloads
use a separate unauthenticated client, HTTPS allowlisted host and no redirects. See integration notes.

No authentication: trusted single-user machine only. Other local processes with filesystem access
are outside this trust boundary. No cloud storage service, Redis, distributed workers, accounts,
mobile app, training, video or GPU containers. Docker adds little to this local prototype and is omitted.

## V0.2 Re-edit Workbench — 2026-10-06

The application service freezes deterministic `strategy-en-v1` plans before submission.
The new UI requests safe/balanced/bold instructions; old API submissions retain legacy seed behavior
and the exact old normalized payload hash. Canonical base instructions keep the schema's existing
whitespace trimming. Fixed English directives are separate from localized UI copy; this version
does not translate user prompts. Effective text is capped at 2400 characters. This is a service-side
input bound, not evidence that every real model supports or responds to it. Worker execution,
submission replay and generation retries read frozen snapshots. No workflow, evaluator, seed,
candidate budget or transport changes.

`selected_candidate_id` remains the pixel-rule recommendation. Viewing, human review and
`user_selected_candidate_id` are independent. Selection uses a persisted revision/CAS inside
`BEGIN IMMEDIATE`; repeating the same desired selection is a no-op after checking resource validity.
Issues are derived from structural evaluation/verdict data and individually confirmed for repair use.

Continuation starters live as immutable entries in the parent run JSON. They have no job lifecycle,
so a separate table/migration would add unnecessary state. SQLite JSON queries search stored starters
across all runs (not only the latest 50). The immediate transaction serializes global starter request-key
lookup, parent state/revision validation, original-asset registration and starter insertion. Files are
atomically written first. Failures/races can leave orphan PNG files but no duplicate registered result
or broken reference. Persisted command results are returned before revalidating a changed selection.
Selection/review/worker updates read current run JSON under the same write transaction and preserve
starter metadata. There are no session/project/version-graph tables, command bus or bulk legacy rewrite.

New originals clone final evaluated pixels, including locked outputs. New UI boundaries and intentions
start empty. Generated/imported children bind to the server-owned starter source and carry lineage;
generation retries remain a different derivation. The v1 receipt keeps its original automatic selected
meaning and adds `report-v2`. Continuation does not change the parent receipt.

Normalized raw previews validate server provenance against the existing center-crop/Lanczos recipe,
return only PNG bytes and write nothing. Raw and historical experimental evidence stay immutable.
The local browser host and hosted CI explicitly set isolated data roots before application import.
No real user database was upgraded during validation. There is no schema change or migration in V0.2.
