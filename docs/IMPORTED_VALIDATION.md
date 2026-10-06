# Imported candidate delivery — 2026-10-06

Previous head: `73d0450d7208f28a517a18f60efb1cccfd33d3d5`, existing
`feat/vowedit-v0.1-hardening` branch, [PR #1](https://github.com/kallist/vowedit/pull/1).
Audit found the PR OPEN but not Draft; it was explicitly converted back to Draft for this delivery.
The previous head had two successful real hosted Mock CI checks. Remote refs were fetched, no drift.
The project-owned generated output folder was initially untracked; its files are preserved locally
and exact originals copied into committed evidence. User's untracked workflow file is excluded.

## Implemented boundary

- API: safe candidate upload and independent CreateImportedRun → queued evaluation.
- Frontend: Generate/Import source choice, A/B/C uploads, bounded descriptive label, evaluation CTA,
  explicit imported attribution, no generation stage/CTA/retry/duration for imported results.
- Same evaluate/rank/Ghost pipeline. All candidate human reviews can be saved independently without
  changing the suggestion. Null seeds; no provider jobs or fake generation provider.
- Existing SQLite JSON persistence / submission transactions / dedup / worker ownership / retry
  recovery. No table, migration, dependency, provider implementation or evaluation formula changes.
- No cloud generation, merge, tag, release, deployment, V0.2 or automatic resizing in this task.

## Local execution evidence

| Gate | Result |
| --- | --- |
| ruff backend/scripts | PASS |
| mypy backend | PASS, 10 source files |
| pytest | PASS, 133 tests; 27 additional import tests |
| Repository secret-pattern scan | PASS |
| Frontend lint | PASS |
| Frontend typecheck | PASS |
| Vitest | PASS, 8 tests / 2 files |
| Production webpack build | PASS |
| Chromium E2E and import viewport QA | Final 17/17 PASS, including all 11 existing Mock cases |
| git diff --check | PASS |
| Docker | NOT TESTED / not applicable to existing local architecture |
| Real ComfyUI | NOT TESTED |
| Direct OpenAI API integration | NOT IMPLEMENTED / NOT TESTED |

Sandbox Vitest/build initially failed with Windows spawn EPERM. The same actual gates were rerun
with approved subprocess access and passed; no browser substitutes or CI changes. Existing Starlette
TestClient deprecation warning and Vite config-loader future warning remain non-failing, no upgrades.
Offline CI/E2E fixtures are deterministic uploaded assets, never represented as model outputs.

Backend coverage includes asset security/kinds/dimensions, exactly-three/label validation, mask contract,
explicit queued→evaluating→completed with a forbidden generation provider, same metric/Ghost/rank output,
receipt provenance, per-candidate review, repository reopen, concurrent idempotency/conflicts, queued
restart, partial/all-failed evaluation and safe evaluation retry retaining image/ghost identities.
E2E covers all existing 11 Mock cases plus import at 1440/768/390, review of all A/B/C, zero provider
calls, ambiguous response/refresh dedup, size rejection and maximum-length label wrapping.

## Actual external images

Actual built-in imagegen A/B/C: CREATED, all retained, source Codex built-in imagegen. User visual
review: A/B/C PASS, preferred A. Upload/decode/metadata stripping/persistence/readback: PASS.
Actual imported run: rejected, CANDIDATE_SIZE_MISMATCH (1195×1316 versus 640×704).
Actual evaluation/ranking/Ghost/receipt/user-review API storage: NOT TESTED. System selection: NONE.
The user's visual review is preserved in evidence Markdown, not inserted into a nonexistent run.
Controlled external visual success candidate YES; complete evaluated external success case NO;
portfolio-ready and complete success-case interview-ready NO.
[Exact outputs and rejection evidence](evidence/imported/blue-jacket-gpt-image).

## Read-only final review

Reviewed API/schema/service/UI/diff, persisted provenance, boundaries and error/retry behavior.
No imported execution code or remote download input. Existing uploads retain limits and stripping.
Run and queued evaluation commit atomically; asset validation occurs before submission; references
are immutable through the existing API. A rejected upload may leave a safely stored orphan asset,
the existing documented local-storage limitation. No destructive cleanup or schema migration.
No provider generation from imported jobs, no fake jobs/seeds, no scoring changes, no overwritten
RunningHub outputs/reviews. Agent observations and actual user review are separate. Source label
is escaped UI text and described as user attribution, not trusted model provenance.

Visual review fixed radio-control sizing and maximum-label wrapping with behavioral regression.
The subsequent full run exposed that the original generic text-input selector also matched radios,
overriding their size by selector specificity and causing mobile overflow (4 failed / 13 passed).
The selector now excludes radio inputs; no assertion was removed or relaxed. Final rerun is recorded above.
No remaining BLOCKING/IMPORTANT implementation findings; real case dimension mismatch is an explicit
delivery limitation, not bypassed. This is a read-only self-review, not a claim of a separate human reviewer.

## Hosted CI

The repository's unchanged [Mock CI workflow](https://github.com/kallist/vowedit/actions/workflows/ci.yml)
runs all offline gates, including imported E2E. Final exact-head status and run URLs are reported after
push in the delivery report; local PASS is not treated as hosted PASS. No cloud image generation in CI.
