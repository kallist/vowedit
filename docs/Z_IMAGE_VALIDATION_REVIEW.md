# Z-Image compatibility review and gates — 2026-10-05

Separate read-only pass by the implementing agent. This is not external or independent-agent review.
Actual human semantic feedback is recorded separately with its negative outcome.

## Review

- Scope: only RunningHub exact-host boundary, deterministic tests and required evidence/docs changed
  after f08d30a. UI/service/provider protocol/evaluator/public API/DB schema/dependencies unchanged.
- Graph and mask: fingerprint and only image16/text8/seed4 overrides retained. Real outputs concentrate
  changes in painted jacket, with inside mean differences higher than outside; this is consistent with
  inverse-alpha direction, not a guarantee of no outside drift.
- Download: frozen exact set rh-images.xiaoyaoyou.com / rh-images-tos.xiaoyaoyou.com, explicit user
  approval for the second. No wildcard, HTTPS/default or 443 only, redirects forbidden. API credentials
  never sent to CDN. Existing byte/decode/dimension checks and atomic metadata-stripped storage retained.
- Review tightened two URL edge cases: empty userinfo and an empty fragment delimiter are now rejected.
  Both have deterministic rejection coverage alongside HTTP, other subdomains, credentials and ports.
- Task safety: original smoke task retrieved via fresh outputs; no smoke resubmission. One normal
  product API request generated exactly three distinct seeds. Four creates total including prior smoke.
  No retry, additional creative run, tuning or cherry-picking. All failures and A/B/C retained.
- Real persistence: candidate/Ghost fetch/decode, normal receipt export, independent SQLite reopening,
  existing human review PUT and updated receipt verified. UI QA used completed real data with no paid
  provider registered, so its controls could not cause another cloud task.
- Evaluation: existing pixel formula and A→C→B rank unchanged; selected A remains selected despite its
  recorded human semantic fail. No automatic semantic/identity/artifact claims or human feedback invented.
- Secrets: server-only ignored .env. Exported evidence contains safe task IDs, paths/status/codes/hosts,
  no auth headers, keys, raw response bodies or signed URLs. Actual-key source/client/evidence checks
  and repository pattern gate executed before commit.
- Evidence: pipeline PASS is distinct from semantic FAIL. User preferred A and said it was not cool blue;
  saved review is fail. Full creative case acceptance, B/C human semantics, identity and specialized
  artifacts are not established. Portfolio-ready NO.

Remaining code BLOCKING: **0**. Remaining code IMPORTANT: **0** within fixed-workflow scope.
The observed semantic failure is a documented model result, not a reason to change scoring or tune
the supplied workflow in this task. No merge/tag/release/deployment.

## Local gates

| Gate | Actual result |
| --- | --- |
| Ruff, backend/scripts | PASS |
| mypy, 10 source files | PASS |
| pytest | **106 PASS**, including 51 RunningHub cases; existing Starlette deprecation warning |
| Frontend ESLint/typecheck | PASS |
| Vitest | **5 PASS** |
| Production webpack build | PASS |
| Mock Playwright E2E | **11 PASS**, including five widths and failure/recovery behavior |
| Real saved-data UI QA | PASS, A/B/C/Ghost/reviewed receipt at 1440/390, no page errors/overflow |
| Secret-pattern + actual configured key scan | PASS |
| git diff --check | PASS |
| Docker | NOT TESTED, not added or changed |

Fresh real screenshot inspection confirmed distinct candidate images, provider label, pixel-only
warnings, actual Ghost overlay and persisted human fail verdict. No creative quality acceptance is
inferred from UI QA. Generated replacement Mock screenshots were restored to avoid unrelated churn.
All new real artifacts are required evidence, scoped under docs/evidence/runninghub/2026-10-05.

Windows tests use a repository-local isolated basetemp. Node/browser gates ran with authorized helper
process permissions, without weakening assertions. Current hosted CI must be verified against the
actual pushed head; prior f08d30a green runs do not prove this new exact-host change.
