# V0.1 hardening validation — 2026-10-02

Windows, Python 3.10, Node 24, production Next.js webpack build, installed Chrome driven by Playwright.
All generation evidence below is **TESTED WITH MOCK**. No real RunningHub or ComfyUI generation occurred.

| Gate | Executed result |
| --- | --- |
| Ruff | PASS |
| mypy | PASS, 10 source files |
| Backend pytest | PASS, 67 tests; 19 integration + 3 fixture-case tests included |
| Offline provider transports | PASS, 22 tests included in backend total |
| Secret-pattern scan | PASS; bounded hygiene scan |
| ESLint and TypeScript/route types | PASS |
| Vitest | PASS, 5 tests |
| npm audit | PASS, zero reported vulnerabilities |
| Production build | PASS |
| Playwright full suite | PASS, 11 tests in 1.2 minutes |
| Git whitespace | PASS |
| Docker | NOT APPLICABLE; no Docker architecture introduced |

Existing Starlette transport deprecation, Vite future-loader and NO_COLOR warnings remain visible;
none was suppressed. The previous failing no-good-candidate acceptance test was also run twice
independently before the expanded full suite. No assertions or CI gates were removed.

## Behavior proved

Upload, actual pointer CHANGE/KEEP, overlap/empty validation, erase/undo/clear/reset, summary/back,
three outputs, constraints before preference, all-ineligible/no selection, slider/candidate switching,
actual Ghost pixels, selected-result receipt and JSON, scripted review persistence, refresh and history.
Generation failure/retry and lost submission/retry responses retain contracts and request keys.
Twelve concurrent API submissions produce one run and only three outputs; a conflicting payload is 409.
Double-click submits once; active-page refresh retains the run. Evaluation failure preserves three saved
images; Retry Evaluation keeps their IDs and does not increment provider calls. State/restart regression
and partial failure remain covered by existing backend tests.

The new browser evaluation-retry case initially failed because Demo defaults overwrote an instruction
edited while upload was pending. Locking contract fields during preparation fixed the actual UI race;
the unchanged test then passed in the complete suite.

## Visual evidence

45 current screenshots under `docs/screenshots/final/{1440,1024,768,430,390}/`, nine states per width:
landing, mask-editor, constraint-summary, processing, result, candidate-comparison, ghost-view,
edit-receipt, failure-state. Each capture checks page horizontal overflow. Source/canvas bounding boxes
and exported mask pixels remain aligned across all five sizes. Representative images at every width
were opened and inspected: hierarchy, warnings, receipt, drift legend and controls remain visible.
Important explanatory text was increased to 12px, key mode/view controls to 44px targets, mobile form
text to 16px. This is viewport evidence, not physical-device or screen-reader certification.

## Separate interactive production check

After the suite, an independently started production API (`backend.api:create_app`) and production
frontend were inspected step by step in installed Chrome. This was a tool-driven interactive check,
not a human reviewer verdict. Landing → Demo → contract → Generate → B suggested/A inspected → Ghost
→ selected-B receipt → refresh → history worked. A separate original upload and actual pointer
CHANGE/KEEP drawing (4,437 / 4,441 pixels) proceeded through confirmation to three evaluated candidates.
All commands were issued from observed page controls, outside the acceptance suite/fault API.

Tab focus reached Keyboard painting with a visible 3px blue outline. Existing labels, button names,
text-based warnings and reduced-motion CSS were checked. Ink/muted/orange/blue against paper have
computed contrast ratios 14.01/4.97/5.02/6.19; this checks these tokens only, not full WCAG conformance.
Screen readers and physical mobile devices remain NOT TESTED. The Computer Use runtime was unavailable
(trusted-service configuration error), so installed Chrome/Playwright provided this separate check.

Local responsiveness smoke: 640×704 editor navigation load 238ms; a 12-step pointer sequence took 258ms
for CHANGE and 246ms for KEEP. A project-fixture resize to the maximum 1536×1536 upload size was accepted;
its 12-step pointer sequence took 939ms and completed. These include driver/input overhead and are single
local observations, not frame-rate measurements, benchmarks or real-model latency claims. No performance
budget or new optimization is inferred. Temporary runtime data/driver captures remain ignored.

## Evidence limits

Hosted CI must be independently checked against the pushed head in
[Actions](https://github.com/kallist/vowedit/actions/workflows/ci.yml); this local table alone is no proof
of hosted success. Initial remote failure is recorded in [the audit](HARDENING_AUDIT.md).
Browser acceptance uses an isolated API with test-only faults; production has no hidden trigger phrases
or `/api/test/provider-calls` route. Scripted verdict persistence is not human creative review.

Real generation/model/workflow compatibility and the three mandatory human-reviewed creative cases:
**NOT TESTED**. See [provider steps](REAL_PROVIDER_VALIDATION.md) and [case register](DEMO_CASES.md).
Automatic semantic, identity and artifact scoring; receipt PNG; cloud reconciliation; distributed
workers; auth/public deployment; asset cleanup; Docker and Motion: **NOT IMPLEMENTED**.
