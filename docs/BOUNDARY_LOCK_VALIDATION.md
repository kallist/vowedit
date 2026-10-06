# Boundary Lock — 2026-10-06

Repository [kallist/vowedit](https://github.com/kallist/vowedit), branch
`feat/vowedit-v0.1-hardening`, previous head `d48ea48869d7557a6b9d8027773fc7a3fddf4da7`, base
`e891f471b5730981730253e4fe6b7bf003fa182f`, [Draft PR #1](https://github.com/kallist/vowedit/pull/1).
No merge, tag, release or deployment. User's unrelated untracked workflow is preserved and excluded.

## Design and scope

Explicit `POST /api/prepared-candidates` accepts uploaded UUIDs, source label and the existing contract.
Server validates asset kinds/masks, computes aspect-preserving center crop and Lanczos resize, then
binary `generated inside CHANGE + original outside CHANGE`. UI retains raw uploads/dimensions,
discloses preparation and requires **Apply VowEdit Boundary Lock**. Strict direct import stays strict.

New PNG plus provenance sidecar precede DB registration with a distinct prepared-asset kind. Files
are atomic, originals immutable; import binds provenance to original/CHANGE/source label and fails
closed when records are missing. Concurrent preparations create independent UUIDs with deterministic
bytes, not shared mutable results. Repeated/ambiguous preparation can leave extra assets or orphans;
no automatic deletion. All imported assets then use existing transactional queued evaluation, dedup,
rank, Ghost and receipt. Evaluation retries never repeat normalization/composition or generation.
Receipt/result distinguish generation, enforcement and evaluation; raw preview remains available.

No new dependency, DB schema/migration, provider behavior, evaluation formula, thresholds, weights,
minimum-change rule, ranking or Ghost algorithm. No paid task, new model generation or V0.2 scope.
Both direct imports and Mock/real-provider generation keep their existing behavior.

## Actual case

Existing raw A/B/C: Codex built-in imagegen (`image_gen.imagegen`), external to VowEdit. Hidden
model/version unavailable, seeds null. Original/CHANGE/KEEP 640×704, raw A/B/C 1195×1316.
Raw original hashes and previous rejection journals/screenshots unchanged. No cherry-picking.

Actual normalization: crop `[0,0.75,1195,1315.25]`, source aspect 1195/1316, target 640/704,
crop height 1314.5, total vertical crop 1.5 source pixels. One isotropic Lanczos resize to 640×704.
Original/masks never resampled. CHANGE 67,406 pixels; complementary KEEP 383,154; no overlap.
Binary lock, feather 0. All raw assets retained, locked assets separately saved.

Run `e5f59ad7-066d-4138-aa55-5fa9ba97b32f`, all three imported together, completed persisted pipeline,
provider calls 0. API recheck still refuses direct raw import before preparation. Existing metric:

| Locked candidate | KEEP % | Outside % | CHANGE % | Drift % | Score | Eligible | Rank |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 100 | 100 | 27.600803 | 0 | 100 | YES | 1 |
| B | 100 | 100 | 29.078432 | 0 | 100 | YES | 2 |
| C | 100 | 100 | 28.000647 | 0 | 100 | YES | 3 |

System A → B → C, selected A. Scores/drift tie and original candidate index breaks the tie;
larger CHANGE difference does not imply a better semantic result. All Ghost alpha pixels zero,
as expected for exact outside preservation. Receipt attributes external generation and VowEdit's
enforcement separately. This does not establish raw-model preservation or semantic ranking quality.

Agent inspected all actual locked outputs: clearly navy, no primarily orange/brown fill, closed jacket
structure/flat design retained, original face/hair/skin/pants/pose/background, no major boundary
artifact. Slight generated jacket texture remains; binary locking cannot repair arbitrary defects
inside CHANGE. Agent review is separate from user acceptance.
Raw user review: A/B/C PASS, preferred A. Locked review is separate: after final VowEdit UI display,
the user replied **“A/B/C 均 PASS，偏好 A”**. All three new verdicts were saved through the existing
review API and read back in the receipt; images, metrics, ranks and suggestion unchanged. No new run
or generation. Controlled constraint-enforced success **YES**, human-approved final **YES**;
portfolio-ready and interview-ready **YES** for this one explicitly attributed controlled example.

## Validation record

Executed: Ruff PASS; mypy PASS (11 source files); pytest **153 PASS** (20 additional preparation tests);
frontend lint/typecheck PASS; Vitest **8 PASS**; production webpack build PASS; secret-pattern scan PASS.
Browser acceptance first run **19/20**, new Boundary Lock three viewports PASS. Old 430px Mock Ghost
test read an undecoded image into a zero-width canvas. It now awaits image decode before the unchanged
nonzero-alpha assertion; no assertions/gates weakened. Full rerun **20/20 PASS**. Self review then
identified a failed replacement upload clearing an otherwise valid prepared slot; upload failure now
preserves the existing asset. A regression also covers partial preparation resuming only unfinished
slots and source-label edits invalidating preparation. Final suite result recorded after that change.

Backend tests prove exact admission/outside equality, deterministic bytes/minimal aspect crop,
immutable raw/source/masks, bad or missing masks, input/path/URL/transform rejection, provenance binding
and failure-closed handling, storage partial-failure safety, independent concurrent preparation,
same evaluator/Ghost/receipt and evaluation retry without preparation/generation.
Browser tests cover explicit gating/CTA/dimensions/disclosure, all three prepared/imported candidates,
raw preview, Ghost/receipt attribution, pending reviews, refresh and zero generation at 1440/768/390,
plus all existing Mock/import acceptance cases. The first new recovery-test attempt expected an error
code in the UI, whereas the API helper correctly displays the safe error message; the test was corrected
to assert the decode message without changing product behavior. Final full Chromium suite **21/21 PASS**:
11 original Mock cases, 6 direct import cases, 3 Boundary Lock viewport cases and 1 recovery regression.
Final lint/typecheck and secret scan repeated PASS. `git diff --check` PASS. Hosted CI remains offline,
not new model inference.

Docker: NOT TESTED / not applicable. Real ComfyUI: NOT TESTED. Direct OpenAI API: NOT IMPLEMENTED /
NOT TESTED. RunningHub failures: retained unchanged; no new cloud task. Secret scan is a pattern
hygiene check, not a complete security audit. Public evidence contains no keys or private paths.

Implementation commit `13bac7e229c3b3822b52685d8aa74b873ffe803d` Hosted CI **PASS**, both
[push 37350068663](https://github.com/kallist/vowedit/actions/runs/37350068663) and
[PR 37350074911](https://github.com/kallist/vowedit/actions/runs/37350074911); logs verified 153 pytest,
8 Vitest, 21 Chromium. The later user-review/docs-only commit is verified independently at its exact
final head; final report/PR carry that run URL. No CI gate changed. Initial log read hit Windows CLI
cache permissions; approved cache access retrieved logs, without changing source or CI.

## Evidence and review

[Case directory](evidence/imported/blue-jacket-gpt-image) contains immutable raw/original/masks,
historical refusal and raw human review, separate locked assets, normalization/provenance/evaluation,
Ghosts, receipt and before-after/raw-vs-locked comparisons. The new agent/human review and production
UI QA are separate from previous raw-attempt records. Actual production saved-result UI QA PASS at
1440/768/390, all A/B/C/raw/Ghost/receipt inspected, no overflow/page errors/failed API reads, refresh
preserves provenance and pending reviews. Its first local harness attempt used a relative API URL
without baseURL; harness corrected and rerun PASS, with no generation or extra run. Raw-upload QA
served the exact case masks to static demo mask URLs; product default fixtures are unchanged.
Offline screenshots live under
`docs/screenshots/boundary`; they are clearly deterministic fixtures, not model results.

After the actual user reply, final human-reviewed UI readback PASS at 1440/390: all three saved PASS
verdicts/notes displayed, receipt export and refresh verified, no writes/generation during readback,
no page errors/overflow. `human-reviewed-browser-qa.json` and reviewed-receipt screenshots preserve
this separate final phase. No source code changes followed implementation CI; only actual review,
receipt/evaluation snapshots, UI evidence and factual documentation were updated.

Read-only self review checks security/immutability/provenance, failure and retry boundaries, existing
behavior and unchanged scoring. No delegated independent agent review is claimed. Final findings
and production UI checks are recorded after completion. No BLOCKING/IMPORTANT findings remain;
the invalid-replacement state issue and pre-existing Ghost decode race were fixed with behavior tests.
Binary seams may be visible for misaligned future candidates; manual review remains necessary.
