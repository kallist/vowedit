# V0.1 validation evidence

Local Windows validation, 2026-09-28. Node 24.20.0, Python 3.10.6, Next.js 16.3.6,
installed Google Chrome driven by Playwright. This is Mock product evidence, not model evidence.

## Executed gates

| Gate | Result |
| --- | --- |
| Frontend dependency install | PASS, locked dependencies |
| Python editable install and locked dependency inventory | PASS |
| ESLint / Ruff | PASS |
| Next route type generation + TypeScript | PASS |
| mypy | PASS, 10 source files |
| Vitest | PASS, 5 tests |
| pytest | PASS, 66 tests |
| Backend integration subset | PASS, 21 of the 66 tests (18 integration + 3 demo cases) |
| Offline provider transport subset | PASS, 22 of the 66 tests (10 ComfyUI + 12 RunningHub) |
| Next production build, webpack | PASS |
| Playwright | PASS, 7 tests; production frontend + isolated Mock API |
| npm audit | PASS, zero reported vulnerabilities in installed lockfile |
| Repository secret-pattern check | PASS; limited pattern scan, not a penetration test |
| Git whitespace check | PASS |

The pytest suite emits a Starlette deprecation warning about its HTTPX test transport.
Vitest emits a future configuration-loader warning. Neither was suppressed or counted as a test failure.
Initial restricted-shell runs encountered Windows child-process EPERM and unwritable temporary paths;
tests were rerun with permitted child processes and a repository-local pytest basetemp. Assertions were
not weakened. Hosted CI, Linux/macOS execution and Docker execution are NOT TESTED.

## Product-path acceptance

- Full upload → brush CHANGE/KEEP → contract confirmation → three candidates → evaluation/ranking →
  comparison → Ghost View → JSON receipt → saved human-review field → refresh path at all three widths.
- Actual drag/drop, pointer mapping, overlap validation, erase, undo, clear, reset and summary-back masks.
- Injected generation failure can retry from the same contract without repainting. Lost retry responses
  retain the request key across refresh, preventing another run for the same retry.
- Lost initial submission response survives refresh. A second connection failure blocks a new edit
  until recovery retries the original key. Exactly one run is created.
- Near-noop candidates never receive a suggested selection, even when preservation is perfect.
- Backend tests cover concurrent duplicate submissions, conflicting keys, stale jobs, restart recovery,
  partial results, independent evaluation retry, saved output preservation and safe ambiguous-provider states.
- Security cases cover upload decode/type/path/body bounds, hostile Origin/Host, safe error messages,
  output URL allowlisting and absence of API credentials on image-host requests.

Faults exist only in `backend/tests/e2e_app.py`; production Mock has no hidden failure instruction.
E2E human verdicts are scripted form-persistence tests, **not human creative review**.

## Visual QA

27 full-page screenshots: nine states at 1440, 768 and 390 pixels. Browser assertions check horizontal
overflow at each captured stage. Screenshots were also opened and visually inspected, including desktop
landing/Ghost/receipt, tablet editor/failure and mobile landing/Ghost. The mobile grid overflow found
during QA was fixed and recaptured. This is Chromium viewport evidence, not physical-device testing.

| State | 1440 | 768 | 390 |
| --- | --- | --- | --- |
| Landing | [image](screenshots/1440/landing.png) | [image](screenshots/768/landing.png) | [image](screenshots/390/landing.png) |
| Mask editor | [image](screenshots/1440/mask-editor.png) | [image](screenshots/768/mask-editor.png) | [image](screenshots/390/mask-editor.png) |
| Constraint summary | [image](screenshots/1440/constraint-summary.png) | [image](screenshots/768/constraint-summary.png) | [image](screenshots/390/constraint-summary.png) |
| Processing | [image](screenshots/1440/processing.png) | [image](screenshots/768/processing.png) | [image](screenshots/390/processing.png) |
| Result | [image](screenshots/1440/result.png) | [image](screenshots/768/result.png) | [image](screenshots/390/result.png) |
| Candidate comparison | [image](screenshots/1440/candidate-comparison.png) | [image](screenshots/768/candidate-comparison.png) | [image](screenshots/390/candidate-comparison.png) |
| Ghost View | [image](screenshots/1440/ghost-view.png) | [image](screenshots/768/ghost-view.png) | [image](screenshots/390/ghost-view.png) |
| Edit Receipt | [image](screenshots/1440/edit-receipt.png) | [image](screenshots/768/edit-receipt.png) | [image](screenshots/390/edit-receipt.png) |
| Failure | [image](screenshots/1440/failure-state.png) | [image](screenshots/768/failure-state.png) | [image](screenshots/390/failure-state.png) |

## Evidence boundaries

**IMPLEMENTED:** Mock, local ComfyUI and RunningHub adapters; independent evaluator; complete local UI,
durable jobs/assets, history, failure handling, JSON receipts and manual-review persistence.

**TESTED WITH MOCK:** all P0 product paths above; illustration, product and fictional portrait fixtures.
**Offline transport tested:** both real-provider adapters using HTTPX transports with controlled responses.
No network request to a paid generation service was performed.

**TESTED WITH REAL COMFYUI:** none.
**NOT TESTED:** real RunningHub generation, real ComfyUI/model generation, account workflow compatibility,
real creative demos, human quality assessment, hosted CI, cross-platform behavior, accessibility assistive
technology or physical mobile devices. No credentials or compatible local model were available in the
bounded discovery scope. The loopback ComfyUI connection probe actually failed.

**NOT IMPLEMENTED:** automatic identity/semantic/artifact scoring, receipt PNG export, automatic cloud
reconciliation, account/authentication, distributed workers, asset cleanup UI, Docker and video/Motion.
These are outside the accepted Mock V0.1 delivery boundary.

No Git remote was configured. Draft PR and hosted workflow execution are NOT AVAILABLE / NOT RUN;
the repository has not been merged, released or deployed. See [second-pass review](REVIEW.md).
