# V0.1 hardening audit — 2026-10-02

Audit completed before application edits. Starting SHA: `e891f471b5730981730253e4fe6b7bf003fa182f`.
The working tree was clean. Public repository: https://github.com/kallist/vowedit.
After fetch, the only remote branch and GitHub default branch are `feat/vowedit-v0.1`, at that SHA.
There is no `main`, pull request, tag or release. Hardening will use `feat/vowedit-v0.1-hardening`,
based on the actual existing commit, and a Draft PR targeting the existing default branch.

## Current architecture and boundaries

Next.js 16 / React / TypeScript → same-origin FastAPI → ImageEditService → provider protocol.
Pillow/NumPy evaluation is independent. SQLite WAL stores assets, run documents and jobs; PNG files
use UUID names and atomic rename. A process file lock permits one worker per data directory. Unique
request keys, payload hashes, guarded transitions and transactional final ranking protect job state.
No existing architecture will be migrated. No database or public API changes are initially required.

## Hosted failure evidence

[Run 36984653667](https://github.com/kallist/vowedit/actions/runs/36984653667) failed on the starting
SHA. Install, lint/types, unit/integration tests and production build passed. Browser acceptance ran
seven tests: six passed; `no meaningful edit produces no selected candidate` failed at
`e2e/product.spec.ts:311`, waiting five seconds for the final no-good-candidate message.

Downloaded failure screenshot, error context and trace show the application still processing,
three saved candidate images and evaluations pending; the API was responding HTTP 200. It was not
a server-start failure, missing browser or Node action warning. The test asserted terminal result UI
under the default five-second locator deadline without first waiting for durable job completion.
The test provider deliberately spends 0.7 seconds per candidate, with image persistence/evaluation
and frontend polling after that. The fix will synchronize with the bounded job lifecycle and then
retain every no-good-candidate, count, eligibility and receipt assertion. Hosted confirmation is required.

## Claim → code → test → validation matrix

| Claim | Implementation | Existing test evidence | Current boundary |
| --- | --- | --- | --- |
| Upload | backend/api.py, storage.py | integration decode/type/path/body tests; E2E file upload | Previously local-tested; hosted first six tests passed |
| CHANGE / KEEP | frontend/MaskEditor.tsx, masks.ts | coordinate/mask unit tests; pointer E2E | Same; resize audit required |
| Mask validation | evaluation.validate_masks | empty/size/overlap/full-area tests; erase/undo E2E | Existing coverage retained |
| Constraint summary | app/edit/new/page.tsx | full-flow E2E and summary-back stroke preservation | Implemented; one-click fixture currently omits masks |
| Async jobs | services.py, persistence.py | integration state/restart tests; processing E2E | One durable local worker, no fake percentages |
| Mock / three candidates | providers.MockImageEditProvider | deterministic unit test; full-flow E2E | Pixel inversion simulation, no prompt semantics |
| RunningHub | backend/runninghub.py | 12 offline HTTP transport cases | Real generation NOT TESTED |
| Local ComfyUI | backend/providers.py | 10 offline HTTP transport cases | Real generation NOT TESTED |
| Evaluation / ranking | backend/evaluation.py | pixel formula, threshold-before-rounding, violation/noop tests | rgb-mae-v1; no semantic accuracy |
| No good candidate | services.py, ResultPage.tsx | integration passes; hosted E2E lifecycle wait failed | Must fix hosted acceptance synchronization |
| Before/After | frontend/ResultPage.tsx | slider style and candidate switching E2E | Existing local/hosted first-flow evidence |
| Ghost View | evaluation.py, ResultPage.tsx | heatmap alpha tests; actual overlay pixels E2E | CHANGE/KEEP hatches and drift legend exist |
| Receipt | services.receipt, ResultPage.tsx | selected result, metrics/warnings, JSON and review persistence | Human review fields tested by scripts, not human creative verdicts |
| Persistence / refresh | persistence.py, services.py | restart/refresh/lost-response tests | Images survive evaluation failure; orphan-file boundary documented |
| Duplicate generation | Repository.submit, frontend sessionStorage | concurrent service submissions; lost-response E2E | API concurrency and double-click browser checks to strengthen |
| Retry Generation | services.retry_generation | failure + same-contract + response-loss E2E | New linked run; unknown paid task cannot blindly retry |
| Retry Evaluation | services.retry_evaluation | saved images, no provider call, idempotent repeat integration | Browser recovery of evaluation failure not yet covered |
| Upload/security | storage.py, body_limit.py, provider adapters | host/origin/body/path/output-host tests | Limited hygiene scan; no public-service authentication |

## Provider and real-case discovery

Only `.env.example` exists in the project; required RunningHub and ComfyUI environment settings are
absent. Actual loopback `/system_stats` connection failed. Existing provider setup docs describe the
authored fixed graph but do not establish account workflow/model compatibility. No paid calls are
authorized by invented settings; no compatible runtime is available in the inspected project setup.

`demo-assets` contains slot documentation and a manifest, with no user-supplied creative originals or
human verdicts. Public fixtures are intentionally project-owned geometric artwork. They support
Mock cases but cannot be relabeled as real model output or human-reviewed evidence. Real cases will
remain pending with explicit templates and exact completion steps.

## Plan, affected files and risks

1. Fix lifecycle synchronization in E2E and preserve failure artifacts/readiness checks.
2. Add a visibly Mock one-click contract demo, reusing the existing source and mask fixtures;
   touch create-edit/MaskEditor only as needed, preserving brush editability and summary confirmation.
3. Expand E2E to 1440/1024/768/430/390, resize alignment, double-click/refresh and evaluation retry.
4. Re-run all gates; manually inspect the production Mock flow, accessibility and final screenshots.
5. Refresh README/case/provider/review evidence, push, verify exact-SHA hosted CI and create Draft PR.

Risks: changed demo masks must remain editable; rendering/export polarity must stay aligned; async
assertions must fail on real terminal errors; provider failures must not cause duplicate paid work.
Do not tune metric weights/thresholds against outcomes. No new model, account, cloud deployment,
distributed queue, PNG export or V0.2 feature. Portfolio readiness is withheld while mandatory human
creative evidence is missing, regardless of a working Mock demonstration.
