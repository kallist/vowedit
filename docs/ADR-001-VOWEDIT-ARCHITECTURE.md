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

Real adapters use one repository-owned SD/SDXL core-node latent inpainting template. Runtime
configuration supplies model names and, for RunningHub, a saved workflow ID and API key. No arbitrary
browser-supplied graphs. CHANGE is inverted into source alpha for ComfyUI LoadImage's mask output.
Inputs are padded to multiples of eight and outputs cropped back; other dimensional changes fail.
KEEP is primarily a post-generation check. Outputs are never composited over the source to hide drift.

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
