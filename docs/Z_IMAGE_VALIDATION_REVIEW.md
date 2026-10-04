# Z-Image compatibility review and local gates — 2026-10-05

This is a separate read-only pass by the implementing agent, not external reviewer approval,
independent-agent review or creative human acceptance.

## Review

- Architecture: UI, public API schema, database schema, service, evaluator and ranking unchanged.
  RunningHub alone uses the supplied Z-Image export; local ComfyUI keeps its existing checkpoint graph.
- Fixed graph: semantic fingerprint covers models, nodes, edges, settings and SaveImage outputs.
  Validation happens before upload. Only image 16/text 8/seed 4 change at runtime. Tests compare the
  complete submitted graph after reverting those three fields, and reject model/edge/setting tampering.
- Mask: preserved RGB plus inverse alpha; tests inspect actual multipart PNG bytes and opaque padding.
  No UI mask polarity or score threshold changes. Actual generated-pixel confirmation is still pending.
- Output: select node 11 even when node 17 is first; preview-only/malformed outputs never download.
- Security: exact HTTPS API origins, strict CDN host, separate unauthenticated download client,
  no redirect following, byte/decode/dimension limits, metadata-stripped storage unchanged.
  Actual CN host mismatch safely failed; no premature allowlist expansion or new paid submission.
- Persistence/concurrency/retries: existing single worker, unique request keys and guarded transactions
  unchanged. Accepted task retained. Same-task retrieval is the pending continuation, not generation retry.
- Secrets: ignored server .env only. Sanitized validation transport recorded path/status/code/node/host;
  no request body, key/header, raw response body or signed URL. Actual configured key scan over repository
  files and production client assets found no matches. No real API calls are imported into tests/CI.
- Evidence: manual web success, real inference attempt/download failure and Mock validation stay separate.
  No image/identity/artifact claim or fabricated human review. The original user export is preserved.

Remaining code BLOCKING: **0**. Remaining code IMPORTANT: **0** within the fixed-workflow boundary.
Required real acceptance remains incomplete: unfamiliar-CDN decision, successful same-task download,
real metrics/visual polarity confirmation, gated three-candidate run and creative human review.

## Local gates actually executed

| Gate | Result |
| --- | --- |
| Ruff, backend/scripts | PASS |
| mypy, 10 backend source files | PASS |
| pytest | **92 PASS**, including 37 RunningHub cases; 1 existing Starlette deprecation warning |
| Frontend ESLint | PASS |
| Frontend typecheck | PASS |
| Vitest | **5 PASS** |
| Production webpack build | PASS |
| Playwright Mock product suite | **11 PASS**, 1440/1024/768/430/390 and failure/recovery paths |
| Secret-pattern scan | PASS |
| Actual server key scan, source/client bundle | PASS, no values printed |
| git diff --check | PASS |
| Docker | NOT TESTED; not introduced or changed |

Initial pytest attempts encountered the Windows default temporary-directory permissions boundary;
rerunning with a repository-local isolated basetemp passed. Initial Vitest/build attempts hit sandbox
spawn EPERM; authorized execution outside the sandbox passed unchanged checks. No gates were weakened.

Fresh Mock screenshot QA inspected desktop comparison and narrow mobile Ghost/receipt states:
controls, ranked cards, disclosures and selected-versus-inspected result remained readable. This is
agent visual QA of Mock, not real-model human review. Test-generated replacement screenshots were
restored to avoid unrelated evidence churn; two local QA samples remain outside Git.

Hosted verification will be checked separately against the actual pushed commit. Previous HEAD's CI
success is not used as proof for this diff. PR #1 must remain Draft, with no merge/tag/release.
